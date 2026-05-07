export type ApiError = {
  status: number;
  message: string;
  details?: unknown;
};

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    }
  });

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const err: ApiError = {
      status: res.status,
      message: typeof body === "string" ? body : body?.error || res.statusText,
      details: body
    };
    throw err;
  }

  return (await res.json()) as T;
}

/**
 * Production note:
 * - Replace this with a typed client per domain (inventory/customers/etc).
 * - Add auth headers (JWT) + request IDs + retry/backoff + timeouts.
 */

