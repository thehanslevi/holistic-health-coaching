"use client";

import { useState } from "react";
import { Button, Card, TrafficLight, type Light } from "@/components/ui";

export default function SavedSummary({
  title,
  text,
  light,
  advice,
  onDone,
  onAskCoach,
}: {
  title: string;
  text: string;
  light?: Light;
  advice?: string;
  onDone: () => void;
  onAskCoach: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fade-up py-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-bold text-go">{title}</div>
          {light && <TrafficLight light={light} />}
        </div>
        {advice && <div className="text-xs text-muted mb-3">{advice}</div>}
        <pre className="bg-surface-2 border border-line p-3 text-[11px] leading-relaxed text-muted whitespace-pre-wrap max-h-64 overflow-y-auto num">
          {text}
        </pre>
        <div className="flex gap-2 mt-3">
          <Button size="md" variant="secondary" className="flex-1" onClick={copy}>
            {copied ? "Copied ✓" : "Copy text"}
          </Button>
          <Button size="md" variant="secondary" className="flex-1" onClick={() => onAskCoach(text)}>
            Ask coach
          </Button>
          <Button size="md" onClick={onDone}>
            Done
          </Button>
        </div>
      </Card>
    </div>
  );
}
