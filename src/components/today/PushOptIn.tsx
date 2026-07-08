"use client";

import { useEffect, useState } from "react";
import { apiRaw } from "@/lib/client";

// "Morning coach" push opt-in. Shows a full card until enabled, then collapses
// to a one-line strip with Test / Off. All setup is one tap: request
// permission → subscribe → store on the server (see /api/push/subscribe).

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "denied" | "off" | "on";

export default function PushOptIn() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (existing) {
          setSub(existing);
          setState("on");
        } else if (Notification.permission === "denied") {
          setState("denied");
        } else {
          setState("off");
        }
      } catch {
        if (!cancelled) setState("unsupported");
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("missing vapid key");
      const next = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      await apiRaw("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ subscription: next.toJSON() }),
      });
      setSub(next);
      setState("on");
    } catch {
      if (Notification.permission === "denied") setState("denied");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const endpoint = sub?.endpoint;
      await sub?.unsubscribe();
      await apiRaw("/api/push/subscribe", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      });
      setSub(null);
      setState("off");
    } catch {
      /* leave as-is; user can retry */
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTestMsg("Sending…");
    try {
      await apiRaw("/api/push/send?test=1");
      setTestMsg("Sent — check your lock screen.");
    } catch {
      setTestMsg("Couldn't send. Try again.");
    }
    setTimeout(() => setTestMsg(null), 4000);
  };

  if (state === "loading" || state === "unsupported") return null;

  if (state === "denied") {
    return (
      <div className="mt-5 border border-line bg-surface px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-hold text-[13px] leading-none">🔔</span>
          <span className="display text-[13px] tracking-[0.1em] text-ink">
            Morning coach blocked
          </span>
        </div>
        <div className="text-[12.5px] text-muted mt-1.5 leading-relaxed">
          Notifications are turned off for HRL. Enable them in iOS Settings →
          Notifications → HRL, then reopen the app.
        </div>
      </div>
    );
  }

  if (state === "on") {
    return (
      <div className="mt-5 border border-line bg-surface px-3.5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-[7px] h-[7px] bg-accent rounded-full shrink-0" />
          <span className="display text-[12.5px] tracking-[0.1em] text-ink truncate">
            Morning coach on
          </span>
          <span className="label !text-[10px] shrink-0">· 8 AM</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {testMsg ? (
            <span className="text-[11px] text-faint">{testMsg}</span>
          ) : (
            <button
              onClick={sendTest}
              disabled={busy}
              className="display text-[11px] tracking-[0.08em] text-muted border border-line-strong px-2 py-1 hover:text-accent hover:border-accent transition-colors cursor-pointer"
            >
              Test
            </button>
          )}
          <button
            onClick={disable}
            disabled={busy}
            className="display text-[11px] tracking-[0.08em] text-faint border border-line-strong px-2 py-1 hover:text-stop hover:border-stop/50 transition-colors cursor-pointer"
          >
            Off
          </button>
        </div>
      </div>
    );
  }

  // state === "off"
  return (
    <div className="mt-5 border border-line-strong bg-surface p-3.5">
      <div className="flex items-center gap-2">
        <span className="text-accent text-[14px] leading-none">🔔</span>
        <span className="display text-[13px] tracking-[0.1em] text-ink">
          Morning coach
        </span>
      </div>
      <div className="text-[12.5px] text-muted mt-2 leading-relaxed">
        Get your brief, red-flag signals, and reminders pushed to your phone every
        morning at 8 AM. One tap — that&apos;s all the setup.
      </div>
      <button
        onClick={enable}
        disabled={busy}
        className="display w-full bg-accent text-accent-ink text-[14px] tracking-[0.1em] py-3 mt-3 hover:brightness-110 disabled:bg-surface-3 disabled:text-faint transition-colors cursor-pointer"
      >
        {busy ? "Turning on…" : "Turn on morning coach"}
      </button>
    </div>
  );
}
