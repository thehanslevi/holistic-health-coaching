import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";

// Speech-to-text via ElevenLabs Scribe. The client records audio
// (MediaRecorder) and POSTs it here as multipart form-data; we forward it to
// Scribe and return the transcript. iOS Safari's native SpeechRecognition is
// unreliable, so this server round-trip is the robust path for voice input.
// Uses the same ELEVENLABS_API_KEY as /api/tts.
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Voice input isn't configured yet (ELEVENLABS_API_KEY missing)." },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "An audio file is required." }, { status: 400 });
    }

    const ext = file.type.includes("mp4") || file.type.includes("mpeg") ? "m4a" : "webm";
    const upstream = new FormData();
    upstream.append("file", file, `audio.${ext}`);
    upstream.append("model_id", "scribe_v1");

    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
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
