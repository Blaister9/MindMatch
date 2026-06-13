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

- Doctora: `doctora@demo.com` / `Demo123!`
- Pacientes: entran por link de invitación (no hay registro abierto).

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
