// Program content ported verbatim from the v1 WorkoutTracker (deleted; see git
// history). This file is the single source of truth for the athlete's program.
// Coach-prescribed content — edit deliberately.

import type { Light } from "@/components/ui";

export const PHASE = "Phase 4: Hybrid Performance — Aerobic Base, Strength Held";
export const PHASE_DATES = "July 19, 2026 onward";

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
      { id: "l1_rdl", name: "Romanian Deadlift (BB)", sets: 4, reps: "6 reps", target: "145 lbs", note: "Primary posterior-chain lift. Working weight 145 (4×6). This is the maintain phase — hold clean strength, don't chase a max. 1–3 reps in reserve; if the last set isn't there on a given day, stop a rep short. Hip hinge, flat back, bar close to legs. Drive hips forward and squeeze the glutes hard at the top — finish with the glutes, not the low back. If the back rounds or you feel it in the low back, the load is too high for that day. Do not skip." },
      { id: "l1_hip_thrust", name: "Barbell / Machine Hip Thrust", sets: 4, reps: "8–10 reps", target: "Loaded", note: "A STAPLE now, not an accessory — this is the glute engine behind running economy, pelvic stability, and injury resilience. Hip-dominant and knee-friendly (minimal knee shear). Ribs down, full hip extension, hard top squeeze, 2–3 sec lower; drive with the glutes, never the low back (lumbar overextension is the only real risk). Machine if the gym has it, otherwise loaded bridge with a padded plate/DB across the hips. Progress the load only when the lower stays controlled." },
      { id: "l1_leg_press", name: "Leg Press", sets: 4, reps: "12 reps", target: "235 lbs", note: "Now higher-rep (4×12) — capacity and knee-friendly volume, not a max. Feet high, stop at 90°, knee zero throughout. 1–3 reps in reserve. Add weight only when all 4×12 are clean." },
      { id: "l1_leg_curl", name: "Leg Curl", sets: 3, reps: "12 reps", target: "75 lbs", note: "Working weight 75 (3×12). Keep the flawless 3-sec eccentric — the slow lower is the knee's protective factor, so quality governs the load, not the other way around. Hamstring resilience for running." },
      { id: "l1_leg_ext", name: "Leg Extension (top 30° only)", sets: 3, reps: "12 reps", target: "115 lbs", note: "Working weight 115 (3×12). Protected ROM protocol continues — top-30° range only, non-negotiable, controlled throughout. Don't chase load past clean reps." },
      { id: "l1_hip_abd", name: "Hip Abduction / Adduction", sets: 3, reps: "12–15 reps", target: "75 lbs", note: "Both directions. 2-sec hold at peak, slow return. Glute medius (abduction) + adductor. Ported from PT clamshell work — this is the hip-stability and glute-medius shaping piece, now on all three lower days. Lean torso slightly forward on abduction to bias glute over TFL." },
      { id: "l1_calf_raise", name: "Calf Raises — Single Leg", sets: 3, reps: "12 each leg", target: "Bodyweight", note: "Right leg first. 3-sec lowering. Posterior tibial tendon resilience. Hold a DB if you want added load on a machine.", weighted: false },
      { id: "l1_pt_band", name: "Banded Foot Adduction / Inversion", sets: 3, reps: "15 each foot", target: "Light band", note: "THE posterior tibial tendon loading lift (Kulig protocol). Band around forefoot, pull foot inward and down against resistance, 3-sec slow return. Right foot first. Do in supportive shoes. This is your run-readiness insurance.", weighted: false },
      { id: "l1_cars", name: "Ankle CARs", sets: 2, reps: "5 each direction/side", target: "Bodyweight", note: "Controlled ankle circles, full range, slow. Mobility + joint awareness. Right ankle first.", weighted: false },
      { id: "l1_pallof", name: "Pallof Press", sets: 3, reps: "10 each side", target: "Light cable/band", note: "Anti-rotation core. Side-on to cable, press out, hold 2 sec. Hips square.", weighted: false },
      { id: "l1_tor_rot", name: "Torso Rotation (machine)", sets: 3, reps: "12 each side", target: "Light-moderate", note: "Controlled rotation, not ballistic. Slow return. Complements Pallof press — anti-rotation resists, rotation trains range.", weighted: false },
      { id: "l1_balance", name: "Single-Leg Balance — Board", sets: 3, reps: "45 sec each leg", target: "Eyes closed", note: "Right foot first. Eyes closed when stable. Ankle proprioception.", weighted: false, timed: true },
    ],
    cooldown: [
      "Standing Quad Stretch — 45 sec each leg",
      "Seated Hamstring Stretch — 45 sec each leg",
      "Calf Stretch — 60 sec each leg (straight + bent knee)",
    ],
  },
  U1: {
    label: "Upper Strength",
    subtitle: "Pull-Up Progression",
    exercises: [
      { id: "u1_bench", name: "Barbell Bench Press", sets: 4, reps: "8 reps", target: "70 lbs", note: "Primary upper press. Stay at 70 for 4×8 until every set is technically clean at 1–2 reps in reserve — then take 75 again (double progression). Maintain phase: no testing, no grinding reps. Next milestone 80–90." },
      { id: "u1_ohp", name: "Barbell Overhead Press", sets: 3, reps: "8 reps", target: "55 lbs", note: "PRIMARY vertical press (replaced the DB shoulder press). Working weight 55 (3×8). Ribs down, squeeze glutes, don't lean back into the low back. 1–2 reps in reserve. Next milestone 60." },
      { id: "u1_pullup", name: "Assisted Pull-Up", sets: 4, reps: "4–6 reps", target: "55 lb assist", note: "The primary progression target — the biggest upper-body opportunity. ALTERNATE by rotation: WEEK A = assisted pull-ups only (this exercise). WEEK B = assisted pull-ups PLUS the eccentric work below. Don't do both every time — that just piles on fatigue. Chip the assistance down over months toward a first strict, unassisted pull-up. Full hang, chin over bar.", weighted: false },
      { id: "u1_pullup_ecc", name: "Assisted Pull-Up — Eccentric (Week B only)", sets: 3, reps: "4–5 reps", target: "Lighter assist", note: "WEEK B ONLY — skip this on the Week A rotation. Same machine, set the assist LIGHTER than your working sets. Pull up normally, then lower for 4–5 sec. Eccentric overload builds the strength a free-bar eccentric would, no bar needed.", weighted: false },
      { id: "u1_row", name: "Machine Row", sets: 3, reps: "10–12 reps", target: "85 lbs", note: "Working weight 85 (3×10–12). Fixed ROM removes the elbow tug of DB rows. Squeeze the shoulder blades, controlled return." },
      { id: "u1_face_pull", name: "Face Pull", sets: 3, reps: "15–20 reps", target: "Light cable/band", note: "Shoulder-health insurance: rotator cuff, lower traps, posture, rear delts. Rope or band at eye height, pull to the forehead, elbows high, external-rotate at the end. Light and strict — this is a health lift, not a strength lift.", weighted: false },
      { id: "u1_tricep", name: "Tricep (machine)", sets: 3, reps: "12 reps", target: "55 lbs", note: "Working weight 55 (3×12). Machine, not barbell — protects the prior elbow tweak. Flag if elbow pull returns." },
      { id: "u1_hammer", name: "Hammer Curl (DB, neutral)", sets: 3, reps: "10–12 reps", target: "17.5 lbs", note: "Neutral grip — most elbow-friendly curl variation. Second weekly bicep session (U2 has supinated). FIRST TO PULL if elbow tug returns or worsens. No swing." },
      { id: "u1_llr", name: "Lying Leg Raise", sets: 3, reps: "10–12 reps", target: "Bodyweight", note: "No bar needed. Lower back pinned to floor throughout — if it arches, bend the knees. Lower slowly, no momentum. Anti-extension lower-ab work.", weighted: false },
    ],
    cooldown: [
      "Doorway Chest Stretch — 40 sec each side",
      "Cross-Body Shoulder Stretch — 40 sec each side",
      "Child's Pose + Lat Reach — 45 sec each side",
    ],
  },
  L2: {
    label: "Lower Hypertrophy",
    subtitle: "Posterior Chain",
    exercises: [
      { id: "l2_rev_lunge", name: "Reverse Lunge", sets: 3, reps: "10 each leg", target: "Bodyweight → DBs", note: "Unilateral anchor. Step BACK, not forward — keeps weight over the front heel, minimizes knee shear (knee-rehab friendly). Control depth, do not chase range. Hold a rack/wall lightly if balance needs it. Add DBs when 3x10 each leg is steady. Attacks the left-right asymmetry directly. PROGRESSION: as knee tolerance improves, gradually work toward Bulgarian split squats (rear foot elevated — see the optional glute day). No forced timeline; only when the knee stays quiet the next morning." },
      { id: "l2_rdl", name: "Romanian Deadlift (BB)", sets: 3, reps: "10–12 reps", target: "95 lbs", note: "RECALIBRATED Jun 17 alongside L1. Hypertrophy focus: lighter than L1, higher reps, controlled tempo. Feel the hamstring stretch under load, then DRIVE THE HIPS FORWARD and squeeze the glutes hard at the top — finish the lift with the glutes, not the low back." },
      { id: "l2_leg_curl", name: "Leg Curl", sets: 3, reps: "12–15 reps", target: "75 lbs", note: "Working weight 75, higher reps than L1. 3-sec eccentric still applies. Hamstring volume." },
      { id: "l2_hip_abd", name: "Hip Abduction / Adduction", sets: 3, reps: "12–15 reps", target: "75 lbs", note: "Both directions. 2-sec hold at peak. Glute medius + adductor. Supplement to PT clamshells." },
      { id: "l2_calf", name: "Seated / Standing Calf Raise", sets: 4, reps: "12–15 reps", target: "Loaded", note: "Higher volume than L1. Soleus + gastroc. Posterior tibial support." },
      { id: "l2_tib", name: "Tibialis Raises", sets: 3, reps: "15–20 reps", target: "Bodyweight → loaded", note: "Anterior chain. Heels down, lift forefoot, 2-sec hold. Shin resilience for running.", weighted: false },
      { id: "l2_band_endur", name: "Banded Ankle Endurance (in/ev/dorsi)", sets: 1, reps: "~50 each direction", target: "Light band", note: "Alvarez-style high-rep tendon endurance. Band inversion, eversion, dorsiflexion. Controlled eccentric. High reps train the tendon for the repetitive demand of running, not max strength.", weighted: false },
      { id: "l2_dead_bug", name: "Dead Bugs", sets: 3, reps: "10 each side", target: "Bodyweight", note: "Anti-extension core. Exhale fully, lower back pressed down.", weighted: false },
      { id: "l2_tor_rot", name: "Torso Rotation (machine)", sets: 3, reps: "12 each side", target: "Light-moderate", note: "Controlled rotation, not ballistic. Slow return.", weighted: false },
      { id: "l2_hip_thrust", name: "Barbell / Machine Hip Thrust", sets: 4, reps: "10–12 reps", target: "Loaded", note: "STAPLE lift, second dose of the week (the other is on the strength day). The glute engine for running economy, pelvic stability, and injury resilience. Hip-dominant and knee-friendly. Ribs down, full hip extension, hard top squeeze, 2–3 sec lower; drive with the glutes, not the low back. Machine if available, otherwise loaded bridge with a padded plate/DB across the hips. VARIATION: single-leg bodyweight bridge, 12 each leg, for the left-right asymmetry.", weighted: true },
    ],
    cooldown: [
      "Pigeon / Figure-4 — 60 sec tighter side, 30 sec other",
      "Standing Quad Stretch — 45 sec each leg",
      "Seated Hamstring Stretch — 45 sec each leg",
    ],
  },
  U2: {
    label: "Upper Hypertrophy",
    subtitle: "Carries + Core",
    exercises: [
      { id: "u2_chest", name: "DB Chest Press", sets: 3, reps: "10–12 reps", target: "25 lbs", note: "Hypertrophy focus. Move to 30 when last 2 reps of each set controlled." },
      { id: "u2_lat_pull", name: "Lat Pulldown", sets: 3, reps: "10–12 reps", target: "75–85 lbs", note: "Working range 75–85 (3×10–12). Lock in full ROM at the top of the range before nudging up. Rep quality over load. Next milestone 100." },
      { id: "u2_farmer_carry", name: "Farmer Carry (heavy)", sets: 3, reps: "30–40 m", target: "Heavy DBs/trap bar", note: "Your once-weekly heavy carry — trunk stability, grip, work capacity, athleticism. Pick a load you can carry hard but with a tall, braced torso; ribs down, shoulders packed, walk with control (no leaning or hip hitch). Rest fully between trips. This is a load you should feel in your grip and core, not your low back." },
      { id: "u2_row", name: "Machine Row", sets: 3, reps: "12 reps", target: "Lighter than U1", note: "Fixed ROM, removes elbow tug. Hypertrophy focus: lighter than the strength day, higher reps, controlled. Same machine as U1." },
      { id: "u2_lat_raise", name: "Lateral Raise (DB)", sets: 3, reps: "12–15 reps", target: "10 lbs", note: "Accessory shoulder health. Shoulder width, light, strict, no swing. Lead with elbows." },
      { id: "u2_face_pull", name: "Face Pull", sets: 3, reps: "15–20 reps", target: "Light cable/band", note: "Second weekly dose — rotator cuff, lower traps, rear delts, posture. Rope or band at eye height, pull to the forehead, elbows high, external-rotate at the end. Light and strict.", weighted: false },
      { id: "u2_bicep", name: "Bicep Curl (DB, supinated)", sets: 3, reps: "12 reps", target: "17.5 lbs", note: "Standard supinated curl, 3×12. Move to 20 when all sets are clean. Full ROM, no swing." },
      { id: "u2_pallof", name: "Pallof Press", sets: 3, reps: "10 each side", target: "Light cable/band", note: "Anti-rotation core. Hold 2 sec at full extension.", weighted: false },
      { id: "u2_side_plank", name: "Side Plank", sets: 3, reps: "35–45 sec each side", target: "Bodyweight", note: "Anti-lateral-flexion. Move to hip dips when 45 sec easy.", weighted: false, timed: true },
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

/** Targets across a rolling ~7–10 day cycle — a dose to hit, not a calendar. */
export const ROLLING_TARGETS = {
  /** Aim for 4 strength sessions: the L1/U1/L2/U2 rotation, G1 as the 4th when recovery allows. */
  strength: 4,
  /** 2–3 easy aerobic (predominantly Zone 2) sessions. */
  zone2Min: 2,
  zone2Max: 3,
  /** 1 run progression when the right ankle is Green. */
  run: 1,
  /** At least 1 complete physical recovery day. */
  recovery: 1,
  /** The window, in days, the cycle is measured over. */
  windowDays: 10,
} as const;

/** Sequencing rules the coach applies when recommending the next session. */
export const ROLLING_RULES: string[] = [
  "Don't prescribe two demanding lower-body sessions back to back.",
  "Don't place a run progression right after a demanding lower day unless knee and ankle are clearly Green.",
  "After two or three hard/moderate days in a row, recommend an easy aerobic/PT day or full recovery.",
  "Easy swimming, walking, mobility, and PT can go between demanding sessions.",
  "Keep roughly 1–3 reps in reserve on most resistance sets.",
  "Saturday defaults to recovery unless she chooses otherwise; on Sunday, resume the next eligible session rather than restarting an arbitrary calendar week.",
];

/** The next strength session in the rotation after the last one she completed. */
export function nextStrengthSession(lastCompleted: SessionKey | null): SessionKey {
  if (!lastCompleted) return SESSION_SEQUENCE[0];
  const i = SESSION_SEQUENCE.indexOf(lastCompleted);
  if (i === -1) return SESSION_SEQUENCE[0];
  return SESSION_SEQUENCE[(i + 1) % SESSION_SEQUENCE.length];
}

export const XTRAIN_MODALITIES = [
  "Zone 2 bike",
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
