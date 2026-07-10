import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";

// Text-to-speech via ElevenLabs (a natural, human voice). Returns MP3. The
// client falls back to the browser's built-in voice when this isn't configured.
// One ELEVENLABS_API_KEY also powers /api/transcribe (Scribe STT).
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Natural voice isn't configured yet (ELEVENLABS_API_KEY missing)." },
      { status: 503 },
    );
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    // Default voice = "Rachel" (warm, calm). Override with ELEVENLABS_VOICE_ID.
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const model = process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5";

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.slice(0, 4000),
          model_id: model,
          voice_settings: { stability: 0.4, similarity_boost: 0.75 },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`TTS failed (${res.status}): ${detail.slice(0, 160)}`);
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
