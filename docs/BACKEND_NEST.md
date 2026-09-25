# ¿Backend en NestJS? — Análisis

> Estado actual: **local-first**. Todo vive en IndexedDB del navegador; Google Calendar y Todoist se llaman desde el navegador; el único código de servidor es `POST /api/ai` (Groq). Funciona sin internet y no cuesta nada mantenerlo.

## 1. Qué problemas reales resolvería un backend

| Hoy (sin backend) | Con backend | Peso |
|---|---|---|
| Los avisos (temporizadores, «pasar taper a la refri 21:00») solo suenan **con la app abierta**. | **Web Push** a la hora exacta aunque la app esté cerrada. | ★★★ el más valioso en el día a día |
| Los datos viven en **un solo navegador**. Si usas celular y laptop, no se ven entre sí; si borras datos del sitio, se pierden. | Sincronización entre dispositivos + respaldo. | ★★★ |
| Google Calendar: el permiso dura ~1 h; «Traer horario» es manual. | Refresh token guardado en el servidor: sincroniza solo (y con *watch channels*, al instante cuando cambia tu calendario). | ★★ |
| Tachar en Todoist no se refleja en la app. | Webhooks de Todoist (*por verificar: probablemente exigen registrar una app OAuth, no el token personal*). | ★ (ver §6: quizá se resuelve sin backend) |
| `/api/ai` no tiene login: no se puede publicar tal cual. | Autenticación + límite de uso por usuario. | ★★ si se publica |
| Pensada para una persona. | Multiusuario real («pensada para otros»). | depende del objetivo |

## 2. Lo que cuesta

- **Hosting permanente** (servidor + Postgres) y alguien que lo mantenga.
- **Sincronización offline**: es la parte difícil. Hay que resolver conflictos entre lo que hiciste sin conexión en el celular y lo que cambió en la laptop.
- **Seguridad**: tokens de Google/Todoist cifrados en la base, sesiones, CORS, rate limits.
- Deja de ser «abre y funciona»: requiere login.

## 3. Opciones

### A) Seguir local-first + servidor mínimo solo para avisos
Rutas de Next (ya existen) + Neon Postgres + un programador de mensajes con precisión de minuto.
- ⚠️ **Vercel Cron en plan Hobby no sirve**: *«Cron jobs can only run once per day»* y con precisión *«±59 min»* (docs de Vercel, verificado). Hace falta Pro, o un servicio de mensajes diferidos (p. ej. Upstash QStash: «entrega este aviso a las 21:00»).
- Resuelve solo el ★★★ de avisos. Barato y chico.

### B) Backend NestJS + PostgreSQL + Prisma (tu stack)
Servidor propio que concentra sync, avisos, integraciones e IA.
- Resuelve todo lo de la tabla.
- Es la opción que mejor muestra arquitectura en un portafolio.
- Más piezas y más tiempo.

### C) Motor de sync gestionado (p. ej. Dexie Cloud, que encaja con Dexie que ya usamos)
Sincronización entre dispositivos casi sin código propio. *Por verificar*: precio/plan gratis y si cubre auth. No resuelve push ni integraciones: habría que combinarlo con A.

## 4. Si se hace en NestJS: arquitectura propuesta

### 4.1 Monorepo con dominio compartido (vale la pena en cualquier caso)
`src/domain` es TypeScript puro (sin React, sin Dexie, con tests). Se extrae a un paquete y lo usan **los dos**:

```
apps/
  web/        Next.js (lo actual)
  api/        NestJS
packages/
  domain/     buildWeek, carryOver, planPrep, safety, gcal, todo… (+ tests)
```

El servidor calcula exactamente lo mismo que el cliente: ej. para programar el aviso «descongelar 21:00» basta con `buildWeek` + `plan.tasks`.

### 4.2 Módulos
| Módulo Nest | Responsabilidad |
|---|---|
| `AuthModule` | Login con Google (OAuth con **refresh token**), sesión JWT/cookie. |
| `SyncModule` | `POST /sync/push` (cambios del cliente) y `GET /sync/pull?since=cursor`. |
| `PlanModule` | Recalcula semanas con `@mealprep/domain` cuando cambian horario o ajustes. |
| `NotificationsModule` | Suscripciones Web Push (VAPID) + cola de avisos programados (BullMQ/Redis o pg-boss sobre Postgres). |
| `CalendarModule` | Pull/push a Google en segundo plano; *watch channels* para enterarse de cambios. |
| `TodoistModule` | Envío de tareas; webhooks para reflejar lo tachado (si se registra app OAuth). |
| `AiModule` | Proxy a Groq con auth y límite por usuario (reemplaza `/api/ai`). |

### 4.3 Datos (Prisma / Postgres)
`User`, `Settings` (JSON), `Week`, `Portion`, `DayCheck`, `InventoryItem`, `ManualEvent`, `CalendarCache`, `IntegrationAccount` (tokens **cifrados**), `PushSubscription`, `ScheduledNotification`.

### 4.4 Sincronización (la parte delicada)
- IndexedDB sigue siendo la fuente para la UI (la app sigue funcionando offline).
- Cada cambio local va a una **bandeja de salida** (outbox) y se envía al volver la conexión; el servidor asigna versión y devuelve un **cursor** para el pull.
- Conflictos por tipo:
  - **Porciones**: sus estados solo avanzan (`frozen → thawing → packed → eaten`). Gana el más avanzado: sin conflictos reales.
  - **Casillas**: unión (marcado gana).
  - **Ajustes / inventario**: último en escribir gana, por campo.

### 4.5 Despliegue
- Nest con **worker de larga duración** (la cola de avisos) → Railway / Render / Fly con Postgres (Neon).
- En Vercel, Nest corre como funciones: sirve para la API pero **no** para un worker permanente; la cola tendría que ser QStash/Vercel Queues.

## 5. Plan por fases (si se decide B)

1. **Fase 0 — Monorepo** (sin cambiar comportamiento): mover `src/domain` a `packages/domain`. *~medio día.*
2. **Fase 1 — Avisos reales**: Nest + Postgres + login Google + Web Push programado (descongelar, lonchera, temporizadores). *Lo de más valor diario.*
3. **Fase 2 — Respaldo y multi-dispositivo**: outbox + pull por cursor.
4. **Fase 3 — Integraciones del lado servidor**: Calendar automático, Todoist en ambos sentidos, IA con auth.

## 6. Cosas que quizá no necesitan backend

- **Todoist en ambos sentidos**: la API v1 podría tener un endpoint de tareas completadas que distinga *tachada* de *borrada* con el token personal. **Por verificar**; si existe, se hace desde el navegador.
- **Avisos con la app abierta**: ya funcionan (PWA + `TimerWatcher`).

## 7. Recomendación

- **Si la app es solo para ti y un dispositivo**: Nest es más de lo que necesitas. Lo que duele (avisos con la app cerrada) se resuelve con la opción **A**.
- **Si quieres usarla en celular + laptop, o que otros la usen, o mostrar arquitectura en tu portafolio**: **B (NestJS)**, empezando por la Fase 0 (sirve igual) y la Fase 1 (avisos).

Decisiones que definen el camino:
1. ¿Objetivo: herramienta personal o producto/portafolio multiusuario?
2. ¿Presupuesto de hosting (gratis vs ~5–20 USD/mes)?
3. ¿OK pasar el repo a monorepo (pnpm workspaces)?
