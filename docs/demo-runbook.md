# MindMatch Release Candidate Local - Demo Readiness

RC version: `0.1.0-rc.1`.

## Requisitos

- Node 22 o superior.
- pnpm definido por `packageManager`.
- Docker Desktop con Docker Compose.
- Puertos canonicos: API `3001`, paciente `5173`, doctora `5174`, PostgreSQL `55432`, Redis `6379`.

## Flujo Inicial

```bash
pnpm demo:init
pnpm demo:doctor
```

Edita `.env.demo.local` solo si necesitas cambiar puertos. Para preparar una demo limpia:

```bash
pnpm demo:prepare -- --reset --confirm-reset=mindmatch-demo
pnpm demo:start
pnpm demo:check -- --expect-clean
```

El reset exige `ALLOW_DEMO_RESET=true` en `.env.demo.local`.

## Antes Del Evento

- No resetear a ultima hora sin copia del estado esperado.
- Confirmar Docker healthy con `docker compose ps`.
- Confirmar puertos con `pnpm demo:doctor`.
- Abrir doctora en navegador normal: `http://127.0.0.1:5174`.
- Abrir paciente en ventana privada: `http://127.0.0.1:5173`.
- Desactivar notificaciones y probar Zoom/proyector.
- Mantener internet como opcional; el demo no depende de llamadas externas.
- Mantener servicios levantados.

## Credenciales Demo

- Clinica: `mindmatch-demo`.
- Doctora: `doctora@demo.com` / `Demo123!`.
- Paciente recomendado: `mariana@demo.com` / `Demo123!`.

## Guion 10-12 Minutos

- 0:00-1:00: contexto y Sala de control.
- 1:00-2:00: pacientes y semaforo.
- 2:00-3:00: invitacion/perfil, opcional si falta tiempo.
- 3:00-4:00: discovery, match y aprobacion.
- 4:00-5:30: chat y typing.
- 5:30-6:15: Modo Calma.
- 6:15-7:15: Pulso.
- 7:15-8:15: Simular dia y R1/R2.
- 8:15-9:00: gestionar alerta.
- 9:00-10:00: asignar/completar mision.
- 10:00-11:00: Analitica.
- 11:00-12:00: cierre y preguntas.

Usa doctora en navegador normal y paciente en ventana privada. Los pacientes,
chats, matches, check-ins y analytics iniciales son sembrados. Mutan datos:
aprobar match, simular dia, gestionar alerta y misiones. La invitacion completa
es opcional para no arriesgar tiempo.

## Recuperacion Rapida

| Sintoma | Diagnostico | Comando | Tiempo | Riesgo |
|---|---|---|---|---|
| API no responde | Proceso caido o puerto ocupado | `pnpm demo:doctor`; `pnpm demo:start -- --service api` | 10s | Bajo |
| Frontend no carga | Preview caido | `pnpm demo:start -- --service patient` o `doctor` | 10s | Bajo |
| Socket.io no conecta | API o sesion vieja | refrescar pestana; `pnpm demo:check` | 30s | Bajo |
| Docker detenido | Infra no disponible | iniciar Docker; `docker compose up -d` | 1-3m | Medio |
| DB no healthy | Contenedor inicializando o roto | `docker compose ps` | 1m | Medio |
| Guard bloquea seed | DB/puerto/slug inseguro | revisar `.env.demo.local` | 1m | Bajo |
| Firma distinta | Dataset no limpio | `pnpm demo:prepare -- --reset --confirm-reset=mindmatch-demo` | 2-4m | Borra tenant demo |
| Puerto ocupado | Otro proceso usa puerto | `pnpm demo:doctor` | 1m | No matar desconocidos |
| Token expirado | Sesion vieja | cerrar sesion o ventana privada nueva | 30s | Bajo |
| Simular dia ya ejecutado | Estado post-alertas | continuar narracion o reset seguro | 2-4m | Borra tenant demo |

Si Docker falla antes del evento: intenta iniciar Docker y usar contenedores ya
preparados si siguen healthy. No borres volumenes. Si no hay DB accesible, el
demo interactivo queda bloqueado; usa material preparado fuera de este runbook.

## Cierre

```bash
pnpm demo:stop
```

Docker queda activo. No se ejecuta `docker system prune` ni se detienen
contenedores ajenos.
