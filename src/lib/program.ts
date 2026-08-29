// Program content ported verbatim from the v1 WorkoutTracker (deleted; see git
// history). This file is the single source of truth for the athlete's program.
// Coach-prescribed content — edit deliberately.

import type { Light } from "@/components/ui";

export const PHASE = "Phase 4: Hybrid Performance — Aerobic Base, Strength Held";
export const PHASE_DATES = "July 19, 2026 onward";

/**
 * Exercise priority within a session (Phase 4 revision, 2026-08-24):
 *   A — Essential: defines a successfully completed session. Tier A alone is a
 *       valid ("minimum effective") session on a limited day.
 *   B — Useful: complete when readiness and time allow.
 *   C — Optional: accessories, mobility, extra trunk/durability work. Never
 *       required for the workout to count as complete.
 * Undefined tier (C1/G1 optional sessions) is treated as essential by the UI.
 */
export type Tier = "A" | "B" | "C";

export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  target: string;
  note?: string;
  /** false → no lbs field */
  weighted?: boolean;
  /** true → duration text field per set instead of reps */
  timed?: boolean;
  /** Priority within the session — governs completion semantics and the UI. */
  tier?: Tier;
  /** Prescribed rest between hard sets, e.g. "2.5–3 min", "60–90 sec". Feeds the
   *  pre-session duration estimate; do not shorten compound rest to save time. */
  rest?: string;
  /**
   * How this lift is loaded. "assistance" is the one that matters: the machine
   * takes weight OFF her, so a lower number is harder and progress runs
   * downward. Logging it as `weight` would make the coach read progress
   * backwards. Defaults to external/bodyweight per `weighted`.
   */
  loadType?: "external" | "assistance" | "bodyweight" | "timed";
};

export type SessionKey = "L1" | "U1" | "L2" | "U2" | "C1" | "G1";

export type Session = {
  label: string;
  subtitle: string;
  exercises: Exercise[];
  cooldown: string[];
};

export const PT_CIRCUIT = [
  { name: "Dynamic Hamstring Sweep", sets: 2, reps: "2 reps", note: "10 ft. Back & forth = 1 rep." },
  { name: "Resisted Clamshell — Left", sets: 3, reps: "12 reps", note: "5-sec hold at top." },
  { name: "Resisted Clamshell — Right", sets: 3, reps: "12 reps", note: "5-sec hold at top." },
  { name: "Standing Heel Raise", sets: 3, reps: "12 reps", note: "Use support if needed." },
  { name: "Resisted TKE — Left", sets: 3, reps: "12 reps", note: "Full extension, VMO squeeze." },
];

export const EXERCISE_THERAPY = [
  { name: "Ankle CARs — Right", duration: "60 sec", note: "Slow full circles, max ROM, both directions." },
  { name: "Ankle CARs — Left", duration: "60 sec", note: "Slow full circles, max ROM, both directions." },
  { name: "Short-Foot Exercise — Right", duration: "45 sec", note: "Scrunch toes toward heel. Builds plantar intrinsics. Key for pronation." },
  { name: "Banded Ankle Distraction — Right", duration: "60 sec", note: "Band at lower shin, step into dorsiflexion. Reduces morning stiffness." },
  { name: "Kickstand RDL", duration: "3 min 30 sec", note: "Left emphasis." },
  { name: "Standing Groin Stretch", duration: "1 min 15 sec" },
  { name: "Forward Step Up", duration: "1 min 45 sec" },
  { name: "Toe Raises (Tibialis Anterior)", duration: "60 sec", note: "Lift forefoot, hold 2 sec. Supports medial arch." },
];

export const RUN_WARMUP = {
  steps: [
    { step: 1, name: "Brisk Walk", dose: "2–3 min", note: "Raise tissue temperature. Check gait symmetry — does anything feel off before you start?" },
    { step: 2, name: "Short-Foot Exercise", dose: "2 × 20–30 sec", note: "Scrunch toes toward heel. Wake up arch control and foot intrinsics. Right foot first." },
    { step: 3, name: "Tibialis Raises", dose: "2 × 10–15 reps", note: "Lift forefoot, 2-sec hold. Prep shin/ankle control and reduce pronation collapse." },
    { step: 4, name: "Ankle CARs", dose: "5 each direction/side", note: "Slow full circles, max ROM. Controlled ankle mobility and joint awareness." },
    { step: 5, name: "Single-Leg Calf Raise", dose: "1 × 10/side", note: "Right side first. Activate calf and posterior tibial system before loading." },
    { step: 6, name: "Standing March", dose: "20–30 yd", note: "Tall posture, hip flexion, foot placement. Sets rhythm before running." },
    { step: 7, name: "Low-Intensity A-Skip", dose: "1–2 short passes", note: "Running rhythm and elastic coordination. Keep it easy." },
    { step: 8, name: "Walk-to-Jog Build-Up", dose: "2 rounds: 20 sec walk + 20 sec jog", note: "Final ankle/knee/gait check before the run. If anything feels wrong here, flag it." },
  ],
  ifStiff: [
    { name: "Straight-Knee Calf Stretch", dose: "30 sec/side", note: "Only if ankle feels stiff before the run. Light and preparatory — not a long hold." },
    { name: "Bent-Knee Soleus Stretch", dose: "30 sec/side", note: "Only if ankle feels stiff. Soleus sits deep — bend the knee slightly to target it." },
  ],
};

export const RUN_COOLDOWN_STEPS = [
  { step: 1, name: "Easy Walk", dose: "3–5 min", note: "Normalize breathing, heart rate, and gait before stretching." },
  { step: 2, name: "Straight-Knee Calf Stretch", dose: "45–60 sec/side", note: "Gastrocnemius recovery. Right side gets extra attention." },
  { step: 3, name: "Bent-Knee Soleus Stretch", dose: "45–60 sec/side", note: "Soleus and posterior ankle recovery. Bend knee slightly." },
  { step: 4, name: "Plantar Fascia Stretch", dose: "30 sec/side", note: "Reduce arch irritation. Toe extension against floor or hand." },
  { step: 5, name: "Half-Kneeling Hip Flexor Stretch", dose: "30–45 sec/side", note: "Restore hip extension after running. Tall posture, no arch." },
  { step: 6, name: "Figure-4 Glute Stretch", dose: "30–45 sec/side", note: "Glute and piriformis reset. Tighter side first." },
];

export const RUN_DURABILITY = [
  { name: "Seated Calf Raise", dose: "3 × 10–15", note: "Soleus and calf capacity for running durability. Slow eccentric." },
  { name: "Tibialis Raise", dose: "2–3 × 15–20", note: "Shin strength and ankle control. 2-sec hold at top." },
];

export const SESSIONS: Record<SessionKey, Session> = {
  L1: {
    label: "Lower Strength",
    subtitle: "Knee + Ankle Priority",
    exercises: [
      // Tier A — essential
      { id: "l1_rdl", name: "Romanian Deadlift (BB)", sets: 4, reps: "5–7 reps", target: "150 lbs", tier: "A", rest: "2.5–3 min", note: "Primary strength lift. Hold ~150 for 4×5–7; progress the load only after you own the top of the range clean at ~2 RIR — no grinders, no testing a max. Hip hinge, flat back, bar close; drive the hips forward and finish with the glutes, not the low back. If the back rounds or you feel it in the low back, the load's too high for that day. Stop a rep short if the last set isn't there." },
      { id: "l1_leg_press", name: "Leg Press", sets: 3, reps: "8–10 reps", target: "255 lbs", tier: "A", rest: "2–3 min", note: "Strength range now — 3×8–10 (was 4×12). Pick a load for ~1–2 RIR. Feet high, stop at 90°, knee tracks straight and stays quiet throughout. Progress only when all three sets reach the top of the range clean." },
      { id: "l1_leg_curl", name: "Leg Curl", sets: 3, reps: "8–12 reps", target: "70 lbs", tier: "A", rest: "75–90 sec", note: "Keep the 3-sec eccentric — the slow lower is the knee's protective factor, so quality governs the load. Hamstring resilience for running." },
      // Tier B — useful
      { id: "l1_leg_ext", name: "Leg Extension (top 30° only)", sets: 2, reps: "10–15 reps", target: "120 lbs", tier: "B", rest: "60–90 sec", note: "Down to 2 sets — the leg press already supplies plenty of quad volume. Protected-ROM protocol stays: top-30° range only, non-negotiable, controlled throughout." },
      { id: "l1_calf_raise", name: "Calf Raise", sets: 3, reps: "10–15 reps", target: "Loaded", tier: "B", rest: "60–90 sec", note: "Kept because calf/ankle capacity is high-value for running durability. Full range, 3-sec lowering. Posterior tibial tendon resilience.", weighted: true },
      // Tier C — optional durability (never let these turn L1 into a 70+ min session)
      { id: "l1_pt_band", name: "Banded Foot Adduction / Inversion", sets: 3, reps: "15 each foot", target: "Light band", tier: "C", rest: "45–60 sec", note: "Optional posterior-tibial tendon loading (Kulig protocol) — run-readiness insurance when the ankle wants attention. Band around forefoot, pull inward and down, 3-sec slow return. Right foot first, supportive shoes.", weighted: false },
      { id: "l1_cars", name: "Ankle CARs", sets: 2, reps: "5 each direction/side", target: "Bodyweight", tier: "C", rest: "—", note: "Optional. Controlled ankle circles, full range, slow. Mobility + joint awareness. Right ankle first.", weighted: false },
      { id: "l1_balance", name: "Single-Leg Balance — Board", sets: 3, reps: "45 sec each leg", target: "Eyes closed", tier: "C", rest: "—", note: "Optional. Right foot first, eyes closed when stable. Ankle proprioception.", weighted: false, timed: true },
    ],
    cooldown: [
      "Standing Quad Stretch — 45 sec each leg",
      "Seated Hamstring Stretch — 45 sec each leg",
      "Calf Stretch — 60 sec each leg (straight + bent knee)",
    ],
  },
  U1: {
    label: "Upper Strength",
    subtitle: "Pull-Up Priority",
    exercises: [
      // Tier A — essential (pull-up ALWAYS first)
      { id: "u1_pullup", name: "Assisted Pull-Up", sets: 4, reps: "4–6 reps", target: "44 lb assist", tier: "A", rest: "2–3 min", note: "Always first — the biggest upper-body opportunity. LOG THE ASSISTANCE every set: '4×6' means nothing without it, and it's the number that has to come down. When you hit 4×6 clean at the current assist with ~1–2 RIR, drop the assistance by the smallest machine increment and rebuild within 4–6. Don't drop it if reps fall below 4 or the last set turns into a grinder. Full hang, chin over bar. Chipping toward a first strict pull-up.", weighted: false, loadType: "assistance" },
      { id: "u1_bench", name: "Barbell Bench Press", sets: 3, reps: "6–8 reps", target: "70 lbs", tier: "A", rest: "2–3 min", note: "3 sets now (was 4). Hold 70 for 6–8 until every set is clean at ~2 RIR, then take 75 (double progression). No testing, no grinders." },
      { id: "u1_ohp", name: "Barbell Overhead Press", sets: 3, reps: "6–8 reps", target: "50 lbs", tier: "A", rest: "2–3 min", note: "Working weight 50. Do NOT force 55 on a low-readiness day. Ribs down, squeeze glutes, don't lean back into the low back. ~2 RIR." },
      // Tier B — useful
      { id: "u1_row", name: "Machine Row", sets: 3, reps: "8–12 reps", target: "85 lbs", tier: "B", rest: "75–90 sec", note: "Fixed ROM removes the elbow tug of DB rows. Squeeze the shoulder blades, controlled return." },
      { id: "u1_face_pull", name: "Face Pull", sets: 2, reps: "15–20 reps", target: "Light cable/band", tier: "B", rest: "45–75 sec", note: "Shoulder/scapular health — rotator cuff, lower traps, rear delts, posture. Rope or band at eye height, pull to the forehead, elbows high, external-rotate at the end. Light and strict.", weighted: false },
      // Tier C — optional trunk
      { id: "u1_llr", name: "Lying Leg Raise", sets: 2, reps: "10–15 reps", target: "Bodyweight", tier: "C", rest: "45–75 sec", note: "Optional trunk work. Lower back pinned to the floor throughout — if it arches, bend the knees. Lower slowly, no momentum.", weighted: false },
    ],
    cooldown: [
      "Doorway Chest Stretch — 40 sec each side",
      "Cross-Body Shoulder Stretch — 40 sec each side",
      "Child's Pose + Lat Reach — 45 sec each side",
    ],
  },
  L2: {
    label: "Lower Hypertrophy",
    subtitle: "Unilateral + Posterior Chain",
    exercises: [
      // Tier A — essential
      { id: "l2_rdl", name: "Romanian Deadlift (BB)", sets: 3, reps: "10–12 reps", target: "95 lbs", tier: "A", rest: "90–120 sec", note: "Hypertrophy RDL — lighter than L1, higher reps, controlled tempo. This is NOT the L1 150-lb strength load; keep it around 95. Feel the hamstring stretch under load, then drive the hips forward and finish with the glutes, not the low back." },
      { id: "l2_rev_lunge", name: "Reverse Lunge", sets: 3, reps: "8–12 each leg", target: "Bodyweight → DBs", tier: "A", rest: "90–120 sec", note: "Unilateral anchor — attacks the left/right asymmetry. Step BACK, not forward, to keep weight over the front heel and minimize knee shear (knee-rehab friendly). Control depth, don't chase range; hold a rack lightly if balance needs it. Add DBs conservatively once 3×10 each leg is steady." },
      { id: "l2_hip_thrust", name: "Barbell / Machine Hip Thrust", sets: 3, reps: "8–12 reps", target: "Loaded", tier: "A", rest: "90–120 sec", note: "The week's hip-thrust home now — not on both lower days. Glute engine for running economy, pelvic stability, injury resilience; hip-dominant and knee-friendly. Ribs down, full hip extension, hard top squeeze, 2–3 sec lower; drive with the glutes, never the low back. Machine if available, else loaded bridge with a padded plate/DB across the hips.", weighted: true },
      // Tier B — useful
      { id: "l2_leg_curl", name: "Leg Curl", sets: 2, reps: "10–15 reps", target: "70 lbs", tier: "B", rest: "60–90 sec", note: "2 sets is enough here — hamstrings are already worked from the RDL. Add a 3rd only if they're fresh. Keep the 3-sec eccentric." },
      { id: "l2_hip_abd", name: "Hip Abduction / Adduction", sets: 2, reps: "12–20 reps", target: "75 lbs", tier: "B", rest: "45–75 sec", note: "Low-cost finisher. Both directions, 2-sec hold at peak, slow return. Glute medius + adductor. Lean torso slightly forward on abduction to bias glute over TFL." },
    ],
    cooldown: [
      "Pigeon / Figure-4 — 60 sec tighter side, 30 sec other",
      "Standing Quad Stretch — 45 sec each leg",
      "Seated Hamstring Stretch — 45 sec each leg",
    ],
  },
  U2: {
    label: "Upper Hypertrophy",
    subtitle: "Volume + Supersets",
    exercises: [
      // Tier A — essential
      { id: "u2_lat_pull", name: "Lat Pulldown", sets: 3, reps: "8–12 reps", target: "75–85 lbs", tier: "A", rest: "75–90 sec", note: "Lock in full ROM at the top of the range before nudging up. Rep quality over load. Next milestone 100." },
      { id: "u2_chest", name: "Chest Press", sets: 3, reps: "10–15 reps", target: "25 lbs", tier: "A", rest: "superset w/ row", note: "Superset with the row (non-competing — saves time). Hypertrophy focus, controlled tempo. Move up when the last 2 reps of each set stay clean." },
      { id: "u2_row", name: "Machine / Cable Row", sets: 3, reps: "10–15 reps", target: "Lighter than U1", tier: "A", rest: "superset w/ chest press", note: "Superset with chest press. Fixed ROM, hypertrophy focus — lighter than the U1 strength row, higher reps, controlled. Squeeze the shoulder blades." },
      // Tier B — useful
      { id: "u2_lat_raise", name: "Lateral Raise (DB)", sets: 3, reps: "12–20 reps", target: "10 lbs", tier: "B", rest: "superset w/ curls", note: "Superset with the biceps curl. Light, strict, no swing — lead with the elbows." },
      { id: "u2_bicep", name: "Bicep Curl (DB, supinated)", sets: 3, reps: "10–15 reps", target: "17.5 lbs", tier: "B", rest: "superset w/ lateral raise", note: "Superset with lateral raises. Full ROM, no swing. Move up when all sets are clean." },
      // Tier C — optional
      { id: "u2_tricep", name: "Triceps (machine/cable)", sets: 2, reps: "10–15 reps", target: "55 lbs", tier: "C", rest: "45–75 sec", note: "Optional — add when time and readiness allow. Machine or cable to protect the prior elbow tweak; flag if elbow pull returns." },
    ],
    cooldown: [
      "Doorway Chest Stretch — 40 sec each side",
      "Child's Pose + Lat Reach — 45 sec each side",
      "Seated Spinal Twist — 45 sec each side",
    ],
  },
  C1: {
    label: "Core + Stability",
    subtitle: "Zone 2 Day Core",
    exercises: [
      { id: "c1_dead_bug", name: "Dead Bugs", sets: 3, reps: "10 each side", target: "Bodyweight", note: "Anti-extension. Exhale fully, lower back pressed to floor throughout. Slow and controlled.", weighted: false },
      { id: "c1_pallof", name: "Pallof Press", sets: 3, reps: "10 each side", target: "Light cable/band", note: "Anti-rotation. Press out, hold 2 sec, resist the pull. Hips and shoulders square.", weighted: false },
      { id: "c1_side_plank", name: "Side Plank", sets: 3, reps: "30–45 sec each side", target: "Bodyweight", note: "Anti-lateral-flexion. Stack hips, straight line head to heel. Hip dips when 45 sec is easy.", weighted: false, timed: true },
      { id: "c1_bird_dog", name: "Bird Dog", sets: 3, reps: "8 each side", target: "Bodyweight", note: "Anti-rotation + stability. Opposite arm and leg, no hip rotation, pause 2 sec at extension.", weighted: false },
      { id: "c1_rev_crunch", name: "Reverse Crunch", sets: 3, reps: "12–15 reps", target: "Bodyweight", note: "Lower-ab flexion, controlled. Posterior pelvic tilt, no momentum. Lower slowly.", weighted: false },
      { id: "c1_glute_brdg", name: "Glute Bridge / Hip Thrust", sets: 3, reps: "10–12 reps", target: "Bodyweight → loaded", note: "Same 3-rung progression as L2 but kept MODERATE here — this is the Zone 2 day, so glute volume not max load. RUNG 1 bodyweight floor bridge, RUNG 2 plate/DB across hips (padded), RUNG 3 hip thrust machine (form session first, ribs down, squeeze with glutes not low back). Drive through heels, full hip extension, hard top squeeze, controlled lower. VARIATION: single-leg bodyweight, 12 each leg, for the left-right asymmetry.", weighted: true },
      { id: "c1_hip_abd", name: "Hip Abduction (machine)", sets: 3, reps: "12–15 reps", target: "Moderate load", note: "Glute medius — the shaping/rounding piece, not the bulk. 2-sec hold at peak, slow return. Lean torso slightly forward to bias glute over TFL. Moderate load on the Zone 2 day; this is not where you chase a PR.", weighted: true },
      { id: "c1_balance", name: "Single-Leg Balance — Board", sets: 3, reps: "45 sec each leg", target: "Eyes closed", note: "Right foot first. Eyes closed when stable. Ankle proprioception.", weighted: false, timed: true },
    ],
    cooldown: [
      "Child's Pose — 60 sec",
      "Supine Spinal Twist — 45 sec each side",
      "Figure-4 Glute Stretch — 45 sec each side",
    ],
  },
  G1: {
    label: "Glute Focus (4th session)",
    subtitle: "Your fourth day — when recovery is clearly there",
    exercises: [
      { id: "g1_note", name: "READ FIRST — when to run this", sets: 1, reps: "—", target: "4th session", note: "This is the fourth strength/accessory session you're aiming for each cycle — run it when recovery capacity is clearly available (joints quiet, energy good, not already stacked on hard days). It's still the FIRST thing to drop: skip it during run-volume build-ups, deload weeks, or any stretch already at your hard-session ceiling. If adding it would make the cycle harder instead of better, don't. ~25–30 min, hip-dominant and knee-friendly throughout.", weighted: false },
      { id: "g1_hip_thrust", name: "Glute Bridge / Hip Thrust", sets: 4, reps: "8–12 reps", target: "Bodyweight → loaded", note: "The main event on this day. Same 3-rung progression — bodyweight floor bridge, then loaded (padded plate/DB), then machine. Heavier and higher set count than the C1/L2 versions since this day is built around it. Ribs down, full hip extension, hard top squeeze, 2–3 sec lower. Knee-friendly: hip-dominant, minimal knee shear.", weighted: true },
      { id: "g1_split_sq", name: "Rear-Foot-Elevated Split Squat", sets: 3, reps: "8–10 each leg", target: "Bodyweight → DBs", note: "Single-leg glute and quad under stretch. Rear foot on a low bench, torso slightly forward to bias glute, knee tracks over mid-foot, do not let it cave in. KNEE NOTE: control depth, stop short of any left-knee pinch — this is more knee-involved than the bridge, so ease in and back off if the knee talks. Hold a rack lightly for balance if needed.", weighted: true },
      { id: "g1_hip_abd", name: "Hip Abduction (machine)", sets: 3, reps: "12–15 reps", target: "Moderate-heavy", note: "Glute medius shaping. 2-sec hold at peak, slow return. Lean torso slightly forward to bias glute over TFL. Can go a touch heavier here than on the C1 day.", weighted: true },
      { id: "g1_kickback", name: "Cable / Banded Glute Kickback", sets: 3, reps: "12–15 each leg", target: "Light-moderate", note: "Hip extension isolation. Squeeze at the top, no lower-back arch — the movement is at the hip, not the spine. Slow return. Good end-of-session burnout that keeps load off the knee entirely.", weighted: true },
      { id: "g1_frog", name: "Frog Pump", sets: 2, reps: "20–25 reps", target: "Bodyweight → plate", note: "Finisher. Soles of feet together, knees out, pump the hips up with a hard squeeze. High-rep glute burnout, near-zero knee involvement. Add a light plate on the hips once bodyweight is easy.", weighted: true },
    ],
    cooldown: [
      "Figure-4 Glute Stretch — 60 sec tighter side, 30 sec other",
      "Half-Kneeling Hip Flexor Stretch — 45 sec each side",
      "Pigeon — 45 sec each side",
    ],
  },
};

export const SESSION_ORDER: SessionKey[] = ["L1", "U1", "C1", "L2", "U2", "G1"];

// ─── Rolling training model ──────────────────────────────────────────────────
//
// Phase 4 dropped fixed weekday assignment (Mon = Lower, Tue = Upper, …). Nothing
// is pinned to a day of the week. The next session is chosen from where she is in
// the sequence and how she's recovering — not from what day it is. A plan isn't
// "failed" because a session landed on a different weekday than a grid expected.

/**
 * The strength rotation. It alternates lower/upper, so "no two demanding lower
 * days back to back" falls out of following the order. C1 (core) pairs with an
 * easy aerobic day; G1 (glute/accessory) is the optional 4th session, taken when
 * recovery is clearly there.
 */
export const SESSION_SEQUENCE: SessionKey[] = ["L1", "U1", "L2", "U2"];

/**
 * Training goals as canonical WEEKLY rates — the authoritative unit. Anything
 * that reasons about a different span (a 10-day view, "this fortnight") must
 * SCALE these to that span itself: 4 strength/week is ~6 over 10 days, not 4.
 *
 * The coach is handed these as per-week rates and computes pace from the actual
 * timestamped logs — it is never given a pre-scaled "X over N days" count, so a
 * display bug can't lie to it.
 *
 * `windowDays` is ONLY the dose view's display window, and it is 7 so a count
 * over the window and a weekly rate share a unit — no scaling, no mismatch (3 of
 * 4 strength reads as 3/4). The coach is still never handed a windowed count as a
 * target; it reasons in weekly rates from the logs.
 */
export const ROLLING_TARGETS = {
  /** Strength sessions per week: the L1/U1/L2/U2 rotation, G1 as the 4th when recovery allows. */
  strength: 4,
  /** Easy aerobic (predominantly Zone 2) sessions per week. */
  zone2Min: 2,
  zone2Max: 3,
  /** Run progressions per week. */
  run: 1,
  /** Complete physical recovery days per week — exactly one. More than one full
   *  rest day reads as under-training, not extra recovery. */
  recovery: 1,
  /** Display-only: the dose view's rolling window. 7 days so a windowed count and
   *  a weekly rate share a unit. */
  windowDays: 7,
} as const;

/** Sequencing rules the coach applies when recommending the next session. */
export const ROLLING_RULES: string[] = [
  "Don't prescribe two demanding lower-body sessions back to back.",
  "Prefer not to place a run progression immediately after a demanding lower day.",
  "After two or three hard/moderate days in a row, recommend an easy aerobic/PT day or full recovery.",
  "Easy swimming, walking, mobility, and PT can go between demanding sessions.",
  "Most compound working sets end at ~2 RIR — occasionally 1, rarely 0. Isolation/accessory work may approach failure when it fits. Never require failure to progress, and don't default the compounds to 0 RIR.",
  "The four lifting sessions (L1→U1→L2→U2) are a rotation and a weekly ceiling, not a quota. If only three happen in a week, resume the rotation with the next one — don't cram a fourth into the last day or add load to compensate.",
  "Prioritize Tier A on limited days; Tier A alone is a complete session. Tier C (optional accessories/mobility) never determines whether the workout counts.",
  "Saturday defaults to recovery unless she chooses otherwise; on Sunday, resume the next eligible session rather than restarting an arbitrary calendar week.",
];

/** Plain label for a tier (undefined tiers on C1/G1 read as essential). */
export function tierLabel(tier?: Tier): string {
  return tier === "B" ? "Useful" : tier === "C" ? "Optional" : "Essential";
}

/** Seconds of programmed rest between hard sets, parsed from the `rest` string. */
function restSeconds(rest?: string): number {
  if (!rest) return 60;
  if (/superset/i.test(rest)) return 30;
  if (rest.trim() === "—") return 20;
  const min = rest.match(/(\d+(?:\.\d+)?)\s*(?:[–-]\s*(\d+(?:\.\d+)?))?\s*min/i);
  if (min) return ((Number(min[1]) + (min[2] ? Number(min[2]) : Number(min[1]))) / 2) * 60;
  const sec = rest.match(/(\d+)\s*(?:[–-]\s*(\d+))?\s*sec/i);
  if (sec) return (Number(sec[1]) + (sec[2] ? Number(sec[2]) : Number(sec[1]))) / 2;
  return 60;
}

function exerciseSeconds(e: Exercise): number {
  const workPerSet = e.timed ? 50 : 40; // rough per-set execution
  return e.sets * workPerSet + Math.max(0, e.sets - 1) * restSeconds(e.rest) + 25; // + transition
}

export type SessionDuration = {
  /** Warm-up + Tier A only. */
  essential: number;
  /** Warm-up + Tier A + Tier B — the normal session. */
  normal: number;
  /** Everything, including Tier C. */
  all: number;
};

/**
 * A rough minutes estimate for a session, split by how far she takes it. Feeds
 * the pre-session estimate (§11, estimate-only — no guardrail flag). Warm-up is
 * a flat 5 min; per-set time is deliberately coarse.
 */
export function sessionDuration(exercises: Exercise[]): SessionDuration {
  const WARMUP = 300;
  let a = 0;
  let b = 0;
  let c = 0;
  for (const e of exercises) {
    const s = exerciseSeconds(e);
    const t = e.tier ?? "A";
    if (t === "A") a += s;
    else if (t === "B") b += s;
    else c += s;
  }
  const min = (sec: number) => Math.round(sec / 60);
  return {
    essential: min(WARMUP + a),
    normal: min(WARMUP + a + b),
    all: min(WARMUP + a + b + c),
  };
}

/** The next strength session in the rotation after the last one she completed. */
export function nextStrengthSession(lastCompleted: SessionKey | null): SessionKey {
  if (!lastCompleted) return SESSION_SEQUENCE[0];
  const i = SESSION_SEQUENCE.indexOf(lastCompleted);
  if (i === -1) return SESSION_SEQUENCE[0];
  return SESSION_SEQUENCE[(i + 1) % SESSION_SEQUENCE.length];
}

/** Shared fuel options — the same question wherever it's asked. */
export const FUEL_OPTIONS = [
  { value: "protein_carbs", label: "Protein + carbs" },
  { value: "protein", label: "Protein only" },
  { value: "carbs", label: "Carbs only" },
  { value: "nothing", label: "Nothing" },
  { value: "unsure", label: "Not sure" },
] as const;

export const FUEL_TIMING_OPTIONS = [
  { value: "0-30min", label: "<30 min" },
  { value: "30-60min", label: "30–60" },
  { value: "60-120min", label: "1–2 hr" },
  { value: "2h+", label: "2 hr+" },
] as const;

export const XTRAIN_MODALITIES = [
  "Zone 2 bike",
  // Commuting by bike is training, not transport — logging it here means it
  // counts toward the aerobic dose like anything else.
  "Bike commute",
  "Swim",
  "Sauna",
  "Dance",
  "Yoga",
  "Walk",
  "Bike (other)",
  "Other",
];

export type Traffic = { light: Light; label: string; advice: string };

export function runTraffic(knee: number | string, ankle: number | string): Traffic {
  const mx = Math.max(Number(knee) || 0, Number(ankle) || 0);
  if (mx <= 2)
    return {
      light: "green",
      label: "Green — proceed next run as planned",
      advice: "Both signals quiet. Proceed to next run as scheduled.",
    };
  if (mx <= 3)
    return {
      light: "yellow",
      label: "Yellow — freeze volume, refine form",
      advice: "Borderline. Freeze volume — repeat same distance before adding more.",
    };
  return {
    light: "red",
    label: "Red — bike/pool only, flag for PT",
    advice: "One or both signals elevated. Do not increase volume. Bike or pool if red.",
  };
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
