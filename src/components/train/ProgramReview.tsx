"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/client";
import { Button, Dots, ScreenHeader } from "@/components/ui";

// Coach-driven structural review of the whole program against her goals. Advice
// she acts on — recommends adding / swapping / dropping exercises, not weights.
export default function ProgramReview({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (refresh = false) => {
    setLoading(true);
    setError(null);
    api<{ content: string }>(`/api/program/review${refresh ? "?refresh=1" : ""}`)
      .then((r) => setContent(r.content))
      .catch(() => setError("Couldn't build the review. Try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="px-4 pb-8 fade-up">
      <ScreenHeader
        title="Program review"
        subtitle="Structural read against your goals"
        onBack={onClose}
        right={
          content && !loading ? (
            <button
              onClick={() => load(true)}
              className="label hover:text-muted cursor-pointer"
            >
              refresh
            </button>
          ) : undefined
        }
      />

      {loading && !content ? (
        <div className="py-10 flex flex-col items-center gap-3">
          <Dots />
          <div className="text-[12px] text-faint">Reading your whole program…</div>
        </div>
      ) : error ? (
        <div>
          <div className="text-sm text-stop mb-3">{error}</div>
          <Button variant="secondary" size="md" onClick={() => load()}>
            Retry
          </Button>
        </div>
      ) : content ? (
        <div className="coach-md text-[14px] leading-relaxed text-muted [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-2 [&_strong]:text-ink [&_h1]:hidden [&_h2]:display [&_h2]:text-[15px] [&_h2]:text-ink [&_h2]:mb-2 [&_h2]:mt-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          <div className="text-[11px] text-faint mt-6 border-t border-line pt-3">
            These are recommendations, not changes. Adjust targets in a session, or ask your coach
            to talk any of these through.
          </div>
        </div>
      ) : null}
    </div>
  );
}
