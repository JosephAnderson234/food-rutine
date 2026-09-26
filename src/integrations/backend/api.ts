/** Cliente HTTP del backend (food-rutine-api). La sesión viaja en Authorization: Bearer. */

/** URL del backend; se configura por entorno (no se escribe en el código). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(
  /\/$/,
  "",
);
export const API_CONFIGURED = API_URL !== "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Segundos. */
  expiresIn: number;
}

export interface BackendUser {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
}

export interface RemoteChange {
  collection: string;
  docId: string;
  data: unknown;
  clientUpdatedAt: string;
}

export interface PulledChange {
  collection: string;
  docId: string;
  data: unknown;
  deleted: boolean;
  clientUpdatedAt: string;
  version: string;
}

export interface RemoteReminder {
  key: string;
  title: string;
  body: string;
  url: string;
  fireAt: string;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  if (!API_CONFIGURED) {
    throw new ApiError(
      0,
      "Falta NEXT_PUBLIC_API_URL: el backend no está configurado.",
    );
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Sin conexión con el servidor.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    throw new ApiError(res.status, message ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const loginWithGoogle = (idToken: string) =>
  request<TokenPair & { user: BackendUser }>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });

export const refreshTokens = (refreshToken: string) =>
  request<TokenPair>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });

export const logout = (refreshToken: string) =>
  request<void>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });

export const vapidPublicKey = () =>
  request<{ publicKey: string }>("/push/public-key");

/** Operaciones que requieren sesión; `token()` entrega un access token vigente. */
export interface AuthedApi {
  push(
    changes: RemoteChange[],
  ): Promise<{ applied: number; skipped: number; cursor: string }>;
  pull(
    since: string,
    limit: number,
  ): Promise<{ changes: PulledChange[]; cursor: string; hasMore: boolean }>;
  replaceReminders(
    scope: string,
    reminders: RemoteReminder[],
  ): Promise<unknown>;
  subscribe(sub: PushSubscriptionJSON): Promise<void>;
  unsubscribe(endpoint: string): Promise<void>;
}

export function authedApi(
  token: () => Promise<string>,
  onUnauthorized: () => Promise<void>,
): AuthedApi {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    try {
      return await request<T>(path, init, await token());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await onUnauthorized();
      throw e;
    }
  }
  return {
    push: (changes) =>
      call("/sync/push", { method: "POST", body: JSON.stringify({ changes }) }),
    pull: (since, limit) =>
      call(`/sync/pull?since=${encodeURIComponent(since)}&limit=${limit}`),
    replaceReminders: (scope, reminders) =>
      call(`/reminders/${encodeURIComponent(scope)}`, {
        method: "PUT",
        body: JSON.stringify({ reminders }),
      }),
    subscribe: (sub) =>
      call("/push/subscriptions", {
        method: "POST",
        body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }),
      }),
    unsubscribe: (endpoint) =>
      call("/push/subscriptions", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      }),
  };
}
