// Voice output. Prefers a natural neural voice (server /api/tts → MP3, played
// through the Web Audio API so it survives iOS's autoplay rules), and falls back
// to the browser's built-in SpeechSynthesis when TTS isn't configured.

import { getPasscode } from "@/lib/client";

export function speechSupported(): boolean {
  return (
    (typeof window !== "undefined" && "speechSynthesis" in window) || neuralOk !== false
  );
}

// ─── Neural voice (Web Audio) ──────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let neuralOk: boolean | null = null; // null = untried, false = no key/unsupported

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/** Call inside a user gesture to unlock audio on iOS (before the first speak). */
export function primeVoices() {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  // Also warm the built-in voice list for the fallback path.
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
  }
}

function stopNeural() {
  try {
    currentSource?.stop();
  } catch {
    /* already stopped */
  }
  currentSource = null;
}

async function speakNeural(text: string, onEnd?: () => void): Promise<boolean> {
  if (neuralOk === false) return false;
  const ctx = getCtx();
  if (!ctx) {
    neuralOk = false;
    return false;
  }
  try {
    if (ctx.state === "suspended") await ctx.resume();
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
    const buf = await res.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(buf);
    stopNeural();
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    src.onended = () => onEnd?.();
    src.start();
    currentSource = src;
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
  void speakNeural(text, opts.onEnd).then((ok) => {
    if (!ok) speakBuiltin(text, opts);
  });
}

export function stopSpeaking() {
  stopNeural();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
