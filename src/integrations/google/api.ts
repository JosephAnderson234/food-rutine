import type { GEvent } from "@app/domain/gcal";

const BASE = "https://www.googleapis.com/calendar/v3";

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
}

export interface EventQuery {
  timeMin: string;
  timeMax: string;
  /** Filtro `clave=valor` sobre extendedProperties.private. */
  privateExtendedProperty?: string;
}

/** Lo que la sincronización necesita de Google; en tests se reemplaza por una versión falsa. */
export interface CalendarApi {
  listCalendars(): Promise<GCalendar[]>;
  listEvents(calendarId: string, query: EventQuery): Promise<GEvent[]>;
  createCalendar(summary: string, timeZone: string): Promise<{ id: string }>;
  insertEvent(calendarId: string, body: object): Promise<GEvent>;
  patchEvent(
    calendarId: string,
    eventId: string,
    body: object,
  ): Promise<GEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

/** Cliente de Calendar v3 atado a un token de acceso. */
export function calendarApi(accessToken: string): CalendarApi {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        message =
          ((await res.json()) as { error?: { message?: string } }).error
            ?.message ?? message;
      } catch {
        // cuerpo vacío
      }
      throw new GoogleApiError(res.status, message);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  const enc = encodeURIComponent;

  return {
    async listCalendars() {
      const out: GCalendar[] = [];
      let pageToken: string | undefined;
      do {
        const q = new URLSearchParams({ maxResults: "250" });
        if (pageToken) q.set("pageToken", pageToken);
        const page = await call<{
          items?: GCalendar[];
          nextPageToken?: string;
        }>(`/users/me/calendarList?${q}`);
        out.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return out;
    },

    async listEvents(calendarId, query) {
      const out: GEvent[] = [];
      let pageToken: string | undefined;
      do {
        const q = new URLSearchParams({
          timeMin: query.timeMin,
          timeMax: query.timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
        });
        if (query.privateExtendedProperty)
          q.set("privateExtendedProperty", query.privateExtendedProperty);
        if (pageToken) q.set("pageToken", pageToken);
        const page = await call<{ items?: GEvent[]; nextPageToken?: string }>(
          `/calendars/${enc(calendarId)}/events?${q}`,
        );
        out.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return out;
    },

    createCalendar(summary, timeZone) {
      return call<{ id: string }>("/calendars", {
        method: "POST",
        body: JSON.stringify({ summary, timeZone }),
      });
    },

    insertEvent(calendarId, body) {
      return call<GEvent>(`/calendars/${enc(calendarId)}/events`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    patchEvent(calendarId, eventId, body) {
      return call<GEvent>(
        `/calendars/${enc(calendarId)}/events/${enc(eventId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
    },

    async deleteEvent(calendarId, eventId) {
      try {
        await call<void>(
          `/calendars/${enc(calendarId)}/events/${enc(eventId)}`,
          {
            method: "DELETE",
          },
        );
      } catch (e) {
        // Ya borrado a mano en Google: no es error.
        if (
          !(
            e instanceof GoogleApiError &&
            (e.status === 404 || e.status === 410)
          )
        )
          throw e;
      }
    },
  };
}
