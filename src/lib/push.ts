import webpush from "web-push";
import { supabase } from "@/lib/supabase";

// Web Push (VAPID). Server-side only. VAPID keys live in env:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — also exposed to the client for subscribe()
//   VAPID_PRIVATE_KEY             — server secret
//   VAPID_SUBJECT                 — mailto: contact for push services

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:coach@hrl.app";
  if (!publicKey || !privateKey) {
    throw new PushConfigError(
      "Push is not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export class PushConfigError extends Error {}

export type PushPayload = {
  title: string;
  body: string;
  /** Path opened when the notification is tapped */
  url?: string;
  tag?: string;
};

type SubRow = { endpoint: string; p256dh: string; auth: string };

/**
 * Send a notification to every stored subscription. Dead subscriptions
 * (404/410 from the push service) are pruned automatically. Returns a count of
 * how many succeeded and how many were removed.
 */
export async function sendPushToAll(
  payload: PushPayload,
): Promise<{ sent: number; removed: number; total: number }> {
  ensureConfigured();
  const db = supabase();
  const { data: subs, error } = await db
    .from("hrl_push_subs")
    .select("endpoint, p256dh, auth");
  if (error) throw new Error(error.message);

  const rows = (subs ?? []) as SubRow[];
  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent += 1;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          dead.push(s.endpoint);
        } else {
          console.error("push send failed", s.endpoint, status ?? e);
        }
      }
    }),
  );

  if (dead.length) {
    await db.from("hrl_push_subs").delete().in("endpoint", dead);
  }
  if (sent) {
    // Any subscription that didn't get pruned just delivered successfully.
    const live = rows
      .map((r) => r.endpoint)
      .filter((e) => !dead.includes(e));
    if (live.length) {
      await db
        .from("hrl_push_subs")
        .update({ last_success_at: new Date().toISOString() })
        .in("endpoint", live);
    }
  }

  return { sent, removed: dead.length, total: rows.length };
}
