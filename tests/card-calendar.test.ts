// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
import { cardLimit } from "../src/domain/cards";
import { emptyState } from "../src/domain/finance";
import { apply } from "../src/data/store";
import { cardDueAt } from "../src/domain/cards";
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
it("reservas de metas e de várias obrigações compartilham o saldo sem criar caixa", async () => {
  const account = crypto.randomUUID(),
    goal = crypto.randomUUID();
  await command(a, "account", {
    id: account,
    name: "Fictícia",
    kind: "bank",
    opening: 100000,
    cutoff: "2026-01-01",
  });
  for (const name of ["bill-1", "bill-2"])
    await db.query(
      `insert into public.obligations(id,owner_id,family_id,description,amount,due_on) values($1,$2,$3,'Teste',50000,'2026-12-20')`,
      [name, a, fam],
    );
  await command(a, "savings_goal", {
    id: goal,
    name: "Reserva",
    kind: "emergency",
    target: 200000,
    initial: 60000,
    account_id: account,
    created_on: "2026-10-01",
    active: true,
    version: 0,
  });
  await expect(
    command(a, "reserve_obligation", {
      obligation_id: "bill-1",
      account_id: account,
      amount: 50000,
      version: 0,
    }),
  ).rejects.toThrow(/Combined reservations/);
  await command(a, "reserve_obligation", {
    obligation_id: "bill-1",
    account_id: account,
    amount: 40000,
    version: 0,
  });
  await expect(
    command(a, "reserve_obligation", {
      obligation_id: "bill-2",
      account_id: account,
      amount: 1,
      version: 0,
    }),
  ).rejects.toThrow(/Combined reservations/);
  await expect(
    command(a, "savings_move", {
      id: crypto.randomUUID(),
      goal_id: goal,
      amount: 1,
      direction: "deposit",
      occurred_on: "2026-10-01",
      reason: "Teste conjunto",
      version: 1,
    }),
  ).rejects.toThrow(/Combined reservations/);
  expect(
    (
      await db.query(
        "select count(*)::int n from savings_movements where goal_id=$1",
        [goal],
      )
    ).rows[0],
  ).toMatchObject({ n: 0 });
  expect(
    (await db.query("select opening from accounts where id=$1", [account]))
      .rows[0],
  ).toMatchObject({ opening: 100000 });
  await command(a, "pay", {
    obligation_id: "bill-1",
    account_id: account,
    amount: 40000,
    paid_on: "2026-10-10",
    version: 1,
  });
  await command(a, "reserve_obligation", {
    obligation_id: "bill-1",
    account_id: account,
    amount: 0,
    version: 1,
  });
});
it("demonstração rejeita a mesma reserva conjunta sem mutação parcial", () => {
  const s = emptyState(),
    user = { id: "a", family_id: "f", name: "A" };
  s.accounts = [
    {
      id: "bank",
      owner_id: "a",
      name: "Fictícia",
      kind: "bank",
      opening: 100000,
      cutoff: "2026-01-01",
    },
  ];
  s.obligations = [
    {
      id: "bill",
      owner_id: "a",
      family_id: "f",
      description: "Conta",
      amount: 50000,
      due_on: "2026-12-20",
      house: false,
      confirmed: 0,
      unknown: false,
      plan_id: null,
      number: null,
      card_id: null,
      replaced_by: null,
      version: 1,
    },
  ];
  const withGoal = apply(
    s,
    {
      key: "g",
      type: "savings_goal",
      payload: {
        id: "g",
        name: "Reserva",
        kind: "emergency",
        target: 200000,
        initial: 60000,
        account_id: "bank",
        created_on: "2026-10-01",
        active: true,
        version: 0,
      },
    },
    user,
  );
  expect(() =>
    apply(
      withGoal,
      {
        key: "r",
        type: "reserve_obligation",
        payload: {
          obligation_id: "bill",
          account_id: "bank",
          amount: 50000,
          version: 0,
        },
      },
      user,
    ),
  ).toThrow(/reservas/);
  expect(withGoal.obligation_reservations ?? []).toHaveLength(0);
});
it("compra detalhada usa exceções de cada ciclo, sem propagar dias excepcionais", async () => {
  await command(a, "card_cycle", {
    card_id: card,
    month: "2026-11",
    closing_on: "2026-11-05",
    due_on: "2026-11-20",
    version: 0,
    reason: "Calendário do banco",
  });
  const id = crypto.randomUUID();
  await command(a, "purchase_v2", {
    id,
    card_id: card,
    description: "Parcelas variáveis",
    occurred_on: "2026-10-06",
    first_due: "2026-10-01",
    use_card_calendar: true,
    amounts: [10000, 11000, 12000],
    original_amount: 30000,
    interest_kind: "included",
    category: "Outros",
    house: false,
    consumer_id: a,
    responsible_id: a,
    history: [],
  });
  const rows = (
    await db.query<{ due_on: string; amount: number }>(
      "select due_on::text,amount from obligations where id like $1 order by number",
      [id + ":%"],
    )
  ).rows;
  expect(rows).toEqual([
    { due_on: "2026-10-19", amount: 10000 },
    { due_on: "2026-11-20", amount: 11000 },
    { due_on: "2026-12-15", amount: 12000 },
  ]);
  const state = emptyState();
  state.card_cycles = [
    {
      card_id: card,
      month: "2026-10",
      closing_on: "2026-10-07",
      due_on: "2026-10-19",
      version: 1,
    },
    {
      card_id: card,
      month: "2026-11",
      closing_on: "2026-11-05",
      due_on: "2026-11-20",
      version: 1,
    },
  ];
  const c = {
    id: card,
    owner_id: a,
    name: "Teste",
    closing: 5,
    due: 15,
    authorized: [],
  };
  expect(
    [0, 1, 2].map((index) => cardDueAt(c, state, "2026-10-06", index)),
  ).toEqual(rows.map((r) => r.due_on));
});
