import Anthropic from "@anthropic-ai/sdk";

// ─── Coach voice: the gate that makes it stick ───────────────────────────────
//
// Prompt rules alone don't hold — the base model keeps its native AI cadence for
// everything the rules don't explicitly ban. So every coach reply passes through
// this: a fast rewrite that puts it in a real coach's voice, plus a deterministic
// backstop for the mechanical stuff a model shouldn't be trusted to never miss.
// This is a pure style/voice pass — no personal or clinical content lives here,
// so it's safe in the public repo.

const client = new Anthropic();

// Fast + cheap: cleaning voice needs no reasoning, and low latency matters
// because chat waits on this before the reply appears.
const GATE_MODEL = "claude-haiku-4-5-20251001";

// One source of truth for the banned vocabulary, shared with the coach prompt.
// These are the words/metaphors that read as LLM-wellness copy, not coaching.
export const BANNED_WORDS = [
  "signal",
  "rhythm",
  "lever",
  "levers",
  "foundation",
  "journey",
  "holistic",
  "optimize",
  "underscore",
  "cornerstone",
  "testament",
  "landscape",
  "delve",
  "leverage",
  "robust",
  // Her explicit bans: no therapy/coaching-poster vocabulary.
  "quiet",
  "quietly",
  "trust",
  "trusting",
  "process",
  "honest",
];

export const BANNED_PHRASES = [
  "that is its own signal",
  "here's the thing",
  "keep it honest",
  "keep the loads honest",
  "the lever that matters most",
  "the thing that matters most right now",
  "show up and move well",
  "trust the process",
  "control what you can control",
  "listen to your body",
  "hard stuff",
  "do the work",
  "put in the work",
  "reestablish the rhythm",
  "blank slate",
  "no logs in the window",
  "dial it in",
  "lock in",
  "at the end of the day",
  "the name of the game",
];

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu;

/**
 * Deterministic mechanical backstop. Handles the things that must NEVER slip
 * through regardless of the model (em/en dashes, emojis) and reports any banned
 * word/phrase still present so regressions are visible. Does not paraphrase —
 * the rewrite pass owns voice; this owns the non-negotiable mechanics.
 */
export function lintVoice(text: string): { text: string; hits: string[] } {
  const hits: string[] = [];
  let out = text;

  // Numeric ranges keep a plain hyphen ("3×10-12", "30-40 min") — turning the
  // en-dash into a comma made "10–12 reps" read as two rep targets, which is a
  // wrong prescription on her lock screen, not a style nit.
  out = out.replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2");
  // Everything else: em/en dash → comma (spaced) or nothing (unspaced compound).
  out = out.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, ", ");
  // Strip emojis.
  out = out.replace(EMOJI_RE, "");
  // Tidy any double spaces / space-before-punct the swaps introduced.
  out = out.replace(/ {2,}/g, " ").replace(/ ([,.;:])/g, "$1").trim();

  const lower = out.toLowerCase();
  for (const w of BANNED_WORDS) {
    if (new RegExp(`\\b${w}\\b`, "i").test(lower)) hits.push(w);
  }
  for (const p of BANNED_PHRASES) {
    if (lower.includes(p)) hits.push(p);
  }
  return { text: out, hits };
}

const VOICE_REWRITE_SYSTEM = `You rewrite a fitness coach's message into clear, direct language. You are a rewriter, not the coach: keep the meaning exactly, change only how it is said.

PRESERVE EXACTLY: every fact, number, weight, rep count, exercise name, body part, day, and recommendation. Keep any tables or bullet lists. Never add advice, caveats, or encouragement that was not there. Never remove a real instruction.

THE VOICE IS: clear, direct, and very succinct. Short lines, minimal prose. A competent coach giving a straight instruction, not a friend, a therapist, or a motivational account.

BREVITY IS THE POINT. Say the fact and the instruction, nothing else. Cut every sentence that is not a fact or a directive: no set-up, no explanation of why, no wind-down, no reassurance. Prefer short sentences and fragments over flowing prose. If two sentences can be one, make it one. When in doubt, cut it. Keep every number and instruction, but carry them in the fewest words possible.

HARD RULES:
- No therapy language. No buddy-buddy, folksy, or casual phrasing. No slang: never "all over the place," "acting up," "the hard stuff," "bump it up," "sitting at," "grinding." Say it plainly: "your sleep was short," "your ankle was sore," "hard training," "add weight," "your bench is at 70."
- Never open with a filler lead-in: no "Here's the thing," "So," "Look," "Honestly," "The thing is," "Great question."
- Never use these words: quiet, quietly, trust, trusting, process, honest, signal, rhythm, lever, levers, foundation, journey, holistic, optimize, cornerstone. Also never: "listen to your body," "trust the process," "do the work," "put in the work," "control what you can control," "dial it in," "lock in."
- No abstract-noun metaphors. State the plain fact instead.
- No rule-of-three (three balanced clauses in a row). Pick the one thing that matters and say only that.
- No "X, not Y" or "better X than Y" aphorisms used as a mic-drop. Just say what to do.
- No hedging and no meta about data. Never mention logs, windows, "from what I can see," or "based on your recent data."
- Name the real thing: the body part, the weight, the day. "Your right ankle was sore both mornings after last week's run."
- Lead with the instruction or the observation, then stop. Do not pad. Vary sentence length so it doesn't sound metronomic.
- No emojis. No em-dashes or en-dashes; use a comma, period, or a new sentence. The one exception: numeric ranges keep a hyphen exactly as written ("3×10-12 @ 95", "30-40 min") — never turn a rep range into a list.
- Praise only a real, specific thing she did, or none at all.

Output ONLY the rewritten message. No preamble, no notes, no quotation marks around it.`;

/**
 * Rewrite a coach message into voice. Fail-open: on any error, fall back to the
 * deterministic lint of the original so the coach never breaks or hangs.
 * `maxWords` enforces the brief's hard length ceiling through the rewrite.
 */
export async function rewriteInVoice(text: string, opts?: { maxWords?: number }): Promise<string> {
  const original = text ?? "";
  if (!original.trim()) return original;

  const lengthRule = opts?.maxWords
    ? `\n\nHARD LENGTH LIMIT: ${opts.maxWords} words maximum. Never make it longer than the original; shorter is fine.`
    : "";

  const gen = async (userContent: string): Promise<string> => {
    const res = await client.messages.create({
      model: GATE_MODEL,
      max_tokens: 1400,
      system: VOICE_REWRITE_SYSTEM + lengthRule,
      messages: [{ role: "user", content: userContent }],
    });
    return res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  };

  try {
    let out = lintVoice(
      (await gen(
        `Rewrite this coach message in voice. Preserve every fact and number exactly; change only how it sounds.\n\n---\n${original}`,
      )) || original,
    ).text;

    // Corrective pass: if any banned word/phrase slipped back in, strip exactly
    // those and nothing else. One retry keeps latency bounded but closes the
    // loophole where the rewriter re-introduces a cliché it was told to avoid.
    const hits = lintVoice(out).hits;
    if (hits.length) {
      const corrected = await gen(
        `This message still contains banned words/phrases: ${hits.join(", ")}. Remove or replace each one with plain, direct language. Change nothing else, and keep every fact and number.\n\n---\n${out}`,
      );
      out = lintVoice(corrected || out).text;
    }
    return out || original;
  } catch {
    return lintVoice(original).text || original;
  }
}
