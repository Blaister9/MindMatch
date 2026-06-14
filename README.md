# MindMatch — Demo MVP

Monorepo del demo de MindMatch (app de conexión social entre pacientes de salud
mental, supervisada por una doctora). Ver `CLAUDE.md` para la guía completa del
proyecto y las reglas de arquitectura.

## Estructura

```
apps/
  api/            Fastify + TypeScript + Drizzle (esquemas social/clinical/analytics)
  patient-app/    React 19 + Vite + Tailwind (PWA, mobile-first)
  doctor-panel/   React 19 + Vite + Tailwind (desktop-first)
packages/
  shared/         Tipos y schemas Zod compartidos (contratos API)
```

## Requisitos

- Node ≥ 22
- pnpm (vía `corepack` o `npm i -g pnpm`)
- Docker (Postgres 16 + pgvector, Redis)
- Puerto host `55432` disponible para PostgreSQL local del proyecto

## Puesta en marcha

```bash
cp .env.example .env          # ajusta secretos si quieres
docker compose up -d          # Postgres + Redis
pnpm install
pnpm db:migrate               # crea pgvector, esquemas, tablas, restricciones e índices
pnpm --filter @mindmatch/api bootstrap:doctor
pnpm dev                      # api (:3001) + paciente (:5173) + panel (:5174)
```

La URL local de base de datos documentada es
`postgres://mindmatch:mindmatch@localhost:55432/mindmatch` para evitar colisión
con instalaciones locales de PostgreSQL en `5432`.

El modelo de datos canónico está documentado en
`docs/architecture-data-model.md`.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta api + ambos frontends |
| `pnpm seed` | Resetea y siembra datos demo |
| `pnpm test` | Tests del motor de reglas y guards |
| `pnpm db:generate` | Genera migración Drizzle desde el esquema |
| `pnpm db:migrate` | Aplica migraciones (crea extensión pgvector) |
| `docker compose up -d` | Postgres + Redis locales |

## Credenciales demo

- Clínica (slug): `mindmatch-demo`
- Doctora: `doctora@demo.com` / `Demo123!`
- Pacientes: `<nombre>@demo.com` / `Demo123!` (también entran por link de invitación;
  no hay registro abierto).

> **Login multi-tenant:** `POST /auth/login` recibe `clinicSlug`, `email` y
> `password`. El servidor resuelve primero la clínica por slug (activa) y luego
> el usuario dentro de esa clínica; el `clinicId` de la sesión sale siempre de la
> base de datos, nunca de una afirmación del frontend. Cualquier fallo (clínica
> inexistente o inactiva, email inexistente, cuenta no activa o contraseña
> incorrecta) responde el mismo `401` genérico. En los frontends el campo de
> clínica viene prellenado con `VITE_DEFAULT_CLINIC_SLUG`.

## Seed demo (Fase 2)

`pnpm seed` resetea y reconstruye **únicamente** el tenant con slug
`mindmatch-demo`, de forma idempotente, determinista y atómica (reset + inserción
+ verificación crítica en una sola transacción; si la verificación falla, hace
rollback). Una segunda verificación de solo lectura corre tras el commit.

### Ejecución segura

```bash
docker compose up -d
pnpm db:migrate
ALLOW_DEMO_SEED=true pnpm seed     # o define ALLOW_DEMO_SEED=true en tu .env
pnpm seed                          # correrlo dos veces deja el MISMO dataset lógico
pnpm --filter @mindmatch/api seed:verify
```

Guardas (si alguna falla, aborta sin tocar la base):

- `NODE_ENV` distinto de `production`.
- `ALLOW_DEMO_SEED=true` (bandera explícita).
- Host de DB `localhost`/`127.0.0.1` y puerto `SEED_ALLOWED_DB_PORT` (por defecto `55432`).
- Slug objetivo exactamente `mindmatch-demo`.
- La doctora demo no está activa en otra clínica (de lo contrario aborta y **no**
  borra esa clínica; usa una base local nueva o resuélvelo a mano).

> ⚠️ El reset borra y reconstruye **solo** `mindmatch-demo`, en orden hijo→padre
> por `clinic_id`. Nunca usa `TRUNCATE` global, `docker compose down -v`,
> `db:push` ni borra otras clínicas.

### Cuentas demo

- Clínica: `mindmatch-demo`
- Doctora: `doctora@demo.com` / `Demo123!`
- Pacientes: `mariana`, `daniel`, `laura`, `andres`, `valentina`, `camilo`,
  `juliana`, `felipe` (todos `<nombre>@demo.com` / `Demo123!`).

### Conteos esperados

1 clínica · 1 doctora · 8 pacientes · 8 invitaciones aceptadas · 8 perfiles ·
15 intereses (3–6 por perfil) · 8 registros clínicos · 8 preferencias ·
112 check-ins · 18 match scores · 7 conexiones (2 active, 4 pending_approval,
1 paused) · 2 conversaciones directas (30 mensajes) · 1 grupo "Ansiedad social"
(5 miembros, 20 mensajes) · 0 embeddings · 0 alerts · 0 risk scores ·
0 eventos analytics.

### Verificación e idempotencia

El verificador (incluido en el seed y disponible como `seed:verify`) comprueba
conteos, unicidad de emails, mayoría de edad, `source_invitation_id` no nulo,
subconjunto de tipos de conexión, aislamiento de tenant por joins, que Mariana
satisface R1 y R2, y que el resto **no** dispara R1–R5. Además calcula una
**firma lógica** (hash del dataset sin ids ni timestamps técnicos, sin
contraseñas ni tokens): dos ejecuciones el mismo día producen la misma firma.

### Limitaciones de Fase 2

- Sin IA externa: scores y explicaciones están precalculados (`source = demo`);
  no se llama a Claude API ni a embeddings.
- Sin datos reales: todo es ficticio y local. No se imprimen contraseñas,
  tokens ni hashes.
- No se siembran embeddings, alertas, risk scores ni eventos analytics; el
  Pulso se ejecuta desde check-ins reales o desde `Simular dia`.

## Fase 3 — Matching, swipe y aprobación

Flujo de descubrimiento y conexión supervisada:

- **Paciente** (`requireRole('patient')`):
  - `GET /patient/discovery/candidates` — deck de candidatos (sin email, sin
    fecha de nacimiento: solo edad; sin `clinic_id` ni datos clínicos).
  - `POST /patient/swipes` `{ targetProfileId, decision }` — `like`/`pass`. La
    decisión es inmutable (primera gana; cambiarla devuelve `409`). El backend
    revalida filtros duros y toma el score real; nunca confía en el cliente.
  - `GET /patient/connections` — estado de sus conexiones (sin chat).
- **Doctora** (`requireRole('doctor')`):
  - `GET /doctor/matches/pending` — bandeja de matches `pending_approval`
    (sin cuerpos de mensajes).
  - `POST /doctor/matches/:id/approve` — crea la conversación y deja la conexión
    en `active` (registra `clinical.match_decisions`).
  - `POST /doctor/matches/:id/pause` — pausa un match pendiente.

Reglas clave: el `like` mutuo crea **una** conexión `pending_approval` con
`match_score_id` no nulo; el tipo de conexión se deriva del par (prioridad
`friendship`, luego `romantic`; `group` es membresía, no swipe). Match mutuo y
aprobación son transaccionales e idempotentes (advisory lock por par + índices
únicos).

Proveedor de matching seleccionable con `MATCHING_PROVIDER`:

- `demo` (por defecto): lee `social.match_scores` sembrados.
- `pgvector`: similitud coseno sobre `social.profile_embeddings`; si faltan
  embeddings devuelve un estado controlado (deck vacío) sin llamar servicios
  externos.

## Fase 5 - Pulso emocional y reglas

El Pulso Emocional usa reglas deterministicas TypeScript puras. No usa LLM,
embeddings, BullMQ ni servicios externos; `clinical.risk_scores` permanece sin
poblar.

Todas las fechas logicas son `YYYY-MM-DD` en `America/Bogota`. `triggered_at`
sigue siendo timestamp real. El reloj de negocio resuelve clinicas normales con
fecha real Bogota y `mindmatch-demo` con `social.demo_clocks.current_date`
cuando `DEMO_MODE=true`.

Reglas:

- R1: 10 fechas consecutivas terminando en `asOfDate`; compara ultimos 3 dias
  contra los 7 previos con `6 * previousSum - 14 * recentSum >= 63`.
- R2: animo `<= 2` por 3+ dias consecutivos; severidad alta.
- R3: preferencia habilitada y sin check-in por 3+ dias; usa `enabled_on`.
- R4: sueno `<= 2` por 4+ dias consecutivos; severidad media.
- R5: 7 dias sin conexion social y tendencia plana/negativa usando el numerador
  entero `n * sum(xy) - sum(x) * sum(y) <= 0`.
- R6: nace exclusivamente de reportes de chat.

Las alertas son eventos inmutables. Editar el check-in del dia actual reevalua,
pero no borra ni reescribe alertas existentes. La deduplicacion es por episodio:
`R1:<episodeStartDate>`, `R2:<streakStartDate>`, `R3:<absenceStartDate>`,
`R4:<streakStartDate>`, `R5:<episodeStartDate>` y `R6:<messageReportId>`.

Paciente:

- `GET /patient/pulse/today`
- `PUT /patient/pulse/today`
- `GET /patient/pulse/history?days=7|30`
- `GET /patient/pulse/preferences`
- `PUT /patient/pulse/preferences`

Doctora:

- `GET /doctor/alerts`
- `GET /doctor/alerts/:alertId`
- `POST /doctor/alerts/:alertId/manage`
- `GET /doctor/patients/:patientUserId/pulse?days=7|30`
- `POST /doctor/demo/simulate-day`

`POST /doctor/alerts/:alertId/manage` coordina R6 en la misma transaccion:
alerta `managed` y `message_reports.status = reviewed`, sin consultar ni
devolver cuerpo/detalles de mensajes.

`POST /doctor/demo/simulate-day` acepta solo `requestId` UUID, toma tenant de la
sesion, exige doctora y `DEMO_MODE=true`, bloquea transaccionalmente la clinica
y avanza exactamente un dia. Repetir el mismo `requestId` devuelve el mismo
resultado sin avanzar. La primera simulacion tras seed limpio crea ocho
check-ins y solo dos alertas nuevas: R1 media y R2 alta para Mariana.

`pnpm pulse:evaluate` evalua clinicas normales con fecha real Bogota. El
scheduler se activa solo con `PULSE_SCHEDULER_ENABLED=true`, esta deshabilitado
por defecto y omite `mindmatch-demo` cuando `DEMO_MODE=true`. Varias instancias
se coordinan mediante advisory locks de PostgreSQL.

Privacidad y limitaciones:

- Pacientes no reciben `ruleCode`, `alertId`, severidad, `dedupeKey`,
  `inputsJson` ni ids clinicos.
- Doctora no recibe mensajes de chat ni previews.
- No hay IA, risk score, push notifications reales, RLS, Power BI ni hardening
  productivo en esta fase.

## Fase 1

URLs locales:

- API: `http://127.0.0.1:3001`
- App paciente: `http://localhost:5173`
- Panel doctora: `http://localhost:5174`
- PostgreSQL Docker: `localhost:55432`

Flujo mínimo:

1. Levanta Docker y aplica migraciones.
2. Ejecuta `pnpm --filter @mindmatch/api bootstrap:doctor`.
3. Entra al panel de la doctora.
4. Crea una invitación.
5. Copia el enlace `http://localhost:5173/invitacion#token=...`.
6. Abre el enlace en la app paciente, crea contraseña y completa perfil.

Variables relevantes:

- `FRONTEND_ORIGINS`: allowlist CORS con credenciales.
- `PATIENT_APP_URL`: base para construir enlaces de invitación.
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`.
- `DEMO_DOCTOR_EMAIL`, `DEMO_DOCTOR_PASSWORD`: solo bootstrap local.

Limitaciones de Fase 1:

- No hay correos reales; el panel muestra un enlace copiable.
- No hay seed completo de Fase 2.
- No hay swipe, matching, chat, check-in, alertas, Socket.io, BullMQ ni IA.
- Refresh tokens no tienen familia de rotación; queda como pendiente de producción.

## Fase 6 — Sala de control, misiones y analítica

Panel de la doctora con navegación interna: **Sala de control**, **Pacientes e
invitaciones**, **Matches**, **Conexiones y reportes**, **Pulso emocional** y
**Analítica**.

- **Sala de control:** cuatro métricas (pacientes activos, check-ins de hoy,
  alertas abiertas —con cuántas se dispararon hoy—, matches pendientes), fecha
  lógica del Business Clock, indicador de modo demo y grid de pacientes con
  semáforo determinístico (`verde|amarillo|rojo`, con etiqueta e icono). El
  semáforo es operativo, no diagnóstico: *"Estado de seguimiento según alertas
  abiertas y actividad reciente."*
- **Misiones de bienestar:** la doctora asigna y cancela; el paciente ve y
  completa las propias. No son prescripciones médicas.
- **Analítica (Recharts):** ánimo colectivo (promedio + tamaño de muestra, sin
  imputar faltantes), alertas por regla/severidad, matching (tasa de aprobación
  con denominador explícito) y embudo de adopción por cohorte de invitaciones.

### Analítica: generación de métricas

`analytics.patient_daily_metrics` y `analytics.clinic_daily_metrics` se
reconstruyen con un comando determinístico (no se siembran):

```bash
pnpm seed
pnpm seed
pnpm --filter @mindmatch/api seed:verify   # exige analytics vacío (seed limpio)
pnpm analytics:refresh                      # rellena snapshots (correr DESPUÉS de verify)
```

- Las métricas históricas (ánimo, sueño, check-ins, mensajes, alertas) se
  reconstruyen exactamente por fecha desde las tablas fuente.
- El snapshot operativo (pacientes activos, conexiones activas, matches
  pendientes) se escribe **solo** en la fila del día actual; no se hace backfill
  de estado actual sobre fechas pasadas.
- `mindmatch-demo` se actualiza con `pnpm analytics:refresh` y con **Simular
  día** (que refresca analytics dentro de su misma transacción). Las clínicas
  normales se refrescan tras la evaluación diaria del scheduler de Pulso.
- `analytics.events` queda reservado para una evolución futura de
  instrumentación explícita.

### Microfase de integridad (post-Fase 6)

- **Fecha de negocio de las alertas:** las alertas R1–R5 se ubican por su fecha
  lógica `inputs_json.asOfDate` (la que evaluó el motor, p. ej. con el reloj
  demo); R6 usa la fecha Bogotá de `triggered_at`. Si una alerta R1–R5 histórica
  no tuviera un `asOfDate` válido, cae al `triggered_at` y se cuenta como
  fallback (sin exponer `inputs_json`). Esta semántica única se usa en
  `openAlertsToday`, en `analytics:refresh` y en `GET /doctor/analytics/alerts`.
  `triggered_at` se conserva intacto para auditoría.
- **Embudo:** además de `dataQualityWarning`, el DTO incluye
  `dataQualityIssues` (etapas y conteos) cuando una etapa supera a la anterior.
  Los conteos reales nunca se ajustan ni se inventan swipes; el aviso es
  informativo.
- **Snapshots operativos:** `clinic_daily_metrics.{activePatients,
  matchesPending,activeConnections}` y `patient_daily_metrics.activeConnections`
  son estado actual NO reconstruible históricamente. Solo la fila del día actual
  contiene el valor real; en fechas pasadas quedan en `0` técnico (la columna es
  `NOT NULL`). Ese `0` significa "no disponible", no "no había": **ningún
  endpoint ni gráfica lo lee** — las cifras operativas se calculan en vivo desde
  las tablas fuente. No se requiere migración. Las métricas históricas exactas
  (ánimo, sueño, check-ins, mensajes, alertas por día) sí son fidedignas.

### Runtime compilado de la API

Desarrollo usa TypeScript en watch:

```bash
pnpm --filter @mindmatch/api dev
```

El runtime compilado se construye y arranca con JavaScript emitido en `dist`:

```bash
pnpm --filter @mindmatch/api build
pnpm --filter @mindmatch/api start
```

El build de la API ejecuta `tsc` y luego normaliza los imports ESM relativos del
artefacto para que Node 22 pueda resolverlos sin loaders ni flags
experimentales. `start` respeta las variables del `.env` de la raiz, no activa
watch y debe responder:

```bash
curl http://127.0.0.1:3001/health
```
