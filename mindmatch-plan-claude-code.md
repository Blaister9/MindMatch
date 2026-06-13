# MindMatch - Plan de implementación

Este documento queda incorporado en Fase 1 porque el plan original no estaba
presente en el repositorio. La fuente canónica del modelo de datos es
`docs/architecture-data-model.md`.

## Fase 0

- Monorepo pnpm + Turborepo.
- API Fastify + TypeScript.
- Frontends React + Vite + Tailwind.
- PostgreSQL 16 con pgvector y Redis mediante Docker Compose.
- Schemas `social`, `clinical` y `analytics`.
- Migraciones Drizzle reproducibles desde base vacía.

## Fase 1

- Autenticación de doctora y paciente.
- Access token JWT corto en memoria.
- Refresh token rotativo en cookie `HttpOnly`.
- Guards `authenticate` y `requireRole`.
- Invitaciones de paciente con token plano solo en enlace local.
- Validación y aceptación de invitación mediante body JSON.
- Perfil social propio del paciente.
- Catálogo de intereses por clínica.
- Pantallas mínimas de doctora y paciente.
- Bootstrap local explícito de doctora demo.

## Fuera de alcance Fase 1

- Seed completo de Fase 2.
- Matching, swipe, conexiones, chat, check-ins y alertas.
- IA, Socket.io, BullMQ y analítica funcional.
- RLS, cifrado real de mensajes, OAuth, MFA y recuperación de contraseña.
