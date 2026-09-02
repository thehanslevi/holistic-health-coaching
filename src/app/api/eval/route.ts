import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth";
import { evalToday, replayBriefs } from "@/lib/eval";
import { supabase } from "@/lib/supabase";

// Eval harness entry point.
//   GET /api/eval               — nightly cron: judge today's brief, regenerate once if it fails
//   GET /api/eval?replay=30     — judge the last 30 stored briefs (persisted)
//   GET /api/eval?replay=30&dry=1 — same, not persisted (prompt-change check)
// Cron-authenticated like the other scheduled routes; the passcode gate is gone
// but this one spends API budget, so it keeps its own secret.
function authorize(req: NextRequest): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const queryToken = req.nextUrl.searchParams.get("key") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const passcode = process.env.APP_PASSCODE;
  if (cronSecret && token === cronSecret) return true;
  if (passcode && (token === passcode || queryToken === passcode)) return true;
  return false;
}

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = supabase();
    const replay = Number(req.nextUrl.searchParams.get("replay") ?? 0);
    if (replay > 0) {
      const dry = req.nextUrl.searchParams.get("dry") === "1";
      const results = await replayBriefs(db, Math.min(replay, 90), !dry);
      const failed = results.filter((r) => !r.passed);
      const byRule: Record<string, number> = {};
      for (const r of results) for (const v of r.violations) byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
      return NextResponse.json({
        ok: true,
        n: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        by_rule: byRule,
        results: results.map((r) => ({
          date: r.subject_date,
          passed: r.passed,
          score: r.judge.score,
          violations: r.violations,
          issues: r.judge.issues,
          content: r.content,
        })),
      });
    }
    const out = await evalToday(db);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return errorResponse(e);
  }
}
