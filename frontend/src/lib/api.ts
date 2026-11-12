export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

let token: string | null = null;

export function setApiToken(value: string | null) {
  token = value;
}

function getToken(): string | null {
  if (token) return token;
  try {
    return localStorage.getItem('em_auth_token');
  } catch {
    return null;
  }
}

function headersForBody(body: unknown) {
  if (body === undefined || body === null) {
    return {};
  }

  const stringified =
    typeof body === 'string' ? body : JSON.stringify(body);

  return {
    'Content-Type': 'application/json',
    body: stringified,
  };
}

export async function apiFetch<T>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
  } = {},
): Promise<T> {
  const method = opts.method ?? 'GET';

  const headers: Record<string, string> = {};

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const currentToken = getToken();
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (opts.body !== undefined) {
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }

  const res = await fetch(`${API_BASE}${path}`, init);

  if (!res.ok) {
    let message = res.statusText;
    try {
      const payload = (await res.json()) as { message?: string; error?: string };
      message = payload.message ?? payload.error ?? message;
    } catch {
      // leave the fallback message
    }

    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
