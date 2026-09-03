import Foundation
import HealthKit

// Volt's HealthKit bridge. This is the reason the native shell exists.
//
// HealthKit hands us the data a PWA can never read — sleep, HRV, resting HR,
// steps, active energy, and every Watch workout — and, via background delivery,
// wakes the app when new samples land (i.e. when the Watch syncs). Each wake
// aggregates the last week per local day and POSTs it in the exact shape the
// server already accepts from Health Auto Export, so nothing server-side had to
// change to retire HAE. Workouts go to /api/workouts/ingest, where runs become
// run logs and strength sessions become "detected sessions" to confirm.
//
// No JS involved: this runs from AppDelegate, so it works with the web view
// asleep or the app in the background.
final class HealthSync {
  static let shared = HealthSync()

  private let store = HKHealthStore()
  private let base = URL(string: "https://holistic-health-coaching.vercel.app")!
  private let queue = DispatchQueue(label: "volt.healthsync")
  private var observing = false

  private let hrv = HKQuantityType(.heartRateVariabilitySDNN)
  private let rhr = HKQuantityType(.restingHeartRate)
  private let steps = HKQuantityType(.stepCount)
  private let energy = HKQuantityType(.activeEnergyBurned)
  private let sleep = HKCategoryType(.sleepAnalysis)
  private let workouts = HKObjectType.workoutType()

  private var sampleTypes: [HKSampleType] { [hrv, rhr, steps, energy, sleep, workouts] }

  /// Ask once, then start background delivery + an initial sync.
  func start() {
    guard HKHealthStore.isHealthDataAvailable() else { return }
    let read: Set<HKObjectType> = Set(sampleTypes.map { $0 as HKObjectType })
    store.requestAuthorization(toShare: nil, read: read) { granted, _ in
      guard granted else { return }
      self.enableBackgroundDelivery()
      self.syncAll(reason: "launch") { }
    }
  }

  /// iOS wakes us when new samples arrive (hourly at most). The observer's
  /// completion handler MUST be called or iOS stops delivering.
  private func enableBackgroundDelivery() {
    guard !observing else { return }
    observing = true
    for type in sampleTypes {
      store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
      let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, _ in
        self?.syncAll(reason: "observer:\(type.identifier)") { completion() }
      }
      store.execute(query)
    }
  }

  // MARK: - Sync

  private var inFlight = false
  private var lastSyncAt: Date?
  private var waiters: [() -> Void] = []

  /// Coalesced: six observers register at once and each fires its initial
  /// callback, and a foreground follows a launch — without this the same
  /// 7-day payload posted five times in 100ms. One sync at a time; callers
  /// arriving while one runs share its completion; a sync that finished in the
  /// last 20s is not repeated (the observer's completion is still honored).
  func syncAll(reason: String, done: @escaping () -> Void) {
    queue.async {
      if self.inFlight { self.waiters.append(done); return }
      if let t = self.lastSyncAt, Date().timeIntervalSince(t) < 20 { done(); return }
      self.inFlight = true
      let group = DispatchGroup()
      group.enter(); self.syncMetrics { group.leave() }
      group.enter(); self.syncWorkouts { group.leave() }
      group.notify(queue: self.queue) {
        self.inFlight = false
        self.lastSyncAt = Date()
        let ws = self.waiters; self.waiters = []
        done(); ws.forEach { $0() }
      }
    }
  }

  // MARK: Metrics → /api/health (HAE-shaped payload)

  private struct DayAgg {
    var steps: Double = 0
    var energy: Double = 0
    var rhr: [Double] = []
    var hrv: [Double] = []
    var sleepSeconds: Double = 0
  }

  private func syncMetrics(done: @escaping () -> Void) {
    let cal = Calendar.current
    let end = Date()
    let start = cal.date(byAdding: .day, value: -7, to: cal.startOfDay(for: end))!
    var days: [String: DayAgg] = [:]
    let lock = NSLock()
    func day(_ d: Date) -> String {
      let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current
      return f.string(from: d)
    }
    func upd(_ key: String, _ f: (inout DayAgg) -> Void) {
      lock.lock(); var a = days[key] ?? DayAgg(); f(&a); days[key] = a; lock.unlock()
    }

    let group = DispatchGroup()

    // Steps + energy: daily sums via statistics (dedupes Watch/phone overlap).
    for (type, unit, isSteps) in [(steps, HKUnit.count(), true), (energy, HKUnit.kilocalorie(), false)] {
      group.enter()
      var comps = DateComponents(); comps.day = 1
      let q = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: end), options: .cumulativeSum, anchorDate: cal.startOfDay(for: end), intervalComponents: comps)
      q.initialResultsHandler = { _, coll, _ in
        coll?.enumerateStatistics(from: start, to: end) { s, _ in
          if let v = s.sumQuantity()?.doubleValue(for: unit), v > 0 {
            upd(day(s.startDate)) { if isSteps { $0.steps += v } else { $0.energy += v } }
          }
        }
        group.leave()
      }
      store.execute(q)
    }

    // RHR + HRV: per-sample, averaged per day server-side (we send each sample).
    for (type, unit, isRHR) in [(rhr, HKUnit.count().unitDivided(by: .minute()), true), (hrv, HKUnit.secondUnit(with: .milli), false)] {
      group.enter()
      let q = HKSampleQuery(sampleType: type, predicate: HKQuery.predicateForSamples(withStart: start, end: end), limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
        for s in (samples as? [HKQuantitySample]) ?? [] {
          let v = s.quantity.doubleValue(for: unit)
          upd(day(s.startDate)) { if isRHR { $0.rhr.append(v) } else { $0.hrv.append(v) } }
        }
        group.leave()
      }
      store.execute(q)
    }

    // Sleep: asleep stages only, as a UNION of intervals. The Watch writes
    // core/deep/REM segments and the phone (or a third-party app) writes its own
    // overlapping samples — summing them all produced 18-hour nights. Merge
    // overlaps, then credit each merged block to the day it ends (wake day).
    group.enter()
    let sq = HKSampleQuery(sampleType: sleep, predicate: HKQuery.predicateForSamples(withStart: start, end: end), limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
      let asleep: Set<Int> = [
        HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
        HKCategoryValueSleepAnalysis.asleepCore.rawValue,
        HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
        HKCategoryValueSleepAnalysis.asleepREM.rawValue,
      ]
      var ivs: [(Date, Date)] = ((samples as? [HKCategorySample]) ?? [])
        .filter { asleep.contains($0.value) }
        .map { ($0.startDate, $0.endDate) }
      ivs.sort { $0.0 < $1.0 }
      var merged: [(Date, Date)] = []
      for iv in ivs {
        if let last = merged.last, iv.0 <= last.1 {
          merged[merged.count - 1].1 = max(last.1, iv.1)
        } else {
          merged.append(iv)
        }
      }
      for m in merged {
        upd(day(m.1)) { $0.sleepSeconds += m.1.timeIntervalSince(m.0) }
      }
      group.leave()
    }
    store.execute(sq)

    group.notify(queue: queue) {
      var metrics: [[String: Any]] = []
      func metric(_ name: String, _ units: String, _ points: [[String: Any]]) {
        if !points.isEmpty { metrics.append(["name": name, "units": units, "data": points]) }
      }
      let keys = days.keys.sorted()
      metric("step_count", "count", keys.compactMap { k in days[k]!.steps > 0 ? ["date": "\(k) 00:00:00", "qty": days[k]!.steps.rounded()] : nil })
      metric("active_energy", "kcal", keys.compactMap { k in days[k]!.energy > 0 ? ["date": "\(k) 00:00:00", "qty": days[k]!.energy.rounded()] : nil })
      metric("resting_heart_rate", "count/min", keys.flatMap { k in days[k]!.rhr.map { ["date": "\(k) 00:00:00", "qty": $0] } })
      metric("heart_rate_variability", "ms", keys.flatMap { k in days[k]!.hrv.map { ["date": "\(k) 00:00:00", "qty": $0] } })
      metric("sleep_analysis", "hr", keys.compactMap { k in days[k]!.sleepSeconds > 0 ? ["date": "\(k) 00:00:00", "totalSleep": (days[k]!.sleepSeconds / 3600 * 100).rounded() / 100] : nil })

      guard !metrics.isEmpty else { done(); return }
      self.post(path: "/api/health", body: ["source": "healthkit", "data": ["metrics": metrics]], done: done)
    }
  }

  // MARK: Workouts → /api/workouts/ingest

  private func syncWorkouts(done: @escaping () -> Void) {
    let cal = Calendar.current
    let start = cal.date(byAdding: .day, value: -14, to: Date())!
    let q = HKSampleQuery(sampleType: workouts, predicate: HKQuery.predicateForSamples(withStart: start, end: Date()), limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]) { _, samples, _ in
      let iso = ISO8601DateFormatter()
      var out: [[String: Any]] = []
      for w in (samples as? [HKWorkout]) ?? [] {
        let kind: String
        switch w.workoutActivityType {
        case .running: kind = "running"
        case .walking, .hiking: kind = "walking"
        case .cycling: kind = "cycling"
        case .traditionalStrengthTraining, .functionalStrengthTraining: kind = "strength"
        case .swimming: kind = "swimming"
        case .elliptical, .rowing, .stairClimbing: kind = "cardio"
        default: kind = "other"
        }
        let local = DateFormatter(); local.dateFormat = "yyyy-MM-dd"; local.timeZone = .current
        var item: [String: Any] = [
          "uuid": w.uuid.uuidString,
          "type": kind,
          // The calendar day in HER timezone — the server must not derive this
          // from the UTC instant (an evening run would land on tomorrow).
          "local_date": local.string(from: w.startDate),
          "start": iso.string(from: w.startDate),
          "end": iso.string(from: w.endDate),
          "duration_s": Int(w.duration.rounded()),
        ]
        if let d = w.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()?.doubleValue(for: .mile()) ?? w.statistics(for: HKQuantityType(.distanceCycling))?.sumQuantity()?.doubleValue(for: .mile()), d > 0 {
          item["distance_mi"] = (d * 100).rounded() / 100
        }
        if let hr = w.statistics(for: HKQuantityType(.heartRate))?.averageQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute())) {
          item["avg_hr"] = Int(hr.rounded())
        }
        if let kcal = w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie()) {
          item["energy_kcal"] = Int(kcal.rounded())
        }
        out.append(item)
      }
      guard !out.isEmpty else { done(); return }
      self.post(path: "/api/workouts/ingest", body: ["workouts": out], done: done)
    }
    store.execute(q)
  }

  // MARK: HTTP

  private func post(path: String, body: [String: Any], done: @escaping () -> Void) {
    guard let data = try? JSONSerialization.data(withJSONObject: body) else { done(); return }
    var req = URLRequest(url: base.appendingPathComponent(path))
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Volt-iOS/1 HealthKit", forHTTPHeaderField: "User-Agent")
    req.httpBody = data
    req.timeoutInterval = 25
    URLSession.shared.dataTask(with: req) { _, _, _ in done() }.resume()
  }
}
