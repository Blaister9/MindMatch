import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pnpmBin } from "./lib/commands.mjs";
import { envForChild, loadDemoEnv, port, urls, validateEnv, workspaceRoot } from "./lib/env.mjs";
import { requestText } from "./lib/http.mjs";
import { assertPortsFree } from "./lib/ports.mjs";
import { ensureRuntimeDirs, manifestPath, readJson, readState, writeState, configHash } from "./lib/runtime.mjs";
import { isRegisteredProcessAlive, startService, stopRegistered } from "./lib/processes.mjs";
import { parseServiceArg, resolveServiceNames } from "./lib/args.mjs";
import { planStart } from "./lib/planner.mjs";

const root = workspaceRoot();
const selected = parseServiceArg(process.argv.slice(2));
const names = resolveServiceNames(selected);
const { env } = loadDemoEnv();
const validation = validateEnv(env);
if (validation.errors.length) throw new Error(validation.errors.join("\n"));
const manifest = readJson(manifestPath);
if (!manifest) throw new Error("Falta .runtime/build-manifest.json. Ejecuta pnpm demo:prepare.");
const u = urls(env);
const currentHash = configHash({
  apiUrl: env.VITE_API_URL,
  patientUrl: env.PATIENT_APP_URL,
  doctorUrl: u.doctor,
  nodeEnv: env.NODE_ENV,
  demoMode: env.DEMO_MODE,
});
if (manifest.configHash !== currentHash) throw new Error("La configuracion cambio desde el build. Ejecuta pnpm demo:prepare.");
for (const f of ["apps/api/dist/index.js", "apps/patient-app/dist/index.html", "apps/doctor-panel/dist/index.html"]) {
  if (!existsSync(join(root, f))) throw new Error(`Artefacto faltante: ${f}`);
}
ensureRuntimeDirs();
const initialState = readState();
const ports = { api: port(env, "API_PORT", 3001), patient: port(env, "PATIENT_PORT", 5173), doctor: port(env, "DOCTOR_PORT", 5174) };

// Resolver qué servicios hay que iniciar realmente: los ya activos y verificados son
// idempotentes; los registrados pero muertos (o con PID reutilizado por un proceso ajeno)
// se consideran stale y se limpian de la huella para permitir un reinicio limpio.
const plan = await planStart(names, initialState, isRegisteredProcessAlive);
const state = plan.nextState;
const toStart = plan.toStart;
for (const name of plan.active) {
  console.log(`OK: Servicio ${name} ya esta activo y gestionado (PID ${state.services[name].pid}).`);
}
for (const name of plan.stale) {
  console.log(`INFO: Servicio ${name} estaba registrado pero no vive; se limpia y se reinicia.`);
}

if (toStart.length === 0) {
  writeState({ ...state, updatedAt: new Date().toISOString() });
  console.log(`RC ${manifest.rcVersion}: servicios solicitados ya activos. Sin cambios.`);
} else {
  // Solo los puertos de los servicios a iniciar son bloqueantes; los puertos de los
  // servicios hermanos activos no se intentan ocupar y por tanto no son conflictos.
  const blockers = await assertPortsFree(Object.fromEntries(toStart.map((n) => [n, ports[n]])), state);
  const hard = blockers.filter((b) => !b.registered);
  if (hard.length) throw new Error(hard.map((b) => `Puerto ${b.port} ocupado por PID ${b.owner.pid}: ${b.owner.commandLine}`).join("\n"));

  const runId = randomUUID();
  const childEnv = { ...envForChild(env), PORT: String(ports.api), VITE_API_URL: env.VITE_API_URL };
  const started = [];
  try {
    for (const service of toStart) {
      const spec =
        service === "api"
          ? { command: "node", args: ["apps/api/dist/index.js"], needle: "apps/api/dist/index.js", url: u.api }
          : service === "patient"
            ? { command: pnpmBin(), args: ["--filter", "@mindmatch/patient-app", "preview", "--host", "127.0.0.1", "--port", String(ports.patient), "--strictPort"], needle: "@mindmatch/patient-app", url: u.patient }
            : { command: pnpmBin(), args: ["--filter", "@mindmatch/doctor-panel", "preview", "--host", "127.0.0.1", "--port", String(ports.doctor), "--strictPort"], needle: "@mindmatch/doctor-panel", url: u.doctor };
      const { state: svcState } = startService({ service, command: spec.command, args: spec.args, cwd: root, env: childEnv, runId, url: spec.url, commandNeedle: spec.needle });
      state.services[service] = svcState;
      started.push(service);
    }
    writeState({ ...state, runId, updatedAt: new Date().toISOString(), rcVersion: manifest.rcVersion });
    for (const service of started) {
      const url = service === "api" ? `${u.api}/health` : state.services[service].url;
      for (let i = 0; i < 30; i += 1) {
        try {
          await requestText(url);
          console.log(`OK: ${service} listo ${url}`);
          break;
        } catch {
          if (i === 29) throw new Error(`${service} no quedo listo: ${url}`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
    console.log(`RC ${manifest.rcVersion} iniciado. Logs en .runtime/logs.`);
  } catch (error) {
    for (const service of started) await stopRegistered(state.services[service]);
    throw error;
  }
}
