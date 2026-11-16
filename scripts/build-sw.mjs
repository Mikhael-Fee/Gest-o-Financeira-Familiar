import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
let commit = process.env.COMMIT_REF;
if (!commit) {
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    commit = null;
  }
}
await writeFile(
  "dist/version.json",
  JSON.stringify({
    commit: /^[a-f0-9]{40}$/.test(commit ?? "") ? commit : null,
    assets_revision: revision,
    built_at: new Date().toISOString(),
  }),
);
// Static API uploads must carry the same SPA routing and headers as hosted builds.
await writeFile("dist/_redirects", "/* /index.html 200\n");
const configuration = await readFile("netlify.toml", "utf8");
const values = configuration.split("[headers.values]")[1] ?? "";
const headers = values
  .split("\n")
  .map((line) => line.match(/^([\w-]+)\s*=\s*(".*")\s*$/))
  .filter(Boolean)
  .map((match) => `  ${match[1]}: ${JSON.parse(match[2])}`);
await writeFile("dist/_headers", "/*\n" + headers.join("\n") + "\n");
