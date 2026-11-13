// Isolated LOCAL rehearsal only. Never accepts a remote connection string.
import { spawn } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const dump = process.argv[2];
if (!dump) throw Error("Informe o caminho privado do dump local.");
const container = "supabase_db_financas-familiares";
const database = `financas_restore_${crypto.randomUUID().slice(0, 8)}`;
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
async function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["--host=unix:///var/run/docker.sock", ...args],
      { env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (v) => (output += v));
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(output) : reject(Error("Operação local recusada.")),
    );
    if (input?.file) createReadStream(input.file).pipe(child.stdin);
    else child.stdin.end(input || "");
  });
}
const sql = (db, query) =>
  docker([
    "exec",
    container,
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    db,
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ]);
let created = false;
let stage = "criar banco descartável";
try {
  await docker([
    "exec",
    container,
    "createdb",
    "-U",
    "supabase_admin",
    database,
  ]);
  created = true;
  await sql(database, "drop schema public cascade");
  stage = "restaurar dump";
  await docker(
    [
      "exec",
      "-i",
      container,
      "pg_restore",
      "-U",
      "supabase_admin",
      "-d",
      database,
      "--no-owner",
      "--exit-on-error",
    ],
    { file: dump },
  );
  const tables = [
    "accounts",
    "entries",
    "obligations",
    "payments",
    "settlements",
    "account_movements",
    "plans",
    "audit_logs",
    "income_months",
    "income_references",
  ];
  const parts = tables
    .map((t) => `'${t}',(select count(*) from public.${t})`)
    .join(",");
  const query = `select jsonb_build_object(${parts},'users',(select count(*) from auth.users),'identity_integrity',(select md5(string_agg(id::text||coalesce(encrypted_password,''),',' order by id)) from auth.users))::text`;
  stage = "comparar dados e identidades";
  assert.deepEqual(
    JSON.parse(await sql(database, query)),
    JSON.parse(await sql("postgres", query)),
  );
  await sql(
    database,
    "create schema if not exists extensions;grant usage on schema extensions to authenticated",
  );
  stage = "verificar RLS após restaurar";
  const result = await docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      database,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    readFileSync("supabase/tests/access.test.sql", "utf8"),
  );
  assert.equal((result.match(/^ok \d+/gm) || []).length, 15);
  assert(!/^not ok /m.test(result));
  console.log(
    "Restauração local aprovada: contagens financeiras, integridade das identidades Auth e 15 verificações RLS.",
  );
} catch {
  console.error(
    `Ensaio local de restauração falhou em: ${stage}; não confiar no backup antes de investigar.`,
  );
  process.exitCode = 1;
} finally {
  if (created)
    await docker([
      "exec",
      container,
      "dropdb",
      "-U",
      "supabase_admin",
      database,
    ]);
}
