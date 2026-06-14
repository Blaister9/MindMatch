import test from "node:test";
import assert from "node:assert/strict";
import { isRegisteredProcessAlive } from "./processes.mjs";

test("PID inexistente queda stale/no vivo", async () => {
  const result = await isRegisteredProcessAlive({ pid: 99999999, commandNeedle: "mindmatch", workspace: process.cwd() });
  assert.equal(result.alive, false);
});
