# Conectar Google Calendar

La app habla con Google **solo desde tu navegador** (sin backend). Necesita un *Client ID* de OAuth, que se crea gratis en Google Cloud en ~10 minutos.

## Qué permisos pide

| Permiso | Para qué |
|---|---|
| `calendar.calendarlist.readonly` | Ver la lista de tus calendarios para elegir cuál es fijo y cuál flexible |
| `calendar.events.readonly` | Leer tus cursos y eventos para ubicar gym y meal prep |
| `calendar.app.created` | Crear **su propio** calendario «Meal Prep» y escribir solo ahí |

La app **no puede** modificar ni borrar tus otros eventos.

## Pasos

### 1. Proyecto

1. Entra a <https://console.cloud.google.com> con tu **Gmail personal** (recomendado; ver «Si UTEC bloquea la app» abajo).
2. Arriba, selector de proyecto → **Nuevo proyecto** → nombre `Meal Prep` → Crear.

### 2. Activar la API

**APIs y servicios → Biblioteca** → busca **Google Calendar API** → **Habilitar**.

### 3. Pantalla de consentimiento

**Google Auth Platform** (o «Pantalla de consentimiento de OAuth»):

1. **Información de la app**: nombre `Meal Prep`, tu correo de soporte.
2. **Público**: tipo **Externo**. Deja la app en modo **Prueba**.
3. **Usuarios de prueba** → agrega las cuentas que vas a conectar:
   - `joseph.cose@utec.edu.pe`
   - tu Gmail (por si usas el plan B)
4. **Acceso a datos** → **Agregar o quitar permisos** → pega los tres de la tabla de arriba (prefijo `https://www.googleapis.com/auth/`).

### 4. Credencial

**Clientes → Crear cliente**:

- Tipo: **Aplicación web**
- **Orígenes de JavaScript autorizados**:
  - `http://localhost:3000`
  - `http://localhost:3100`
  - (más adelante, la URL donde publiques la app)
- URIs de redireccionamiento: **no hacen falta**.

Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).

### 5. Configurar la app

```bash
cp .env.example .env.local
# edita .env.local:
NEXT_PUBLIC_GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
```

Reinicia `pnpm dev` (las variables se leen al arrancar).

### 6. Conectar

1. Abre **Semana → ⚙ Ajustes → Conectar con Google**.
2. Elige tu cuenta UTEC. Verás «Google no verificó esta app»: es normal en modo Prueba → **Continuar**.
3. Marca **Utec Courses = Fijo** y tu calendario principal = **Flexible** → **Guardar**.
4. **Traer horario**: lee esta semana y la próxima y recalcula el plan (conserva lo ya cocinado).
5. **Enviar semana a Calendar**: crea el calendario «Meal Prep» con gym, meal prep y recordatorios (descongelar, gel packs, lonchera) con notificación.

Puedes repetir ambos botones cuando quieras: no duplica eventos.

## Si UTEC bloquea la app (plan B)

Si al conectar con la cuenta UTEC aparece *«Acceso bloqueado: tu administrador…»* o `admin_policy_enforced`, la universidad no permite apps externas no verificadas. Entonces:

1. En Google Calendar **con la cuenta UTEC**: ⚙ de **Utec Courses** → **Compartir con personas específicas** → tu Gmail → permiso **Ver todos los detalles del evento**. Haz lo mismo con tu calendario principal.
2. Acepta la invitación desde tu Gmail.
3. En la app, conéctate con el **Gmail**: aparecerán los calendarios compartidos. Márcalos como Fijo/Flexible.
4. «Meal Prep» se creará en tu Gmail; puedes compartirlo de vuelta a la cuenta UTEC si quieres verlo ahí.

## Problemas comunes

| Mensaje | Solución |
|---|---|
| `Falta NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Paso 5 y reinicia el servidor |
| `redirect_uri_mismatch` / `origin_mismatch` | El puerto de `localhost` no está en «Orígenes autorizados» (paso 4) |
| `access_denied` | La cuenta no está en **Usuarios de prueba** (paso 3.3) |
| `invalid_scope` con `calendar.app.created` | Tu consola aún no ofrece ese permiso: cámbialo por `https://www.googleapis.com/auth/calendar` en `src/integrations/google/gis.ts` y en la pantalla de consentimiento (más amplio, pero funciona igual) |
| El navegador bloqueó la ventana | Permite ventanas emergentes para `localhost` |
| Pide permiso cada hora | Es el modelo sin backend: el token dura ~1 h; al tocar un botón se renueva con un clic |
