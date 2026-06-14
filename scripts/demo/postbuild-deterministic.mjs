import { existsSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { run, pnpmBin } from "./lib/commands.mjs";
import { loadDemoEnv, envForChild, workspaceRoot } from "./lib/env.mjs";

const root = workspaceRoot();
const { env } = loadDemoEnv({ requireFile: false });
const childEnv = envForChild(env);
const pnpm = pnpmBin();

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts"))) out.push(full);
  }
  return out.sort();
}

function snapshot() {
  const files = [
    ...walk(join(root, "packages/shared/dist")),
    ...walk(join(root, "apps/api/dist")),
  ];
  const snap = {};
  for (const file of files) {
    snap[relative(root, file).replaceAll("\\", "/")] = createHash("sha256").update(readFileSync(file)).digest("hex");
  }
  return snap;
}

async function buildFresh() {
  rmSync(join(root, "packages/shared/dist"), { recursive: true, force: true });
  rmSync(join(root, "apps/api/dist"), { recursive: true, force: true });
  await run(pnpm, ["--filter", "@mindmatch/api", "build"], { cwd: root, env: childEnv, label: "api clean build" });
  return snapshot();
}

const before = await run("git", ["diff", "--name-only"], { cwd: root, env: childEnv, silent: true, label: "git diff before" });
const a = await buildFresh();
const b = await buildFresh();
const after = await run("git", ["diff", "--name-only"], { cwd: root, env: childEnv, silent: true, label: "git diff after" });
if (before.stdout !== after.stdout) throw new Error("El postbuild modifico archivos versionados fuera de dist.");
if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Postbuild ESM no deterministico en .js/.d.ts.");
console.log(`OK: postbuild ESM deterministico (${Object.keys(a).length} archivos .js/.d.ts).`);
