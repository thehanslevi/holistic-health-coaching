import { NextRequest, NextResponse } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Stores (POST) or removes (DELETE) a Web Push subscription for this device.
// Single-user app, so every subscription belongs to Hannah; we key on the
// push endpoint (unique per device+browser) and upsert.

type IncomingSub = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const sub = (await req.json())?.subscription as IncomingSub | undefined;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return NextResponse.json(
        { error: "A subscription with endpoint and keys is required." },
        { status: 400 },
      );
    }
    const { error } = await supabase()
      .from("hrl_push_subs")
      .upsert(
        {
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: req.headers.get("user-agent") ?? null,
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const endpoint = (await req.json())?.endpoint as string | undefined;
    const db = supabase();
    // No endpoint → clear all (used by a full "turn off" that lost the sub).
    const query = endpoint
      ? db.from("hrl_push_subs").delete().eq("endpoint", endpoint)
      : db.from("hrl_push_subs").delete().neq("endpoint", "");
    const { error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
