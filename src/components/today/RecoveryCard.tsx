"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { FUEL_OPTIONS, todayISO } from "@/lib/program";
import type { FuelStatus, Recovery } from "@/lib/types";
import { ChipGroup } from "@/components/ui";

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
      post_training_fuel: null,
      protein_floor: null,
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

      {/* Post-training fuel lives here rather than at save, because after a
          session she doesn't know yet. Appetite is unreliable on semaglutide,
          so this gets recorded instead of assumed. */}
      {fuelingDay && (
        <div className="py-2 border-t border-line">
          <div className="label !text-[9px] mb-2">Eaten since training</div>
          <ChipGroup
            cols={3}
            options={FUEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={rec?.post_training_fuel ?? null}
            onChange={(v) => patch({ post_training_fuel: (v as FuelStatus) ?? null })}
          />
        </div>
      )}

      <div className="py-2 border-t border-line">
        <div className="label !text-[9px] mb-2">Protein floor yesterday</div>
        <ChipGroup
          cols={4}
          options={[
            { value: "yes", label: "Yes" },
            { value: "close", label: "Close" },
            { value: "no", label: "No" },
            { value: "unknown", label: "Not sure" },
          ]}
          value={rec?.protein_floor ?? null}
          onChange={(v) => patch({ protein_floor: (v as Recovery["protein_floor"]) ?? null })}
        />
      </div>
    </div>
  );
}
