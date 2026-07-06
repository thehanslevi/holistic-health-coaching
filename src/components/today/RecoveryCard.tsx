"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { todayISO } from "@/lib/program";
import type { Recovery } from "@/lib/types";

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean | null;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`display text-[12px] tracking-[0.08em] px-3 py-1.5 border cursor-pointer transition-colors ${
        on ? "bg-accent text-accent-ink border-accent" : "border-line-strong text-faint hover:text-ink"
      }`}
    >
      {label} {on ? "✓" : ""}
    </button>
  );
}

export default function RecoveryCard({ fuelingDay }: { fuelingDay: boolean }) {
  const [rec, setRec] = useState<Recovery | null>(null);
  const today = todayISO();

  useEffect(() => {
    api<Recovery[]>(`/api/recovery?since=${today}`)
      .then((rows) => setRec(rows.find((r) => r.date === today) ?? null))
      .catch(() => {});
  }, [today]);

  const patch = async (fields: Partial<Recovery>) => {
    setRec((prev) => ({
      date: today,
      fueled: null,
      post_run_protocol: null,
      vipassana: null,
      sleep_quality: null,
      note: null,
      ...prev,
      ...fields,
    }));
    try {
      await api("/api/recovery", {
        method: "POST",
        body: JSON.stringify({ date: today, ...fields }),
      });
    } catch {
      /* optimistic; ignore */
    }
  };

  return (
    <div className="border border-line p-3.5 mt-5">
      <div className="label mb-2.5">Recovery</div>

      {fuelingDay && (
        <div className="mb-3">
          <div className="text-[13px] text-muted leading-relaxed mb-2">
            Training day — protein-forward within a couple hours, a snack around the session. Energy
            and recovery, not restriction.
          </div>
          <Toggle
            on={rec?.fueled ?? null}
            onClick={() => patch({ fueled: !rec?.fueled })}
            label="Fueled"
          />
        </div>
      )}

      <div className="flex items-center justify-between py-2 border-t border-line">
        <span className="text-[13px] text-ink">Ankle post-run protocol</span>
        <Toggle
          on={rec?.post_run_protocol ?? null}
          onClick={() => patch({ post_run_protocol: !rec?.post_run_protocol })}
          label="Done"
        />
      </div>

      <div className="flex items-center justify-between py-2 border-t border-line">
        <span className="text-[13px] text-ink">Vipassana</span>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => patch({ vipassana: n })}
              className={`stat-num w-8 h-8 text-[14px] border cursor-pointer transition-colors ${
                (rec?.vipassana ?? -1) === n
                  ? "bg-accent text-accent-ink border-accent"
                  : "border-line-strong text-faint hover:text-ink"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
