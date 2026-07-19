"use client";

import { computeCycle } from "@/lib/analytics";
import { SESSIONS } from "@/lib/program";
import { useApp } from "@/components/AppShell";

// Rolling-cycle view (Phase 4). No weekdays — this reads what she actually logged
// over the last ~7–10 days and shows the dose filling in against its targets, plus
// which session is next in the rotation. It never blocks anything; it's a picture
// she can act on or ignore.

type TargetProps = { label: string; done: number; target: string; met: boolean };

function Target({ label, done, target, met }: TargetProps) {
  return (
    <div className="flex-1 min-w-0 border border-line bg-surface px-2.5 py-2 text-center">
      <div className="num text-[18px] leading-none text-ink">
        {done}
        <span className="text-faint text-[12px]">/{target}</span>
      </div>
      <div className={`label !text-[8px] mt-1.5 ${met ? "text-accent" : "text-faint"}`}>{label}</div>
    </div>
  );
}

export default function WeekBalance() {
  const { logs } = useApp();
  const c = computeCycle(logs);
  const next = SESSIONS[c.nextStrength];

  return (
    <div className="border border-line bg-surface p-3.5 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="label">This cycle</div>
        <div className="label !text-faint">last {c.windowDays} days</div>
      </div>

      <div className="flex gap-1.5 mb-3">
        <Target label="STRENGTH" done={c.strengthDone} target={`${c.strengthTarget}`} met={c.strengthDone >= c.strengthTarget} />
        <Target label="ZONE 2" done={c.zone2Done} target={`${c.zone2Min}–${c.zone2Max}`} met={c.zone2Done >= c.zone2Min} />
        <Target label="RUN" done={c.runsDone} target={`${c.runTarget}`} met={c.runsDone >= c.runTarget} />
        <Target label="RECOVERY" done={c.recoveryDays} target="1" met={c.recoveryDays >= 1} />
      </div>

      <div className="border-l-[3px] border-accent/60 pl-3 py-1 flex items-baseline gap-2">
        <span className="label !text-[9px] text-faint shrink-0">NEXT UP</span>
        <span className="display bg-accent text-accent-ink text-[11px] tracking-[0.06em] px-1.5 py-0.5 shrink-0">
          {c.nextStrength}
        </span>
        <span className="text-[12px] text-ink leading-snug">{next.label}</span>
      </div>
      <div className="text-[11px] text-muted leading-snug mt-2">
        Next in the rotation from your last logged session — recovery and your knee/ankle still get
        the final say. No fixed weekdays.
      </div>
    </div>
  );
}
