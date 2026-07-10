// Voice output via the browser's built-in SpeechSynthesis. Free, on-device,
// works in the installed iOS PWA. (A natural neural voice is a later upgrade.)
//
// iOS quirks handled here: speech must be kicked off by a user gesture, and the
// voice list loads asynchronously.

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let cachedVoice: SpeechSynthesisVoice | null = null;

// Prefer a natural-sounding English voice; fall back to the first en voice.
function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (cachedVoice && voices.includes(cachedVoice)) return cachedVoice;
  const preferred = ["Samantha", "Karen", "Moira", "Google US English", "Aaron", "Nicky"];
  const byName = voices.find((v) => preferred.some((p) => v.name.includes(p)));
  const enUS = voices.find((v) => v.lang === "en-US" && v.localService);
  const anyEn = voices.find((v) => v.lang.startsWith("en"));
  cachedVoice = byName ?? enUS ?? anyEn ?? voices[0];
  return cachedVoice;
}

// Warm the voice list early (call once on mount) so the first speak() has one.
export function primeVoices() {
  if (!speechSupported()) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => pickVoice();
}

type SpeakOpts = { rate?: number; pitch?: number; onEnd?: () => void };

/** Speak text aloud, cancelling anything currently speaking. */
export function speak(text: string, opts: SpeakOpts = {}) {
  if (!speechSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel(); // stop any in-flight utterance first
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = opts.rate ?? 1.0;
  u.pitch = opts.pitch ?? 1.0;
  u.lang = v?.lang ?? "en-US";
  if (opts.onEnd) u.onend = opts.onEnd;
  synth.speak(u);
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return speechSupported() && window.speechSynthesis.speaking;
}
