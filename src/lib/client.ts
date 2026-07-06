// Client-side API helper: every request carries the passcode as a bearer token.

const PASSCODE_KEY = "hrl_passcode";

export function getPasscode(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(PASSCODE_KEY);
}

export function setPasscode(code: string) {
  localStorage.setItem(PASSCODE_KEY, code);
}

export function clearPasscode() {
  localStorage.removeItem(PASSCODE_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await apiRaw(path, options);
  return (await res.json()) as T;
}

export async function apiRaw(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getPasscode() ?? ""}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.clone().json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return res;
}
