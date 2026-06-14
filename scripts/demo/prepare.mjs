import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { run, pnpmBin } from "./lib/commands.mjs";
import { envForChild, loadDemoEnv, validateEnv, workspaceRoot } from "./lib/env.mjs";
import { configHash, hashFile, manifestPath, writeJsonAtomic } from "./lib/runtime.mjs";

const root = workspaceRoot();
const args = process.argv.slice(2);
const wantsReset = args.includes("--reset");
const confirmed = args.includes("--confirm-reset=mindmatch-demo");
const { file, env } = loadDemoEnv();
const validation = validateEnv(env, { readiness: true, reset: wantsReset });
if (validation.errors.length) throw new Error(`Env RC invalido:\n - ${validation.errors.join("\n - ")}`);
const childEnv = envForChild(env);
const pnpm = pnpmBin();

await run(pnpm, ["install", "--frozen-lockfile"], { cwd: root, env: childEnv, label: "install frozen lockfile" });
await run("docker", ["compose", "--env-file", file, "up", "-d"], { cwd: root, env: childEnv, label: "docker compose up" });
await run("docker", ["compose", "ps"], { cwd: root, env: childEnv, label: "docker compose ps" });
await run(pnpm, ["db:migrate"], { cwd: root, env: childEnv, label: "db migrate" });

if (wantsReset) {
  if (!confirmed || env.ALLOW_DEMO_RESET !== "true") {
    throw new Error("Para resetear usa: ALLOW_DEMO_RESET=true en env y pnpm demo:prepare -- --reset --confirm-reset=mindmatch-demo");
  }
  await run(pnpm, ["demo:reset", "--", "--confirm-reset=mindmatch-demo"], { cwd: root, env: childEnv, label: "demo reset" });
} else {
  try {
    await run(pnpm, ["--filter", "@mindmatch/api", "seed:verify"], { cwd: root, env: childEnv, label: "seed verify" });
  } catch {
    throw new Error("No existe un tenant demo verificable. Repite con: pnpm demo:prepare -- --reset --confirm-reset=mindmatch-demo y ALLOW_DEMO_RESET=true.");
  }
  await run(pnpm, ["analytics:refresh"], { cwd: root, env: childEnv, label: "analytics refresh" });
}

for (const d of ["apps/api/dist", "packages/shared/dist", "apps/patient-app/dist", "apps/doctor-panel/dist"]) {
  rmSync(join(root, d), { recursive: true, force: true });
}
await run(pnpm, ["build"], {
  cwd: root,
  env: { ...childEnv, VITE_API_URL: env.VITE_API_URL },
  label: "build RC",
});

for (const f of ["apps/api/dist/index.js", "apps/patient-app/dist/index.html", "apps/doctor-panel/dist/index.html"]) {
  if (!existsSync(join(root, f))) throw new Error(`Artefacto faltante: ${f}`);
}

let gitCommit = "unknown";
try {
  const git = await run("git", ["rev-parse", "--short", "HEAD"], { cwd: root, env: childEnv, silent: true, label: "git rev-parse" });
  gitCommit = git.stdout.trim();
} catch {
  gitCommit = "unknown";
}
const version = (await import("node:fs")).readFileSync(join(root, "VERSION"), "utf8").trim();
const config = {
  apiUrl: env.VITE_API_URL,
  patientUrl: env.PATIENT_APP_URL,
  doctorUrl: `http://127.0.0.1:${env.DOCTOR_PORT || 5174}`,
  nodeEnv: env.NODE_ENV,
  demoMode: env.DEMO_MODE,
};
writeJsonAtomic(manifestPath, {
  rcVersion: version,
  gitCommit,
  builtAt: new Date().toISOString(),
  ...config,
  configHash: configHash(config),
  artifacts: {
    api: hashFile(join(root, "apps/api/dist/index.js")),
    patient: hashFile(join(root, "apps/patient-app/dist/index.html")),
    doctor: hashFile(join(root, "apps/doctor-panel/dist/index.html")),
  },
});
await run(pnpm, ["demo:doctor"], { cwd: root, env: childEnv, label: "demo doctor readiness" });
console.log("Prepare RC OK. No se iniciaron servidores.");
