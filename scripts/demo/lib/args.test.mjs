import test from "node:test";
import assert from "node:assert/strict";
import { parseServiceArg, resolveServiceNames } from "./args.mjs";

test("parseServiceArg admite forma con espacio: --service api", () => {
  assert.equal(parseServiceArg(["--", "--service", "api"]), "api");
  assert.equal(parseServiceArg(["--service", "patient"]), "patient");
});

test("parseServiceArg admite forma con igual: --service=doctor", () => {
  assert.equal(parseServiceArg(["--service=doctor"]), "doctor");
});

test("parseServiceArg devuelve 'all' cuando no se especifica", () => {
  assert.equal(parseServiceArg([]), "all");
  assert.equal(parseServiceArg(["--", "--otra-bandera"]), "all");
});

test("parseServiceArg no toma una bandera como valor de --service", () => {
  assert.equal(parseServiceArg(["--service", "--reset"]), "all");
});

test("resolveServiceNames expande 'all' a los tres servicios", () => {
  assert.deepEqual(resolveServiceNames("all"), ["api", "patient", "doctor"]);
});

test("resolveServiceNames devuelve un solo servicio", () => {
  assert.deepEqual(resolveServiceNames("api"), ["api"]);
  assert.deepEqual(resolveServiceNames("patient"), ["patient"]);
  assert.deepEqual(resolveServiceNames("doctor"), ["doctor"]);
});

test("resolveServiceNames rechaza un servicio desconocido", () => {
  assert.throws(() => resolveServiceNames("redis"), /Servicio desconocido/);
});
