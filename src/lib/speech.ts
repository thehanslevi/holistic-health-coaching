// Voice output. Prefers a natural neural voice (server /api/tts → MP3, played
// through an <audio> element so it survives iOS's ring/silent switch and
// autoplay rules), and falls back to the browser's built-in SpeechSynthesis
// when TTS isn't configured.

import { getPasscode } from "@/lib/client";

// A tiny silent clip used to "unlock" audio playback inside a user gesture on iOS.
const SILENT =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

let audioEl: HTMLAudioElement | null = null;
let unlocked = false;
let neuralOk: boolean | null = null; // null = untried, false = no key/unsupported

function getEl(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.setAttribute("playsinline", "true");
  }
  return audioEl;
}

// Must run inside a user gesture (a tap) to unlock playback on iOS.
function unlock() {
  const el = getEl();
  if (!el || unlocked) return;
  try {
    el.src = SILENT;
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        unlocked = true;
      }).catch(() => {});
    } else {
      unlocked = true;
    }
  } catch {
    /* will retry on next gesture */
  }
}

export function primeVoices() {
  unlock(); // unlocks when called from a gesture; harmless otherwise
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
  }
}

export function speechSupported(): boolean {
  return (
    (typeof window !== "undefined" && "speechSynthesis" in window) || neuralOk !== false
  );
}

async function speakNeural(text: string, onEnd?: () => void): Promise<boolean> {
  if (neuralOk === false) return false;
  const el = getEl();
  if (!el) {
    neuralOk = false;
    return false;
  }
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getPasscode() ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    if (res.status === 503) {
      neuralOk = false; // no key configured — use built-in from now on
      return false;
    }
    if (!res.ok) return false;
    neuralOk = true;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    el.src = url;
    el.onended = () => {
      URL.revokeObjectURL(url);
      onEnd?.();
    };
    await el.play();
    return true;
  } catch {
    return false;
  }
}

// ─── Built-in voice (fallback) ─────────────────────────────────────────────────

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (cachedVoice && voices.includes(cachedVoice)) return cachedVoice;
  const preferred = ["Samantha", "Karen", "Moira", "Google US English", "Aaron", "Nicky"];
  cachedVoice =
    voices.find((v) => preferred.some((p) => v.name.includes(p))) ??
    voices.find((v) => v.lang === "en-US" && v.localService) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices[0];
  return cachedVoice;
}

function speakBuiltin(text: string, opts: SpeakOpts) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = opts.rate ?? 1.0;
  u.pitch = opts.pitch ?? 1.0;
  u.lang = v?.lang ?? "en-US";
  if (opts.onEnd) u.onend = opts.onEnd;
  synth.speak(u);
}

// ─── Public API ────────────────────────────────────────────────────────────────

type SpeakOpts = { rate?: number; pitch?: number; onEnd?: () => void };

/** Speak text aloud — neural voice if available, else the built-in voice. */
export function speak(text: string, opts: SpeakOpts = {}) {
  if (!text.trim()) return;
  stopSpeaking();
  unlock(); // synchronous, within the calling gesture
  void speakNeural(text, opts.onEnd).then((ok) => {
    if (!ok) speakBuiltin(text, opts);
  });
}

export function stopSpeaking() {
  if (audioEl) {
    try {
      audioEl.pause();
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
