import { spawn } from "node:child_process";
import { redact } from "./redact.mjs";

export function pnpmBin() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

export function run(command, args, { cwd = process.cwd(), env = process.env, label = command, silent = false } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    if (!silent) console.log(`> ${label}`);
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      const text = redact(d.toString());
      stdout += text;
      if (!silent) process.stdout.write(text);
    });
    child.stderr.on("data", (d) => {
      const text = redact(d.toString());
      stderr += text;
      if (!silent) process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const durationMs = Date.now() - started;
      if (code === 0) resolve({ code, stdout, stderr, durationMs });
      else reject(new Error(`${label} fallo con codigo ${code} tras ${durationMs}ms.`));
    });
  });
}
