import { NextRequest, NextResponse } from "next/server";
import { SupabaseConfigError } from "@/lib/supabase";

// Single-user passcode auth. The app client sends `Authorization: Bearer
// <APP_PASSCODE>`; the iOS Health shortcut can instead pass `?key=<APP_PASSCODE>`
// in the URL (same secret) so it needs no custom headers.

export function checkAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.APP_PASSCODE;
  if (!expected) {
    return NextResponse.json(
      { error: "APP_PASSCODE is not set on the server." },
      { status: 500 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const headerToken = header.replace(/^Bearer\s+/i, "");
  const queryToken = req.nextUrl.searchParams.get("key") ?? "";
  const token = headerToken || queryToken;
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof SupabaseConfigError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  const message = e instanceof Error ? e.message : "Unexpected server error";
  return NextResponse.json({ error: message }, { status: 500 });
}
