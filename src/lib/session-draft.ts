import type { SessionLogData } from "@/lib/types";

// In-progress guided session, kept in localStorage so backgrounding the PWA
// (which iOS may reload from scratch) doesn't wipe already-logged sets. Cleared
// on save.

const DRAFT_KEY = "volt_session_draft";
const DRAFT_MAX_AGE = 18 * 3600 * 1000; // ignore drafts older than 18h

export type SessionDraft = {
  sessionKey: string;
  stage: { name: string; idx?: number };
  log: SessionLogData;
  doneSets: Record<string, boolean>;
  savedAt: number;
};

export function readSessionDraft(): SessionDraft | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SessionDraft;
    if (!d?.sessionKey || !d.stage || !d.log) return null;
    if (Date.now() - (d.savedAt ?? 0) > DRAFT_MAX_AGE) return null;
    return d;
  } catch {
    return null;
  }
}

export function writeSessionDraft(d: Omit<SessionDraft, "savedAt">) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

export function clearSessionDraft() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
