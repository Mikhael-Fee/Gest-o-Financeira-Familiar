// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002",
  F = "10000000-0000-4000-8000-000000000010",
  BANK = "10000000-0000-4000-8000-000000000020",
  VA = "10000000-0000-4000-8000-000000000021";
let db: PGlite;
async function user<T>(id: string, sql: string, params: unknown[] = []) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`,
  );
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
async function cmd(
  id: string,
  type: string,
  payload: unknown,
  key = crypto.randomUUID(),
) {
  return user(id, "select public.execute_command($1::jsonb)", [
    JSON.stringify({ type, payload, key }),
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.startsWith("20261112"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(
    readFileSync(
      "supabase/migrations/202611160014_income_availability.sql",
      "utf8",
    ),
  );
  await db.exec(
    `create or replace function private.business_today() returns date language sql stable as $$select date '2026-11-16'$$;insert into auth.users values('${A}'),('${B}');insert into public.families values('${F}','Fictícia');insert into public.profiles values('${A}','${F}','Pessoa A','admin',true),('${B}','${F}','Pessoa B','member',true);insert into public.accounts(id,owner_id,name,kind,opening,cutoff) values('${BANK}','${B}','Banco B','bank',100000,'2026-01-01'),('${VA}','${B}','VA B','VA',50000,'2026-01-01');insert into public.obligations(id,owner_id,family_id,description,amount,due_on,house,confirmed,unknown) values('private-bill','${B}','${F}','Fictícia',30000,'2026-11-20',false,0,false);`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("planejamento SQL/RLS real", () => {
  it("previsão privada não cria caixa e snapshot preserva RLS até para admin", async () => {
    const id = crypto.randomUUID();
    await cmd(B, "future_receipt", {
      id,
      version: 0,
      description: "Salário fictício",
      amount: 250000,
      expected_on: "2026-11-20",
      month: "2026-11",
      kind: "salary",
      certainty: "committed",
      account_id: BANK,
    });
    expect(
      (await user(A, "select * from public.future_receipts")).rows,
    ).toHaveLength(0);
    expect(
      (await user(B, "select * from public.future_receipts")).rows,
    ).toHaveLength(1);
    const snapshot = (
      await user<{ load_finances: { future_receipts: unknown[] } }>(
        A,
        "select load_finances()",
      )
    ).rows[0].load_finances;
    expect(snapshot.future_receipts).toEqual([]);
    expect(
      (
        await db.query<{ value: number }>(
          `select private.account_balance('${BANK}') value`,
        )
      ).rows[0].value,
    ).toBe(100000);
  });
  it("GRANT nega escrita direta e usuário sem propriedade não altera uma previsão", async () => {
    await expect(
      user(
        B,
        `insert into public.future_receipts(id,owner_id,description,amount,expected_on,month,kind,certainty) values(gen_random_uuid(),'${B}','x',100,'2026-11-20','2026-11','salary','expected')`,
      ),
    ).rejects.toThrow(/permission denied/);
    const row = (
      await db.query<{ id: string }>(
        "select id from public.future_receipts limit 1",
      )
    ).rows[0];
    await expect(
      cmd(A, "future_receipt", {
        id: row.id,
        version: 1,
        description: "Ataque",
        amount: 100,
        expected_on: "2026-11-20",
        month: "2026-11",
        kind: "salary",
        certainty: "expected",
        account_id: null,
      }),
    ).rejects.toThrow(/not editable/);
  });
  it("confirma com um único lançamento idempotente e competência separada, sem previsões no caixa", async () => {
    const id = crypto.randomUUID();
    await cmd(B, "future_receipt", {
      id,
      version: 0,
      description: "Extra fictício",
      amount: 30000,
      expected_on: "2026-11-15",
      month: "2026-10",
      kind: "extra",
      certainty: "expected",
      account_id: BANK,
    });
    const payload = {
        id,
        version: 1,
        date: "2026-11-15",
        amount: 35000,
        account_id: BANK,
      },
      key = crypto.randomUUID();
    await cmd(B, "confirm_future_receipt", payload, key);
    await cmd(B, "confirm_future_receipt", payload, key);
    const rows = (
      await user<{ salary_month: string; amount: number }>(
        B,
        "select salary_month,amount from public.entries where id=$1",
        [key],
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ salary_month: "2026-10", amount: 35000 });
    expect(
      (
        await db.query<{ value: number }>(
          `select private.account_balance('${BANK}') value`,
        )
      ).rows[0].value,
    ).toBe(135000);
    await expect(
      cmd(B, "confirm_future_receipt", { ...payload, amount: 99999 }, key),
    ).rejects.toThrow(/Idempotency conflict/);
    await expect(cmd(B, "confirm_future_receipt", payload)).rejects.toThrow(
      /Receipt conflict/,
    );
  });
  it("benefício não vira salário bancário e datas futuras não confirmam recebimento", async () => {
    const id = crypto.randomUUID();
    await expect(
      cmd(B, "future_receipt", {
        id,
        version: 0,
        description: "VA",
        amount: 10000,
        expected_on: "2026-11-16",
        month: "2026-11",
        kind: "benefit",
        certainty: "expected",
        account_id: BANK,
      }),
    ).rejects.toThrow(/Invalid receipt account/);
    await cmd(B, "future_receipt", {
      id,
      version: 0,
      description: "VA",
      amount: 10000,
      expected_on: "2026-11-16",
      month: "2026-11",
      kind: "benefit",
      certainty: "expected",
      account_id: VA,
    });
    await expect(
      cmd(B, "confirm_future_receipt", {
        id,
        version: 1,
        date: "2026-11-17",
        account_id: VA,
      }),
    ).rejects.toThrow(/Future effective date/);
    await expect(
      cmd(B, "confirm_future_receipt", {
        id,
        version: 1,
        date: "2026-11-16",
        account_id: BANK,
      }),
    ).rejects.toThrow(/Invalid receipt account/);
    await cmd(B, "confirm_future_receipt", {
      id,
      version: 1,
      date: "2026-11-16",
      account_id: VA,
    });
    expect(
      (
        await user<{ kind: string }>(
          B,
          "select kind from public.entries where kind='benefit'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("versão mensal preserva cenário/data prevista sem inventar entrada", async () => {
    await cmd(B, "income_month", {
      month: "2026-12",
      expected: 280000,
      version: 0,
      scenario: "history",
      expected_on: "2027-01-05",
    });
    const row = (
      await user<{ scenario: string; expected_on: string }>(
        B,
        "select scenario,expected_on::text from public.income_months where month='2026-12'",
      )
    ).rows[0];
    expect(row).toMatchObject({
      scenario: "history",
      expected_on: "2027-01-05",
    });
    await expect(
      cmd(B, "income_month", {
        month: "2026-12",
        expected: 290000,
        version: 0,
      }),
    ).rejects.toThrow(/Monthly income conflict/);
  });
  it("conferência e reserva não movimentam caixa, negam saldo falso e propriedade alheia", async () => {
    await expect(
      cmd(B, "account_check", {
        account_id: BANK,
        date: "2026-11-16",
        confirmed_balance: 1,
        version: 0,
      }),
    ).rejects.toThrow(/Reconcile/);
    await cmd(B, "account_check", {
      account_id: BANK,
      date: "2026-11-16",
      confirmed_balance: 135000,
      version: 0,
    });
    await expect(
      cmd(A, "account_check", {
        account_id: BANK,
        date: "2026-11-16",
        confirmed_balance: 135000,
        version: 0,
      }),
    ).rejects.toThrow(/Invalid account/);
    await cmd(B, "reserve_obligation", {
      obligation_id: "private-bill",
      account_id: BANK,
      amount: 20000,
      version: 0,
    });
    expect(
      (await user(A, "select * from public.obligation_reservations")).rows,
    ).toHaveLength(0);
    await expect(
      cmd(B, "reserve_obligation", {
        obligation_id: "private-bill",
        account_id: BANK,
        amount: 40000,
        version: 1,
      }),
    ).rejects.toThrow(/exceeds obligation/);
    expect(
      (
        await db.query<{ value: number }>(
          `select private.account_balance('${BANK}') value`,
        )
      ).rows[0].value,
    ).toBe(135000);
  });
});
