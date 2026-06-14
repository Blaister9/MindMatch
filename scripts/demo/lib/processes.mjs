import { spawn } from "node:child_process";
import { createWriteStream, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { processInfo } from "./ports.mjs";
import { logsDir, pidsDir } from "./runtime.mjs";

export function fingerprint(command, args, cwd) {
  return `${resolve(cwd)}|${command}|${args.join(" ")}`;
}

export async function isRegisteredProcessAlive(serviceState) {
  if (!serviceState?.pid) return { alive: false, verified: false, reason: "missing" };
  const info = await processInfo(serviceState.pid);
  if (!info) return { alive: false, verified: false, reason: "not_found" };
  const cmd = info.commandLine || "";
  const expected = serviceState.commandFingerprint;
  const ok =
    cmd.includes(serviceState.commandNeedle) &&
    (!serviceState.workspace || cmd.includes(serviceState.workspace) || expected.includes(serviceState.workspace));
  return { alive: true, verified: ok, reason: ok ? "verified" : "fingerprint_mismatch", info };
}

export function startService({ service, command, args, cwd, env, runId, url, commandNeedle }) {
  const out = createWriteStream(join(logsDir, `${service}.log`), { flags: "w" });
  out.write(`runId=${runId} service=${service} startedAt=${new Date().toISOString()}\n`);
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  const startedAt = new Date().toISOString();
  const state = {
    service,
    pid: child.pid,
    command,
    args,
    commandFingerprint: fingerprint(command, args, cwd),
    commandNeedle,
    startedAt,
    runId,
    workspace: resolve(cwd),
    url,
    logPath: join(logsDir, `${service}.log`),
  };
  writeFileSync(join(pidsDir, `${service}.pid`), String(child.pid));
  return { child, state };
}

export async function stopRegistered(serviceState) {
  const alive = await isRegisteredProcessAlive(serviceState);
  if (!alive.alive) return { stopped: false, stale: true, reason: alive.reason };
  if (!alive.verified) return { stopped: false, stale: true, reason: alive.reason };
  try {
    if (process.platform === "win32") {
      const { execFile } = await import("node:child_process");
      await new Promise((resolveDone) => execFile("taskkill.exe", ["/PID", String(serviceState.pid), "/T"], () => resolveDone()));
    } else {
      process.kill(serviceState.pid, "SIGTERM");
    }
  } catch {
    return { stopped: false, stale: true, reason: "stop_failed" };
  }
  await new Promise((r) => setTimeout(r, 1500));
  const after = await processInfo(serviceState.pid);
  if (after) {
    try {
      if (process.platform === "win32") {
        const { execFile } = await import("node:child_process");
        await new Promise((resolveDone) => execFile("taskkill.exe", ["/PID", String(serviceState.pid), "/T", "/F"], () => resolveDone()));
      } else {
        process.kill(serviceState.pid, "SIGKILL");
      }
    } catch {
      return { stopped: false, stale: true, reason: "force_failed" };
    }
  }
  return { stopped: true, stale: false };
}
