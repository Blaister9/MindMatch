import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function portOwner(port) {
  if (process.platform === "win32") {
    const ps = `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`;
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", ps]).catch(() => ({ stdout: "" }));
    const pid = Number(stdout.trim());
    if (!pid) return null;
    return processInfo(pid);
  }
  const { stdout } = await execFileAsync("sh", ["-c", `lsof -iTCP:${port} -sTCP:LISTEN -Pn -t 2>/dev/null | head -n1`]).catch(() => ({ stdout: "" }));
  const pid = Number(stdout.trim());
  if (!pid) return null;
  return processInfo(pid);
}

export async function processInfo(pid) {
  if (process.platform === "win32") {
    const ps = `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object ProcessId,Name,CommandLine,CreationDate | ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", ps]).catch(() => ({ stdout: "" }));
    if (!stdout.trim()) return null;
    const row = JSON.parse(stdout);
    return { pid, name: row.Name, commandLine: row.CommandLine || "", startedAt: row.CreationDate || null };
  }
  const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "pid=,comm=,args="]).catch(() => ({ stdout: "" }));
  if (!stdout.trim()) return null;
  return { pid, name: stdout.trim().split(/\s+/)[1] || "", commandLine: stdout.trim(), startedAt: null };
}

export async function assertPortsFree(ports, state = null) {
  const blockers = [];
  for (const [service, port] of Object.entries(ports)) {
    const owner = await portOwner(port);
    if (!owner) continue;
    const registered = state?.services?.[service];
    const same = registered && Number(registered.pid) === owner.pid;
    blockers.push({ service, port, owner, registered: Boolean(same) });
  }
  return blockers;
}
