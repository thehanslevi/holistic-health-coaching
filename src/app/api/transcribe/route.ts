import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";

// Speech-to-text via OpenAI Whisper. The client records audio (MediaRecorder)
// and POSTs it here as multipart form-data; we forward it to Whisper and return
// the transcript. iOS Safari's native SpeechRecognition is unreliable, so this
// server round-trip is the robust path for voice input in the PWA.
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Voice input isn't configured yet (OPENAI_API_KEY missing)." },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "An audio file is required." }, { status: 400 });
    }

    const upstream = new FormData();
    // Whisper infers the format from the filename extension; MediaRecorder gives
    // webm on Chrome and mp4/m4a on iOS Safari, both accepted.
    const ext = (file.type.includes("mp4") || file.type.includes("mpeg")) ? "m4a" : "webm";
    upstream.append("file", file, `audio.${ext}`);
    upstream.append("model", "whisper-1");
    upstream.append("language", "en");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Transcription failed (${res.status}): ${detail.slice(0, 160)}`);
    }
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: (data.text ?? "").trim() });
  } catch (e) {
    return errorResponse(e);
  }
}
