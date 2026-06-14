import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { port, loadDemoEnv } from "./lib/env.mjs";
import { portOwner } from "./lib/ports.mjs";
import { pidsDir, readState, writeState } from "./lib/runtime.mjs";
import { stopRegistered } from "./lib/processes.mjs";

const selected = process.argv.find((a) => a.startsWith("--service="))?.split("=")[1] || "all";
const names = selected === "all" ? ["api", "patient", "doctor"] : [selected];
const { env } = loadDemoEnv({ requireFile: false });
const ports = { api: port(env, "API_PORT", 3001), patient: port(env, "PATIENT_PORT", 5173), doctor: port(env, "DOCTOR_PORT", 5174) };
const state = readState();
for (const service of names) {
  const svc = state.services?.[service];
  if (!svc) {
    console.log(`WARN: ${service} no registrado.`);
    continue;
  }
  const result = await stopRegistered(svc);
  console.log(`${result.stopped ? "OK" : "WARN"}: stop ${service} ${result.reason || ""}`);
  delete state.services[service];
  const pidFile = join(pidsDir, `${service}.pid`);
  if (existsSync(pidFile)) rmSync(pidFile, { force: true });
  const owner = await portOwner(ports[service]);
  if (owner) console.log(`WARN: puerto ${ports[service]} sigue ocupado por PID ${owner.pid}.`);
}
writeState({ ...state, updatedAt: new Date().toISOString() });
