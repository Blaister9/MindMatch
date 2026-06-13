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
- No se siembran embeddings, alertas, risk scores ni eventos analytics; la
  detección del Pulso (R1–R6) y la analítica llegan en fases posteriores.

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
