import test from "node:test";
import assert from "node:assert/strict";
import { belongsToManagedService, assertPortsFree } from "./ports.mjs";
import { planStart, applyStop } from "./planner.mjs";
import { stopRegistered } from "./processes.mjs";

const WS = "C:\\Users\\santi\\Documents\\MindMatch";

/** Construye un proveedor de processInfo a partir de un mapa pid -> nodo. */
function fakeTree(nodes) {
  const map = new Map(nodes.map((n) => [Number(n.pid), n]));
  return async (pid) => map.get(Number(pid)) || null;
}

const patientSvc = (overrides = {}) => ({
  pid: 33472,
  commandNeedle: "@mindmatch/patient-app",
  workspace: WS,
  commandFingerprint: `${WS}|pnpm.cmd|--filter @mindmatch/patient-app preview --host 127.0.0.1 --port 5173 --strictPort`,
  runId: "run-current",
  ...overrides,
});

// 1) propietario del puerto igual al PID registrado (caso API: node directo).
test("1: dueño del puerto == PID registrado -> pertenece", async () => {
  const svc = {
    pid: 27436,
    commandNeedle: "apps/api/dist/index.js",
    workspace: WS,
    commandFingerprint: `${WS}|node|apps/api/dist/index.js`,
  };
  const tree = fakeTree([{ pid: 27436, ppid: 10784, commandLine: "node apps/api/dist/index.js" }]);
  assert.equal(await belongsToManagedService(27436, svc, { getProcessInfo: tree }), true);
});

// 2) propietario hijo directo del PID registrado.
test("2: dueño hijo del PID registrado -> pertenece", async () => {
  const svc = patientSvc({ pid: 100 });
  const tree = fakeTree([
    { pid: 101, ppid: 100, commandLine: `node ${WS}\\apps\\patient-app\\node_modules\\vite preview` },
    { pid: 100, ppid: 50, commandLine: "cmd /c pnpm.cmd --filter @mindmatch/patient-app preview" },
  ]);
  assert.equal(await belongsToManagedService(101, svc, { getProcessInfo: tree }), true);
});

// 3) propietario nieto dentro del árbol pnpm -> vite (escenario real frontend).
test("3: dueño nieto en árbol pnpm->vite -> pertenece", async () => {
  const svc = patientSvc({ pid: 33472 });
  const tree = fakeTree([
    { pid: 6176, ppid: 32208, commandLine: `node ${WS}\\apps\\patient-app\\node_modules\\.bin\\..\\vite\\bin\\vite.js preview` },
    { pid: 32208, ppid: 16852, commandLine: "cmd /c vite preview --port 5173" },
    { pid: 16852, ppid: 33472, commandLine: "node corepack pnpm" },
    { pid: 33472, ppid: 10784, commandLine: "cmd /c pnpm.cmd --filter @mindmatch/patient-app preview" },
  ]);
  assert.equal(await belongsToManagedService(6176, svc, { getProcessInfo: tree }), true);
});

// 4) PID reutilizado por un proceso distinto -> NO pertenece.
test("4: PID registrado reutilizado por proceso ajeno -> no pertenece", async () => {
  const svc = patientSvc({ pid: 33472 });
  const tree = fakeTree([{ pid: 33472, ppid: 1, commandLine: "C:\\Windows\\System32\\notepad.exe" }]);
  assert.equal(await belongsToManagedService(33472, svc, { getProcessInfo: tree }), false);
});

// 5) mismo puerto pero workspace distinto -> NO pertenece (no desciende de nuestro árbol).
test("5: mismo puerto, workspace distinto -> no pertenece", async () => {
  const svc = patientSvc({ pid: 33472 });
  const tree = fakeTree([
    { pid: 9000, ppid: 9001, commandLine: "node D:\\otro\\apps\\patient-app\\vite preview" },
    { pid: 9001, ppid: 9002, commandLine: "cmd /c vite preview" },
    { pid: 9002, ppid: 1, commandLine: "explorer.exe" },
  ]);
  assert.equal(await belongsToManagedService(9000, svc, { getProcessInfo: tree }), false);
});

// 6) mismo comando pero runId distinto -> NO pertenece.
test("6: árbol válido pero runId distinto -> no pertenece", async () => {
  const svc = patientSvc({ pid: 33472, runId: "run-OLD" });
  const tree = fakeTree([{ pid: 33472, ppid: 10784, commandLine: "cmd /c pnpm.cmd --filter @mindmatch/patient-app preview" }]);
  assert.equal(
    await belongsToManagedService(33472, svc, { getProcessInfo: tree, expectedRunId: "run-NEW" }),
    false,
  );
});

// 7) start parcial ignora puertos hermanos: solo se consulta el puerto solicitado.
test("7: assertPortsFree solo inspecciona los puertos dados", async () => {
  const queried = [];
  const state = { services: { api: { pid: 27436, commandNeedle: "apps/api/dist/index.js", workspace: WS, commandFingerprint: `${WS}|node|apps/api/dist/index.js` } } };
  const tree = fakeTree([{ pid: 27436, ppid: 10784, commandLine: "node apps/api/dist/index.js" }]);
  const spyOwner = async (port) => {
    queried.push(port);
    return port === 3001 ? { pid: 27436, commandLine: "node apps/api/dist/index.js" } : null;
  };
  const blockers = await assertPortsFree({ api: 3001 }, state, { portOwner: spyOwner, getProcessInfo: tree });
  assert.deepEqual(queried, [3001]);
  assert.equal(blockers.find((b) => b.service === "api")?.registered, true);
});

// 8) start parcial detecta conflicto real en su propio puerto.
test("8: assertPortsFree marca conflicto duro cuando el dueño es ajeno", async () => {
  const state = { services: { api: { pid: 27436, commandNeedle: "apps/api/dist/index.js", workspace: WS, commandFingerprint: `${WS}|node|apps/api/dist/index.js` } } };
  const tree = fakeTree([{ pid: 55555, ppid: 1, commandLine: "C:\\Windows\\System32\\svchost.exe" }]);
  const foreignOwner = async () => ({ pid: 55555, commandLine: "C:\\Windows\\System32\\svchost.exe" });
  const blockers = await assertPortsFree({ api: 3001 }, state, { portOwner: foreignOwner, getProcessInfo: tree });
  const hard = blockers.filter((b) => !b.registered);
  assert.equal(hard.length, 1);
  assert.equal(hard[0].owner.pid, 55555);
});

// 9) servicio ya activo es idempotente.
test("9: planStart con servicio activo+verificado no lo reinicia", async () => {
  const state = { services: { api: { pid: 27436 } }, runId: "r1" };
  const isAlive = async () => ({ alive: true, verified: true });
  const plan = await planStart(["api"], state, isAlive);
  assert.deepEqual(plan.active, ["api"]);
  assert.deepEqual(plan.toStart, []);
});

// 10) estado stale se limpia.
test("10: planStart limpia registro stale y permite reinicio", async () => {
  const state = { services: { api: { pid: 27436 }, patient: { pid: 33472 } }, runId: "r1" };
  const isAlive = async (svc) => (svc?.pid === 33472 ? { alive: true, verified: true } : { alive: false, verified: false });
  const plan = await planStart(["api"], state, isAlive);
  assert.deepEqual(plan.stale, ["api"]);
  assert.deepEqual(plan.toStart, ["api"]);
  assert.equal(plan.nextState.services.api, undefined);
  // El servicio hermano permanece intacto en el estado.
  assert.equal(plan.nextState.services.patient.pid, 33472);
});

// 11) stop parcial conserva los demás servicios.
test("11: applyStop elimina solo lo solicitado y conserva hermanos", () => {
  const state = { services: { api: { pid: 1 }, patient: { pid: 2 }, doctor: { pid: 3 } } };
  const { removed, nextState } = applyStop(state, ["api"]);
  assert.deepEqual(removed, ["api"]);
  assert.equal(nextState.services.api, undefined);
  assert.equal(nextState.services.patient.pid, 2);
  assert.equal(nextState.services.doctor.pid, 3);
});

// 12) stop nunca mata un proceso fuera del árbol verificado.
test("12: stopRegistered no actúa sobre un PID no verificable/inexistente", async () => {
  const result = await stopRegistered({ pid: 999999999, commandNeedle: "mindmatch", workspace: WS });
  assert.equal(result.stopped, false);
  assert.equal(result.stale, true);
});
