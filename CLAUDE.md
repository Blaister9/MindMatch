# MindMatch — Guía del proyecto para Claude Code

## Qué es este proyecto
Demo MVP de MindMatch: app de conexión social entre pacientes de salud mental,
supervisada por una doctora. Tres actores: Doctora (administra, aprueba matches,
recibe alertas), Paciente (perfil, swipe, chat, check-in diario) e IA (matching
y detección de patrones). Este repo construye un DEMO con datos sembrados para
presentar a un cliente — debe verse pulido y funcionar de punta a punta, pero
no necesita hardening de producción todavía.

## Stack (NO cambiar sin discutirlo)
- Monorepo: pnpm workspaces + Turborepo
- `apps/api`: Node.js 22 + Fastify + TypeScript
- `apps/patient-app`: React 19 + Vite + TypeScript (PWA, mobile-first)
- `apps/doctor-panel`: React 19 + Vite + TypeScript (desktop-first)
- `packages/shared`: tipos TypeScript compartidos (contratos API)
- DB: PostgreSQL 16 + extensión pgvector. ORM: Drizzle
- Cache/colas: Redis + BullMQ (solo para el job de matching en el demo)
- Chat: Socket.io
- IA: Claude API (explicaciones de match) + embeddings via API. En modo demo,
  los embeddings y scores pueden venir pre-calculados del seed.
- Estilos: Tailwind CSS. Sin librerías de componentes pesadas; componentes propios.

## Reglas de arquitectura (INNEGOCIABLES)
1. Tres esquemas de DB: `social`, `clinical`, `analytics`. Las tablas de
   `clinical` (risk_scores, alerts, patient_clinical, match_decisions) JAMÁS
   se exponen en endpoints de rol paciente.
2. Los mensajes de chat JAMÁS se exponen en endpoints de rol doctor. La doctora
   solo ve metadata (conexión activa, conteo, reportes).
3. Toda ruta de API lleva middleware de rol: `requireRole('doctor')` o
   `requireRole('patient')`. No hay rutas sin auth excepto login y aceptar invitación.
4. La detección de patrones del Pulso Emocional son REGLAS determinísticas en
   TypeScript puro (sin LLM). El LLM solo redacta resúmenes.
5. Multi-tenancy por `clinic_id` en todas las tablas desde el día 1, aunque el
   demo tenga una sola clínica.
6. Pacientes solo mayores de 18 años (validación en schema y en formulario).

## Convenciones de código
- TypeScript estricto (`strict: true`), sin `any` salvo justificación comentada.
- Validación de entrada con Zod en cada endpoint; los schemas Zod viven en
  `packages/shared` y se reusan en los frontends.
- Nombres de DB en snake_case, código en camelCase.
- Commits convencionales: `feat:`, `fix:`, `chore:`, `seed:`.
- Tests: solo para el motor de reglas del pulso (R1-R6) y los guards de
  autorización entre capas. No pierdas tiempo testeando UI en el demo.

## Motor de reglas del Pulso (implementar exactamente así)
- R1: media móvil 3 días de ánimo cae ≥1.5 vs media de los 7 días previos → alerta media
- R2: ánimo ≤2 por 3+ días consecutivos → alerta alta
- R3: sin check-in 3+ días → alerta media
- R4: sueño ≤2 por 4+ días → alerta media
- R5: sin conexión social 7 días + tendencia plana/negativa → alerta baja
- R6: reporte en chat → alerta alta inmediata
Cada alerta guarda `inputs_json` con los datos exactos que la dispararon.

## Modo demo
- `pnpm seed` crea: 1 clínica, 1 doctora (doctora@demo.com / Demo123!),
  8 pacientes con perfiles realistas colombianos (nombres, intereses, metas),
  matches pre-calculados con scores y explicaciones, 2 conversaciones con
  historial, 1 grupo de apoyo con mensajes, y 14 días de check-ins por paciente.
- Un paciente del seed (Mariana) debe tener un patrón descendente que dispare
  R1 y R2, para demostrar la alerta en vivo.
- Botón discreto "⚡ Simular día" en el panel (solo si NODE_ENV=demo) que avanza
  los check-ins un día para mostrar la detección en la presentación.

## Diseño / UX
- App paciente: cálida, mobile-first, paleta suave (verdes/azules
  desaturados), tipografía Nunito Sans, bordes redondeados, animaciones sutiles
  en el swipe. Debe sentirse acogedora, NO clínica.
- Panel doctora: limpio, profesional, densidad de información tipo "sala de
  control": tarjetas de pacientes con semáforo de estado, lista de alertas,
  matches pendientes de aprobar, gráfica de pulso por paciente.
- Todo el texto de UI en español (Colombia).
- Pantalla de chat incluye: botón Modo Calma (ejercicio de respiración animado),
  Recursos, y Reportar.

## Qué NO hacer en este demo
- No implementar cifrado de mensajes todavía (dejar TODO comentado donde iría).
- No push notifications reales (simular con toasts/badge).
- No RLS de Postgres todavía (la separación va en los guards de API + grants
  por venir; dejar TODO).
- No integración Power BI (el esquema analytics sí se crea; el dashboard se
  muestra con una página de "Analítica" en el panel con gráficas Recharts).
- No registro abierto: pacientes entran solo por link de invitación.

## Comandos
- `pnpm dev` — levanta api + ambos frontends
- `pnpm seed` — resetea y siembra datos demo
- `pnpm test` — tests del motor de reglas y guards
- `docker compose up -d` — Postgres + Redis locales
