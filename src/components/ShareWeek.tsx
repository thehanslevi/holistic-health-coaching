"use client";

import { useState } from "react";
import { api } from "@/lib/client";

// One-tap weekly export for a coach/PT. Fetches the assembled report and opens
// the iOS share sheet (navigator.share); falls back to clipboard on desktop.

type Variant = "primary" | "inline";

export default function ShareWeek({ variant = "primary" }: { variant?: Variant }) {
  const [status, setStatus] = useState<"idle" | "loading" | "shared" | "copied" | "error">(
    "idle",
  );

  const share = async () => {
    if (status === "loading") return;
    setStatus("loading");
    let next: typeof status = "idle";
    try {
      const { text } = await api<{ text: string; week: string }>("/api/share/week");
      if (navigator.share) {
        try {
          await navigator.share({ text });
          next = "shared";
        } catch (e) {
          // User cancelled the sheet — not an error; leave at idle.
          if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
        }
      } else {
        await navigator.clipboard.writeText(text);
        next = "copied";
      }
    } catch {
      next = "error";
    }
    setStatus(next);
    if (next !== "idle") setTimeout(() => setStatus("idle"), 3500);
  };

  const label =
    status === "loading"
      ? "Preparing…"
      : status === "shared"
        ? "Shared ✓"
        : status === "copied"
          ? "Copied to clipboard ✓"
          : status === "error"
            ? "Couldn't build — retry"
            : "Share this week";

  if (variant === "inline") {
    return (
      <button
        onClick={share}
        disabled={status === "loading"}
        className="display text-[12px] tracking-[0.08em] text-muted border border-line-strong px-3 py-1.5 hover:text-accent hover:border-accent transition-colors cursor-pointer inline-flex items-center gap-1.5"
      >
        <span aria-hidden>⤴</span> {label}
      </button>
    );
  }

  return (
    <button
      onClick={share}
      disabled={status === "loading"}
      className="display w-full bg-accent text-accent-ink text-[14px] tracking-[0.1em] py-3 hover:brightness-110 disabled:bg-surface-3 disabled:text-faint transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
    >
      <span aria-hidden>⤴</span> {label}
    </button>
  );
}
