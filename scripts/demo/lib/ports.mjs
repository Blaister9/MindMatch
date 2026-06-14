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
    const ps = `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate | ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", ps]).catch(() => ({ stdout: "" }));
    if (!stdout.trim()) return null;
    const row = JSON.parse(stdout);
    return {
      pid,
      ppid: Number(row.ParentProcessId) || null,
      name: row.Name,
      commandLine: row.CommandLine || "",
      startedAt: row.CreationDate || null,
    };
  }
  const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "pid=,ppid=,comm=,args="]).catch(() => ({ stdout: "" }));
  if (!stdout.trim()) return null;
  const parts = stdout.trim().split(/\s+/);
  return {
    pid,
    ppid: Number(parts[1]) || null,
    name: parts[2] || "",
    commandLine: stdout.trim(),
    startedAt: null,
  };
}

/**
 * Verifica que la información viva de un proceso corresponde al servicio registrado.
 * Reusa la misma lógica de fingerprint que isRegisteredProcessAlive: needle de comando
 * presente y vínculo de workspace (en la línea de comando o en el fingerprint guardado).
 * Defensa contra reutilización de PID por procesos ajenos.
 */
export function verifyServiceIdentity(info, svc) {
  if (!info || !svc) return false;
  const cmd = info.commandLine || "";
  const needleOk = Boolean(svc.commandNeedle) && cmd.includes(svc.commandNeedle);
  const workspaceOk =
    !svc.workspace ||
    cmd.includes(svc.workspace) ||
    (svc.commandFingerprint || "").includes(svc.workspace);
  return needleOk && workspaceOk;
}

/**
 * Determina si el PID dueño de un puerto pertenece al árbol del servicio registrado.
 *
 * Un servicio frontend se lanza como `cmd.exe -> pnpm -> vite` y el dueño real del
 * puerto es un descendiente (nieto/bisnieto) del PID registrado, no el PID registrado.
 * Esta función recorre la ascendencia del dueño del puerto y acepta el proceso solo si:
 *   - el dueño es el propio PID registrado; o
 *   - el dueño desciende verificablemente del PID registrado,
 * y en ambos casos la identidad del PID registrado se revalida por fingerprint
 * (workspace + needle de comando) para defenderse de reutilización de PID.
 *
 * Nunca adopta un proceso solo por usar node/vite, el mismo puerto, o contener "MindMatch":
 * exige un vínculo de ascendencia real con el árbol registrado.
 */
export async function belongsToManagedService(ownerPid, svc, opts = {}) {
  if (ownerPid == null || svc?.pid == null) return false;
  const getInfo = opts.getProcessInfo || processInfo;
  // Guarda opcional de runId: si el llamador conoce el runId esperado y el registro
  // pertenece a otra ejecución, no es nuestro proceso gestionado.
  if (opts.expectedRunId != null && svc.runId != null && svc.runId !== opts.expectedRunId) {
    return false;
  }
  const maxDepth = opts.maxDepth ?? 16;
  const seen = new Set();
  let cur = Number(ownerPid);
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (cur == null || Number.isNaN(cur) || seen.has(cur)) break;
    seen.add(cur);
    const info = await getInfo(cur);
    if (!info) break;
    if (Number(info.pid) === Number(svc.pid)) {
      // Llegamos al PID registrado por la cadena de ascendencia: revalidar identidad.
      return verifyServiceIdentity(info, svc);
    }
    const parent = info.ppid;
    if (parent == null || Number(parent) === 0 || Number(parent) === cur) break;
    cur = Number(parent);
  }
  return false;
}

export async function assertPortsFree(ports, state = null, opts = {}) {
  const getOwner = opts.portOwner || portOwner;
  const blockers = [];
  for (const [service, port] of Object.entries(ports)) {
    const owner = await getOwner(port);
    if (!owner) continue;
    const registered = state?.services?.[service];
    let managed = false;
    if (registered) {
      managed = await belongsToManagedService(owner.pid, registered, {
        getProcessInfo: opts.getProcessInfo,
      });
    }
    blockers.push({ service, port, owner, registered: managed });
  }
  return blockers;
}
