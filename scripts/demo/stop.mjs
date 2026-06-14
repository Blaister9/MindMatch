import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { port, loadDemoEnv } from "./lib/env.mjs";
import { portOwner } from "./lib/ports.mjs";
import { pidsDir, readState, writeState } from "./lib/runtime.mjs";
import { stopRegistered } from "./lib/processes.mjs";
import { parseServiceArg, resolveServiceNames } from "./lib/args.mjs";
import { applyStop } from "./lib/planner.mjs";

const selected = parseServiceArg(process.argv.slice(2));
const names = resolveServiceNames(selected);
const { env } = loadDemoEnv({ requireFile: false });
const ports = { api: port(env, "API_PORT", 3001), patient: port(env, "PATIENT_PORT", 5173), doctor: port(env, "DOCTOR_PORT", 5174) };
const state = readState();
const toStop = [];
for (const service of names) {
  const svc = state.services?.[service];
  if (!svc) {
    console.log(`WARN: ${service} no registrado.`);
    continue;
  }
  const result = await stopRegistered(svc);
  console.log(`${result.stopped ? "OK" : "WARN"}: stop ${service} ${result.reason || ""}`);
  toStop.push(service);
  const pidFile = join(pidsDir, `${service}.pid`);
  if (existsSync(pidFile)) rmSync(pidFile, { force: true });
  const owner = await portOwner(ports[service]);
  if (owner) console.log(`WARN: puerto ${ports[service]} sigue ocupado por PID ${owner.pid}.`);
}
// Conserva intactos los servicios hermanos no solicitados.
const { nextState } = applyStop(state, toStop);
writeState({ ...nextState, updatedAt: new Date().toISOString() });
