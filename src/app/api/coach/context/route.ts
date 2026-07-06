import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { buildCoachContext } from "@/lib/coach-context";

// Powers the "Coach sees: …" indicator in the chat UI.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { summary } = await buildCoachContext();
    return NextResponse.json(summary);
  } catch (e) {
    return errorResponse(e);
  }
}
