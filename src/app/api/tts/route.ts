import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";

// Text-to-speech via OpenAI (a natural, human voice — not the robotic built-in
// one). Returns MP3 audio. Falls back to the browser's built-in voice on the
// client when this isn't configured (no OPENAI_API_KEY).
export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Natural voice isn't configured yet (OPENAI_API_KEY missing)." },
      { status: 503 },
    );
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    const voice = process.env.TTS_VOICE || "nova"; // warm, engaging default
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tts-1",
        voice,
        input: text.slice(0, 4000),
        response_format: "mp3",
      }),
    });
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
