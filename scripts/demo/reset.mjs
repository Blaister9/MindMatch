import { run, pnpmBin } from "./lib/commands.mjs";
import { EXPECTED_SIGNATURE, envForChild, loadDemoEnv, validateEnv, workspaceRoot } from "./lib/env.mjs";

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm-reset=mindmatch-demo");
const { env } = loadDemoEnv();
const validation = validateEnv(env, { reset: true });
const errors = [...validation.errors];
if (!confirmed) errors.push("--confirm-reset=mindmatch-demo requerido.");
if (errors.length) {
  console.error(`Reset rechazado:\n - ${errors.join("\n - ")}`);
  process.exit(1);
}

const childEnv = envForChild(env);
const root = workspaceRoot();
const pnpm = pnpmBin();
await run(pnpm, ["seed"], { cwd: root, env: childEnv, label: "seed demo" });
const verify = await run(pnpm, ["--filter", "@mindmatch/api", "seed:verify"], { cwd: root, env: childEnv, label: "seed verify" });
if (!verify.stdout.includes(EXPECTED_SIGNATURE)) throw new Error("Firma logica inesperada.");
await run(pnpm, ["analytics:refresh"], { cwd: root, env: childEnv, label: "analytics refresh" });
console.log(`Reset demo OK. Firma ${EXPECTED_SIGNATURE}.`);
