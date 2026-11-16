// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  family = "00000000-0000-4000-8000-000000000010",
  account = "00000000-0000-4000-8000-000000000020",
  card = "00000000-0000-4000-8000-000000000030";
let db: PGlite;
async function asUser(user: string, sql: string, params?: unknown[]) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`,
  );
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
async function command(
  type: string,
  payload: unknown,
  user = a,
  key = crypto.randomUUID(),
) {
  return asUser(user, "select public.execute_command($1::jsonb)", [
    JSON.stringify({ key, type, payload }),
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const f of readdirSync("supabase/migrations")
    .sort()
    .filter(
      (f) =>
        f.startsWith("20261112") || f === "202611160013_recurrence_credit.sql",
    ))
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(
    `create or replace function private.business_today() returns date language sql stable as $$select date '2026-01-20'$$;insert into auth.users values('${a}'),('${b}');insert into public.families values('${family}','Teste fictício');insert into public.profiles values('${a}','${family}','Pessoa A','admin',true),('${b}','${family}','Pessoa B','member',true);insert into public.accounts values('${account}','${a}','Conta A','bank',1000000,'2026-01-01',now());insert into public.cards values('${card}','${a}','Itaú',5,15,array['${b}'::uuid]);`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("recorrências no PostgreSQL e RLS", () => {
  it("adiantamento confirmado vira crédito rastreável sem renda ou pagamento de fatura", async () => {
    const bankB = crypto.randomUUID(),
      advance = crypto.randomUUID(),
      purchase = crypto.randomUUID(),
      key = crypto.randomUUID();
    await db.query(
      "insert into public.accounts(id,owner_id,name,kind,opening,cutoff) values($1,$2,'Conta B','bank',100000,'2026-01-01')",
      [bankB, b],
    );
    await command(
      "entry",
      {
        id: purchase,
        description: "Compra de B",
        kind: "expense",
        amount: 3000,
        occurred_on: "2026-01-19",
        category: "Outros",
        consumer_id: b,
        card_id: card,
        splits: [],
      },
      b,
    );
    await command(
      "send_advance",
      {
        id: advance,
        recipient_id: a,
        account_id: bankB,
        amount: 5000,
        date: "2026-01-19",
        description: "Crédito para compras",
      },
      b,
      key,
    );
    await command(
      "send_advance",
      {
        id: advance,
        recipient_id: a,
        account_id: bankB,
        amount: 5000,
        date: "2026-01-19",
        description: "Crédito para compras",
      },
      b,
      key,
    );
    expect(
      (
        await db.query(
          "select * from public.account_movements where reference_id=$1",
          [advance],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      command(
        "confirm_advance",
        { id: advance, version: 1, account_id: bankB, date: "2026-01-20" },
        b,
      ),
    ).rejects.toThrow(/confirmation/);
    await command("confirm_advance", {
      id: advance,
      version: 1,
      account_id: account,
      date: "2026-01-20",
    });
    expect(
      (
        await db.query(
          "select * from public.account_movements where reference_id=$1",
          [advance],
        )
      ).rows,
    ).toHaveLength(2);
    const allocationKey = crypto.randomUUID();
    await command(
      "allocate_advance",
      {
        id: advance,
        version: 2,
        settlement_id: purchase,
        settlement_version: 1,
        amount: 3000,
        date: "2026-01-20",
      },
      b,
      allocationKey,
    );
    expect(
      (
        await db.query<{ confirmed: number }>(
          "select confirmed from public.settlements where id=$1",
          [purchase],
        )
      ).rows[0].confirmed,
    ).toBe(3000);
    expect(
      (
        await db.query("select * from public.payments where obligation_id=$1", [
          `${purchase}:1`,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.entries where kind='income'")).rows,
    ).toHaveLength(0);
    await expect(
      command(
        "allocate_advance",
        {
          id: advance,
          version: 3,
          settlement_id: purchase,
          settlement_version: 2,
          amount: 1,
          date: "2026-01-20",
        },
        b,
      ),
    ).rejects.toThrow(/exceeds/);
    await expect(
      command("reverse_advance", {
        id: advance,
        version: 3,
        date: "2026-01-20",
        reason: "Correção do crédito",
      }),
    ).rejects.toThrow(/allocations/);
    await command("reverse_advance_allocation", {
      id: allocationKey,
      version: 3,
      date: "2026-01-20",
      reason: "Correção do crédito",
    });
    await command("reverse_advance", {
      id: advance,
      version: 4,
      date: "2026-01-20",
      reason: "Correção do envio",
    });
    expect(
      (
        await db.query<{ confirmed: number }>(
          "select confirmed from public.settlements where id=$1",
          [purchase],
        )
      ).rows[0].confirmed,
    ).toBe(0);
    const net = (
      await db.query<{ net: number }>(
        "select sum(amount) as net from public.account_movements where account_id=$1",
        [bankB],
      )
    ).rows[0].net;
    expect(Number(net)).toBe(0);
    expect(
      (
        await asUser(
          b,
          "select (public.load_finances()->'family_advances') as advances",
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      asUser(
        a,
        "insert into public.family_advances(id) values(gen_random_uuid())",
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("gera, amplia e repete calendário semanal sem duplicação", async () => {
    const id = crypto.randomUUID(),
      key = crypto.randomUUID();
    const payload = {
      id,
      description: "Semana",
      amount: 1000,
      date: "2026-01-01",
      interval_unit: "days",
      interval_count: 7,
      count: 6,
    };
    await command("recurrence_v2", payload, a, key);
    await command("recurrence_v2", payload, a, key);
    await expect(
      command("recurrence_v2", { ...payload, amount: 2000 }, a, key),
    ).rejects.toThrow(/Idempotency/);
    await command("generate_v2", { id, version: 1, count: 10 });
    await command("generate_v2", { id, version: 1, count: 10 });
    const rows = (
      await db.query<{ due_on: string }>(
        "select due_on::text from public.obligations where recurrence_id=$1 order by occurrence_index",
        [id],
      )
    ).rows;
    expect(rows).toHaveLength(10);
    expect(rows[1].due_on).toBe("2026-01-08");
    expect(
      (await asUser(b, "select * from public.recurrences where id=$1", [id]))
        .rows,
    ).toHaveLength(0);
    await expect(
      command("generate_v2", { id, version: 1, count: 11 }, b),
    ).rejects.toThrow(/conflict/);
    await expect(
      asUser(a, "update public.recurrences set amount=1 where id=$1", [id]),
    ).rejects.toThrow(/permission denied/);
  });
  it("alteração futura preserva passado, pagamentos e vencimento histórico", async () => {
    const id = crypto.randomUUID();
    await command("recurrence_v2", {
      id,
      description: "Mensal",
      amount: 2000,
      date: "2026-01-01",
      count: 4,
    });
    await command("pay", {
      obligation_id: `${id}:1`,
      account_id: account,
      amount: 500,
      paid_on: "2026-01-19",
      version: 1,
    });
    await command("recurrence_edit", {
      id,
      version: 1,
      scope: "next",
      from_index: 1,
      date: "2026-02-15",
      amount: 3000,
      description: "Ajustada",
      category: "Moradia",
      interval_unit: "months",
      interval_count: 1,
      reason: "Novo valor informado",
    });
    const rows = (
      await db.query<{ amount: number; due_on: string }>(
        "select amount,due_on::text from public.obligations where recurrence_id=$1 order by occurrence_index",
        [id],
      )
    ).rows;
    expect(rows).toEqual([
      { amount: 2000, due_on: "2026-01-01" },
      { amount: 2000, due_on: "2026-02-01" },
      { amount: 3000, due_on: "2026-03-15" },
      { amount: 3000, due_on: "2026-04-15" },
    ]);
    await expect(
      command("recurrence_edit", {
        id,
        version: 1,
        scope: "next",
        from_index: 1,
        date: "2026-02-15",
        amount: 4000,
        description: "Conflict",
        reason: "Stale version",
      }),
    ).rejects.toThrow(/conflict/);
    expect(
      (
        await db.query(
          "select * from public.audit_logs where action='recurrence_occurrence_edit' and request_key is not null",
        )
      ).rows.length,
    ).toBeGreaterThanOrEqual(2);
  });
  it("corrige somente a ocorrência e cancela sem permitir pagamento posterior", async () => {
    const id = crypto.randomUUID();
    await command("recurrence_v2", {
      id,
      description: "Energia",
      amount: 20000,
      date: "2026-02-01",
      count: 3,
      variable: true,
    });
    await command("recurrence_edit", {
      id,
      version: 1,
      scope: "this",
      occurrence_id: `${id}:0`,
      occurrence_version: 1,
      date: "2026-02-02",
      amount: 23000,
      description: "Energia conferida",
      variable: false,
      reason: "Valor real da conta",
    });
    const rows = (
      await db.query<{ amount: number; due_on: string; unknown: boolean }>(
        "select amount,due_on::text,unknown from public.obligations where recurrence_id=$1 order by occurrence_index",
        [id],
      )
    ).rows;
    expect(rows[0]).toEqual({
      amount: 23000,
      due_on: "2026-02-02",
      unknown: false,
    });
    expect(rows[1].amount).toBe(20000);
    await command("recurrence_edit", {
      id,
      version: 2,
      scope: "this",
      occurrence_id: `${id}:1`,
      occurrence_version: 1,
      cancel: true,
      reason: "Contrato cancelado",
    });
    await expect(
      command("pay", {
        obligation_id: `${id}:1`,
        version: 2,
        account_id: account,
        amount: 100,
        paid_on: "2026-01-20",
      }),
    ).rejects.toThrow(/Cancelled/);
  });
  it("compra em andamento com parcelas diferentes preserva consumo único e não cria caixa histórico", async () => {
    const id = crypto.randomUUID(),
      key = crypto.randomUUID();
    const payload = {
      id,
      description: "Compra financiada",
      amounts: [13000, 14000, 12000],
      original_amount: 30000,
      first_due: "2025-12-15",
      occurred_on: "2025-11-20",
      interest_kind: "included",
      card_id: card,
      consumer_id: a,
      category: "Compras pessoais",
      history: [{ number: 1, amount: 13000, paid_on: "2025-12-15" }],
    };
    await command("purchase_v2", payload, a, key);
    await command("purchase_v2", payload, a, key);
    const entry = (
      await db.query<{
        amount: number;
        original_amount: number;
        installment_amounts: number[];
      }>(
        "select amount,original_amount,installment_amounts from public.entries where id=$1",
        [id],
      )
    ).rows[0];
    expect(entry).toEqual({
      amount: 39000,
      original_amount: 30000,
      installment_amounts: [13000, 14000, 12000],
    });
    const rows = (
      await db.query<{ amount: number; confirmed: number; unknown: boolean }>(
        "select amount,confirmed,unknown from public.obligations where id like $1 order by number",
        [`${id}:%`],
      )
    ).rows;
    expect(rows).toEqual([
      { amount: 13000, confirmed: 13000, unknown: false },
      { amount: 14000, confirmed: 0, unknown: true },
      { amount: 12000, confirmed: 0, unknown: false },
    ]);
    expect(
      (
        await db.query(
          "select * from public.account_movements where reference_id=$1",
          [key],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(b, "select * from public.entries where id=$1", [id])).rows,
    ).toHaveLength(0);
  });
  it("recusa compra inválida e helper privilegiado sem gravação parcial", async () => {
    const id = crypto.randomUUID();
    await expect(
      command("purchase_v2", {
        id,
        description: "Inválida",
        amounts: [13000, -1],
        first_due: "2026-02-15",
        occurred_on: "2026-01-19",
        interest_kind: "unknown",
        card_id: card,
        consumer_id: a,
        category: "Outros",
      }),
    ).rejects.toThrow();
    expect(
      (await db.query("select * from public.entries where id=$1", [id])).rows,
    ).toHaveLength(0);
    await expect(
      asUser(a, "select public.execute_before_recurrence('{}'::jsonb)"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(a, "select private.generate_recurrence($1,10)", [id]),
    ).rejects.toThrow(/permission denied/);
  });
});
