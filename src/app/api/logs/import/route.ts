import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// One-time import of v1 localStorage logs (hrl_workout_logs_v2 key).
// v1 shapes: session logs have sessionKey; run logs {type:'run'}; xtrain {type:'xtrain'}.

type V1Log = Record<string, unknown> & {
  type?: string;
  date?: string;
  run_date?: string;
  sessionKey?: string;
};

export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { logs } = (await req.json()) as { logs: V1Log[] };
    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ error: "logs array required" }, { status: 400 });
    }

    const rows = logs
      .map((log) => {
        const kind =
          log.type === "run" ? "run" : log.type === "xtrain" ? "xtrain" : "session";
        const logged_at = (log.date || log.run_date || "").slice(0, 10);
        if (!logged_at) return null;
        return {
          logged_at,
          kind,
          session_key: kind === "session" ? ((log.sessionKey as string) ?? null) : null,
          data: log,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const { data, error } = await supabase().from("hrl_logs").insert(rows).select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ imported: data.length, skipped: logs.length - rows.length });
  } catch (e) {
    return errorResponse(e);
  }
}
