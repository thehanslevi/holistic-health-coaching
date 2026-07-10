"use client";

import { useCallback, useRef, useState } from "react";
import { getPasscode } from "@/lib/client";

// Records mic audio and transcribes it via /api/transcribe (Whisper). Used for
// hands-free coach input. MediaRecorder works in the installed iOS PWA
// (14.3+); format differs by browser (webm/mp4) and the server handles both.
export function useVoiceRecorder(onText: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false); // transcribing
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (!blob.size) return;
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append("file", blob, "audio.webm");
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { Authorization: `Bearer ${getPasscode() ?? ""}` },
            body: fd,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "Transcription failed");
          if (data.text) onText(data.text as string);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Transcription failed");
        } finally {
          setBusy(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch {
      setError("Microphone unavailable or permission denied.");
    }
  }, [onText]);

  const stop = useCallback(() => {
    setRecording(false);
    recorderRef.current?.stop();
  }, []);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof window !== "undefined" &&
    "MediaRecorder" in window;

  return { recording, busy, error, start, stop, supported };
}
