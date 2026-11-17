import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
export const ids = {
  a: "00000000-0000-4000-8000-000000000001",
  b: "00000000-0000-4000-8000-000000000002",
  c: "00000000-0000-4000-8000-000000000003",
  foreign: "00000000-0000-4000-8000-000000000004",
  family: "00000000-0000-4000-8000-000000000010",
  other: "00000000-0000-4000-8000-000000000011",
  bankA: "00000000-0000-4000-8000-000000000020",
  bankB: "00000000-0000-4000-8000-000000000021",
  bankC: "00000000-0000-4000-8000-000000000022",
  card: "00000000-0000-4000-8000-000000000030",
};
export async function auditDb() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  const x = ids;
  await db.exec(
    `insert into auth.users values('${x.a}'),('${x.b}'),('${x.c}'),('${x.foreign}');insert into families values('${x.family}','Auditoria fictícia'),('${x.other}','Outra fictícia');insert into profiles values('${x.a}','${x.family}','A','admin',true),('${x.b}','${x.family}','B','member',true),('${x.c}','${x.family}','C','member',true),('${x.foreign}','${x.other}','D','admin',true);insert into accounts(id,owner_id,name,kind,opening,cutoff) values('${x.bankA}','${x.a}','A','bank',2000000,'2026-01-01'),('${x.bankB}','${x.b}','B','bank',2000000,'2026-01-01'),('${x.bankC}','${x.c}','C','bank',2000000,'2026-01-01');insert into cards(id,owner_id,name,closing,due,authorized) values('${x.card}','${x.a}','Itaú fictício',5,15,ARRAY['${x.b}'::uuid]);`,
  );
  return db;
}
export async function asUser(db: PGlite, user: string, sql: string) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
export async function dbCommand(
  db: PGlite,
  user: string,
  type: string,
  payload: unknown,
  key = crypto.randomUUID(),
) {
  return asUser(
    db,
    user,
    `select execute_command('${JSON.stringify({ key, type, payload }).replaceAll("'", "''")}'::jsonb)`,
  );
}
export const entryPayload = (id: string, house = true) => ({
  id,
  description: "Supermercado fictício",
  kind: "expense",
  amount: 50000,
  occurred_on: "2026-11-03",
  category: "Alimentação",
  house,
  consumer_id: ids.b,
  responsible_id: ids.b,
  card_id: ids.card,
  splits: [],
  installments: 1,
});
