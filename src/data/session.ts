import {
  ApiError,
  type AuthedApi,
  authedApi,
  type BackendUser,
  loginWithGoogle,
  logout,
  refreshTokens,
  type TokenPair,
} from "@app/integrations/backend/api";
import type { MealPrepDB, SessionRow } from "./db";

/** Renueva el access token si le queda menos de esto. */
const REFRESH_MARGIN_MS = 60_000;

function toRow(pair: TokenPair, user: BackendUser): SessionRow {
  return {
    id: "current",
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    accessExpiresAt: Date.now() + pair.expiresIn * 1000,
    user,
  };
}

export const getSession = (db: MealPrepDB) => db.session.get("current");

/** Login con el ID token de Google; guarda la sesión en este dispositivo. */
export async function signIn(
  db: MealPrepDB,
  idToken: string,
): Promise<SessionRow> {
  const { user, ...pair } = await loginWithGoogle(idToken);
  const row = toRow(pair, user);
  await db.session.put(row);
  return row;
}

/** Cierra la sesión y olvida el estado de sincronización (los datos locales se quedan). */
export async function signOut(db: MealPrepDB): Promise<void> {
  const s = await getSession(db);
  if (s) await logout(s.refreshToken).catch(() => undefined);
  await db.transaction("rw", [db.session, db.meta, db.outbox], async () => {
    await db.session.clear();
    await db.meta.clear();
    await db.outbox.clear();
  });
}

let refreshing: Promise<string> | null = null;

/** Access token vigente; renueva con el refresh token (rotativo) cuando hace falta. */
export async function accessToken(db: MealPrepDB): Promise<string> {
  const s = await getSession(db);
  if (!s) throw new ApiError(401, "Inicia sesión para sincronizar.");
  if (s.accessExpiresAt - Date.now() > REFRESH_MARGIN_MS) return s.accessToken;
  // Un solo refresh a la vez: el refresh token rota y reusarlo invalida la sesión.
  refreshing ??= (async () => {
    try {
      const pair = await refreshTokens(s.refreshToken);
      await db.session.put(toRow(pair, s.user));
      return pair.accessToken;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await db.session.clear();
      throw e;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function backend(db: MealPrepDB): AuthedApi {
  return authedApi(
    () => accessToken(db),
    async () => {
      // El servidor rechazó el token: se intentará renovar en la próxima llamada.
      const s = await getSession(db);
      if (s) await db.session.put({ ...s, accessExpiresAt: 0 });
    },
  );
}
