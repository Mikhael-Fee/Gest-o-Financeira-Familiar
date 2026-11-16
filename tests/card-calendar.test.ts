// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
import { cardLimit } from "../src/domain/cards";
import { emptyState } from "../src/domain/finance";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  fam = "00000000-0000-4000-8000-000000000010",
  card = "00000000-0000-4000-8000-000000000030";
let db: PGlite;
async function asUser(user: string, sql: string) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
const command = (
  user: string,
  type: string,
  payload: unknown,
  key = crypto.randomUUID(),
) =>
  asUser(
    user,
    `select public.execute_command('${JSON.stringify({ key, type, payload }).replaceAll("'", "''")}'::jsonb)`,
  );
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.exec(
    `insert into auth.users values('${a}'),('${b}');insert into public.families values('${fam}','Teste');insert into public.profiles values('${a}','${fam}','A','admin',true),('${b}','${fam}','B','member',true);insert into public.cards(id,owner_id,name,closing,due,authorized) values('${card}','${a}','Itaú',5,15,ARRAY['${b}'::uuid]);`,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("titular ajusta limite, versão antiga e outro membro são negados", async () => {
  const p = {
    card_id: card,
    closing: 5,
    due: 15,
    credit_limit: 150000,
    version: 1,
    reason: "Conferência",
  };
  await command(a, "card_settings", p);
  await expect(command(a, "card_settings", p)).rejects.toThrow(/conflict/i);
  await expect(
    command(b, "card_settings", { ...p, version: 2 }),
  ).rejects.toThrow(/Unauthorized/i);
  expect(
    (await asUser(a, "select credit_limit from public.cards")).rows[0],
  ).toMatchObject({ credit_limit: 150000 });
});
it("exceção do ciclo respeita fechamento real e vencimento", async () => {
  await command(a, "card_cycle", {
    card_id: card,
    month: "2026-10",
    closing_on: "2026-10-07",
    due_on: "2026-10-19",
    version: 0,
    reason: "Extrato do banco",
  });
  const id = crypto.randomUUID();
  await command(a, "entry", {
    id,
    description: "Compra teste",
    kind: "expense",
    amount: 13000,
    occurred_on: "2026-10-06",
    category: "Outros",
    house: false,
    consumer_id: a,
    responsible_id: a,
    card_id: card,
    splits: [],
    installments: 1,
  });
  expect(
    (
      await asUser(
        a,
        `select due_on::text from public.obligations where id='${id}:1'`,
      )
    ).rows[0],
  ).toMatchObject({ due_on: "2026-10-19" });
  await command(a, "card_reassign", {
    card_id: card,
    id: id + ":1",
    due_on: "2026-11-18",
    version: 1,
    reason: "Compra reatribuída pelo banco",
  });
  expect(
    (
      await asUser(
        a,
        `select due_on::text from public.obligations where id='${id}:1'`,
      )
    ).rows[0],
  ).toMatchObject({ due_on: "2026-11-18" });
  expect(
    (
      await asUser(
        a,
        `select count(*)::int as n from public.entries where id='${id}'`,
      )
    ).rows[0],
  ).toMatchObject({ n: 1 });
});
it("limite usa passivo ainda aberto, sem contar pagamentos ou transporte duas vezes", () => {
  const state = emptyState();
  const c = {
    id: "c",
    owner_id: "a",
    name: "Cartão",
    closing: 5,
    due: 15,
    authorized: [],
    credit_limit: 100000,
  };
  state.obligations = [
    {
      id: "x",
      owner_id: "a",
      family_id: "f",
      description: "Compra",
      amount: 20000,
      due_on: "2026-11-15",
      house: false,
      confirmed: 0,
      unknown: false,
      plan_id: null,
      number: 1,
      card_id: "c",
      replaced_by: null,
      version: 1,
    },
  ];
  state.payments = [
    {
      id: "p",
      obligation_id: "x",
      account_id: "a",
      amount: 5000,
      paid_on: "2026-11-15",
      payer_id: "a",
      key: "k",
    },
  ];
  expect(cardLimit(c, state)).toEqual({ committed: 15000, available: 85000 });
  state.obligations[0].replaced_by = "new";
  expect(cardLimit(c, state).committed).toBe(0);
});
