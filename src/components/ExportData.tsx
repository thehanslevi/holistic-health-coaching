"use client";

import { useState } from "react";
import { getPasscode } from "@/lib/client";

// Take your training with you.
//
// The data lives in Postgres, not in this app — but until now there was an
// import path and no export, so there was no copy she actually held. Two
// formats because they answer different worries: the spreadsheet is for reading
// it without any of this code existing; the backup is for restoring it if this
// all goes away.
//
// Delivery is share-sheet first: on an installed iOS PWA that's how a file
// reaches Files, iCloud, Drive or Mail. `<a download>` is the desktop path.

type Fmt = "csv" | "json";
type Status = "idle" | "loading" | "done" | "error";

const FORMATS: { fmt: Fmt; label: string; sub: string; file: string }[] = [
  {
    fmt: "csv",
    label: "Spreadsheet",
    sub: "Every set you've logged, one row each. Opens in Numbers, Excel or Sheets.",
    file: "workouts.csv",
  },
  {
    fmt: "json",
    label: "Full backup",
    sub: "Everything, exactly as stored, and restorable. Keep it somewhere you control.",
    file: "backup.json",
  },
];

export default function ExportData() {
  const [busy, setBusy] = useState<Fmt | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const run = async (fmt: Fmt) => {
    if (busy) return;
    setBusy(fmt);
    setStatus("loading");
    try {
      const res = await fetch(`/api/export?format=${fmt}`, {
        headers: { Authorization: `Bearer ${getPasscode() ?? ""}` },
      });
      if (!res.ok) throw new Error(String(res.status));

      const blob = await res.blob();
      // Prefer the server's filename — it carries the export date.
      const name =
        res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1] ??
        `volt-export.${fmt}`;
      const file = new File([blob], name, { type: blob.type });

      // iOS: hand it to the share sheet so it can land in Files/iCloud/Mail.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          setStatus("done");
          return;
        } catch (e) {
          // Cancelled the sheet — not a failure.
          if (e instanceof DOMException && e.name === "AbortError") {
            setStatus("idle");
            return;
          }
          // Anything else: fall through to a plain download.
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("done");
    } catch {
      setStatus("error");
    } finally {
      setBusy(null);
      setTimeout(() => setStatus("idle"), 3500);
    }
  };

  return (
    <div className="border border-line">
      <div className="px-3.5 py-3 border-b border-line">
        <span className="label !text-accent">Your data</span>
        <div className="text-[12px] text-muted mt-1.5 leading-snug">
          Your training lives on a server, not in this app — but take a copy anyway. It&apos;s yours.
        </div>
      </div>
      <div className="p-3.5 space-y-2">
        {FORMATS.map((f) => (
          <button
            key={f.fmt}
            onClick={() => run(f.fmt)}
            disabled={busy !== null}
            className="w-full text-left border border-line px-3.5 py-3 hover:border-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="display text-[13px] tracking-[0.06em] text-ink">
                  {busy === f.fmt ? "Preparing…" : f.label}
                </div>
                <div className="text-[11px] text-faint mt-0.5 leading-snug">{f.sub}</div>
              </div>
              <span className="text-faint text-xs shrink-0" aria-hidden>
                ↓
              </span>
            </div>
          </button>
        ))}
        {status === "done" && <div className="text-[11px] text-go">Exported ✓</div>}
        {status === "error" && (
          <div className="text-[11px] text-stop">Couldn&apos;t build the export — try again.</div>
        )}
      </div>
    </div>
  );
}
