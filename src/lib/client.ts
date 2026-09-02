// Client-side API helper. No auth header: the passcode gate was removed
// 2026-09-02 (single user; she'd rather it be openly reachable).

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
