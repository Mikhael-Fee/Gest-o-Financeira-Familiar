import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = await readdir("dist/assets");
const shell = [
  "/",
  "/icon.svg",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  ...files.map((f) => `/assets/${f}`),
];
const revision = createHash("sha256")
  .update(JSON.stringify(shell))
  .digest("hex")
  .slice(0, 12);
let worker = await readFile("public/sw.js", "utf8");
worker = worker.replace(
  /const CACHE\s*=\s*[^;]+;/,
  `const CACHE='entre-nos-${revision}';`,
);
worker = worker.replace(
  /c\.addAll\([^)]*\)/,
  `c.addAll(${JSON.stringify(shell)})`,
);
await writeFile("dist/sw.js", worker);
