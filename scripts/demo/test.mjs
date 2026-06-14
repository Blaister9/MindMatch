import { run, pnpmBin } from "./lib/commands.mjs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full));
    if (entry.isFile() && entry.name.endsWith(".test.mjs")) files.push(full);
  }
  return files;
}

await run("node", ["--test", ...collect("scripts/demo")], { label: "demo node tests" });
await run("node", ["scripts/demo/postbuild-deterministic.mjs"], { label: "postbuild deterministic" });
