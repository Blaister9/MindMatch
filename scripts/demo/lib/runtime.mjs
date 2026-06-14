import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { workspaceRoot } from "./env.mjs";

export const runtimeDir = resolve(workspaceRoot(), ".runtime");
export const logsDir = join(runtimeDir, "logs");
export const pidsDir = join(runtimeDir, "pids");
export const statePath = join(runtimeDir, "state.json");
export const manifestPath = join(runtimeDir, "build-manifest.json");

export function ensureRuntimeDirs() {
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(pidsDir, { recursive: true });
}

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJsonAtomic(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function readState() {
  return readJson(statePath, { version: 1, services: {} });
}

export function writeState(state) {
  writeJsonAtomic(statePath, state);
}

export function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function configHash(obj) {
  return createHash("sha256").update(JSON.stringify(obj, Object.keys(obj).sort())).digest("hex");
}
