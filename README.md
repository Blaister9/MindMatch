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
pnpm seed                     # datos demo (Fase 2)
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
