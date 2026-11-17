import { setTimeout as delay } from "node:timers/promises";
// Explicit operator action only. One authorized site; never invoked by install.
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const site = "765aa88f-68b9-44d3-8859-1483f2f2efbc";
const origin = "https://entre-nos-homologacao.netlify.app";
const token = process.env.NETLIFY_AUTH_TOKEN;
if (!token) throw Error("NETLIFY_AUTH_TOKEN ausente.");
const metadata = JSON.parse(await readFile("dist/version.json", "utf8"));
if (!/^[a-f0-9]{40}$/.test(metadata.commit ?? ""))
  throw Error("Compile um commit versionado antes de publicar.");
const files = {},
  contents = new Map();
async function walk(directory = "") {
  for (const entry of await readdir("dist/" + directory, {
    withFileTypes: true,
  })) {
    const relative = directory + entry.name;
    if (entry.isDirectory()) {
      if (relative !== "assets")
        throw Error("Diretório inesperado no artefato.");
      await walk(relative + "/");
      continue;
    }
    if (
      !/^(assets\/[\w.-]+\.(js|css|woff|woff2)|index\.html|sw\.js|manifest\.webmanifest|icon(?:-192|-512)?\.(svg|png)|version\.json|_headers|_redirects)$/.test(
        relative,
      )
    )
      throw Error("Arquivo inesperado no artefato.");
    const body = await readFile("dist/" + relative),
      sha = createHash("sha1").update(body).digest("hex");
    files[relative] = sha;
    contents.set(sha, { relative, body });
  }
}
await walk();
async function request(route, method = "GET", body, binary = false) {
  const response = await fetch("https://api.netlify.com/api/v1" + route, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": binary ? "application/octet-stream" : "application/json",
    },
    ...(body ? { body: binary ? body : JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw Error(`Netlify ${response.status} na publicação autorizada.`);
  return response.status === 204 ? null : response.json();
}
const current = await request(`/sites/${site}`);
if (current.ssl_url !== origin || current.name !== "entre-nos-homologacao")
  throw Error("Site fora do escopo.");
const deploy = await request(
  `/sites/${site}/deploys?title=${encodeURIComponent("Homologação " + metadata.commit)}`,
  "POST",
  { files, draft: true, branch: "feat/aplicativo-financas-familiares" },
);
for (const sha of deploy.required ?? []) {
  const file = contents.get(sha);
  if (!file) throw Error("Digest exigido não pertence ao artefato.");
  await request(
    `/deploys/${deploy.id}/files/${file.relative}`,
    "PUT",
    file.body,
    true,
  );
}
let ready = false;
for (let attempt = 0; attempt < 90; attempt++) {
  const status = await request(`/deploys/${deploy.id}`);
  if (status.state === "ready") {
    ready = true;
    break;
  }
  if (status.state === "error")
    throw Error("Falha de processamento do deploy.");
  await delay(2000);
}
if (!ready)
  throw Error("Deploy ainda não ficou ready; confirme antes de publicar.");
await request(`/sites/${site}/deploys/${deploy.id}/restore`, "POST");
const published = await request(`/sites/${site}`);
if (published.published_deploy?.id !== deploy.id)
  throw Error("Publicação principal não confirmada.");
const version = await fetch(origin + "/version.json?deploy=" + deploy.id, {
  cache: "no-store",
}).then((response) => response.json());
if (version.commit !== metadata.commit)
  throw Error("Commit público divergente.");
console.log(
  JSON.stringify({
    site: origin,
    deploy: deploy.id,
    commit: version.commit,
    files: Object.keys(files).length,
    state: "ready",
    published: true,
  }),
);
