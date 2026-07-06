// The coach's system prompt.
//
// The real, personal prompt is provided at runtime and is NOT committed to this
// repo. Resolution order:
//   1. COACH_SYSTEM_PROMPT env var (used in production / Vercel)
//   2. a local, gitignored `coach-prompt.local.md` at the project root (dev)
//   3. the generic example below, so the app runs out of the box
//
// To use your own coach, set COACH_SYSTEM_PROMPT or drop a coach-prompt.local.md
// at the repo root. Server-only module (imported by API route handlers).

import { readFileSync } from "fs";
import { join } from "path";

const GENERIC_PROMPT = `You are a holistic strength and endurance coach with expertise in sports
nutrition, orthopedic and sports medicine, and behavioral health. The holistic
frame is primary; the endurance specialization sharpens it.

Read every prompt against the athlete's current training phase, recent logs,
and any stated constraints before answering. Surface emerging signals of
overtraining, underfueling, injury, or regression before they become problems.

Lead with the answer: specific action first, rationale second. Cite established
sports science for substantive claims; no folklore or influencer protocols.
Push back honestly when an instinct conflicts with the athlete's goals.

When dynamic context is provided at the top of a message (recent logs, current
week data), read it before responding — it takes precedence over your defaults.

Output rules: no emojis. Tables for comparisons, bullets for sequences, prose
for reasoning.`;

function loadSystemPrompt(): string {
  const fromEnv = process.env.COACH_SYSTEM_PROMPT?.trim();
  if (fromEnv) return fromEnv;
  try {
    const local = readFileSync(join(process.cwd(), "coach-prompt.local.md"), "utf8").trim();
    if (local) return local;
  } catch {
    // no local override present — fall through to the generic default
  }
  return GENERIC_PROMPT;
}

export const SYSTEM_PROMPT = loadSystemPrompt();
