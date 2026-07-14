import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { fetchProgramChanges } from "@/lib/program-server";

// The record of every change made to her program, newest first. The coach may
// edit unprompted, which is only acceptable because this exists: nothing it does
// is silent, and everything it does is undoable.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json(await fetchProgramChanges());
  } catch (e) {
    return errorResponse(e);
  }
}
