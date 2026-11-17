// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  family = "00000000-0000-4000-8000-000000000010",
  account = "00000000-0000-4000-8000-000000000020",
  goal = "00000000-0000-4000-8000-000000000030";
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
async function command(
  user: string,
  type: string,
  payload: unknown,
  key = crypto.randomUUID(),
) {
  return asUser(
    user,
    `select public.execute_command('${JSON.stringify({ key, type, payload }).replaceAll("'", "''")}'::jsonb)`,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter(
      (f) =>
        f.startsWith("20261112") || f === "202611160012_personal_planning.sql",
    )
    .sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  await db.exec(
    `create or replace function private.business_today() returns date language sql stable as $$select date '2026-12-31'$$;insert into auth.users values('${a}'),('${b}');insert into public.families values('${family}','Fictícia');insert into public.profiles values('${a}','${family}','Pessoa A','admin',true),('${b}','${family}','Pessoa B','member',true);insert into public.accounts values('${account}','${b}','Privada B','bank',100000,'2026-01-01',now());`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("PostgreSQL: orçamento e reserva privados", () => {
  it("orçamento idempotente, versões e edição futura atômica", async () => {
    const payload = {
      month: "2026-11",
      category: "Lazer",
      amount: 10000,
      warning: 80,
      version: 0,
    };
    const key = crypto.randomUUID();
    await command(b, "budget", payload, key);
    await command(b, "budget", payload, key);
    expect(
      (await db.query("select version from personal_budgets")).rows,
    ).toEqual([{ version: 1 }]);
    await expect(
      command(b, "budget", { ...payload, amount: 11000 }, key),
    ).rejects.toThrow(/Idempotency/);
    await expect(
      command(b, "budget", { ...payload, version: 0 }),
    ).rejects.toThrow(/conflict/);
    await command(b, "budget", { ...payload, version: 1, months: 3 });
    expect(
      (await db.query("select count(*)::int count from personal_budgets")).rows,
    ).toEqual([{ count: 3 }]);
    await expect(
      command(b, "budget", { ...payload, version: 2, months: 3 }),
    ).rejects.toThrow(/conflict/);
    expect(
      (
        await db.query(
          "select version from personal_budgets where month='2026-11'",
        )
      ).rows,
    ).toEqual([{ version: 2 }]);
  });
  it("copie mês anterior preservando valores já definidos", async () => {
    await command(b, "budget", {
      month: "2026-10",
      category: "Educação",
      amount: 12000,
      warning: 90,
      version: 0,
    });
    await command(b, "budget_copy", { month: "2026-11" });
    await command(b, "budget_copy", { month: "2026-11" });
    expect(
      (
        await db.query(
          "select amount::int amount from personal_budgets where month='2026-11' and category='Educação'",
        )
      ).rows,
    ).toEqual([{ amount: 12000 }]);
  });
  it("admin não lê orçamento/meta alheios e escrita direta é negada", async () => {
    await command(b, "savings_goal", {
      id: goal,
      version: 0,
      name: "Reserva privada",
      kind: "emergency",
      target: 200000,
      initial: 10000,
      account_id: account,
      created_on: "2026-01-01",
    });
    for (const table of [
      "personal_budgets",
      "savings_goals",
      "savings_movements",
    ]) {
      expect(
        (await asUser(a, `select * from public.${table}`)).rows,
      ).toHaveLength(0);
      await expect(asUser(b, `delete from public.${table}`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        asUser(b, `update public.${table} set owner_id='${a}'`),
      ).rejects.toThrow(/permission denied/);
    }
    const snapshot = (await asUser(a, "select public.load_finances() snapshot"))
      .rows[0] as {
      snapshot: { personal_budgets: unknown[]; savings_goals: unknown[] };
    };
    expect(snapshot.snapshot.personal_budgets).toEqual([]);
    expect(snapshot.snapshot.savings_goals).toEqual([]);
    await expect(
      command(a, "savings_goal", {
        id: goal,
        version: 1,
        name: "Outra",
        kind: "savings",
        target: 1,
      }),
    ).rejects.toThrow(/Unauthorized/);
  });
  it("aportes e retiradas preservam caixa, original e auditoria", async () => {
    const deposit = crypto.randomUUID(),
      withdraw = crypto.randomUUID();
    const key = crypto.randomUUID();
    const p = {
      id: deposit,
      goal_id: goal,
      version: 1,
      amount: 20000,
      direction: "deposit",
      occurred_on: "2026-11-01",
      reason: "Separado",
    };
    await command(b, "savings_move", p, key);
    await command(b, "savings_move", p, key);
    await command(b, "savings_move", {
      id: withdraw,
      goal_id: goal,
      version: 2,
      amount: 5000,
      direction: "withdrawal",
      occurred_on: "2026-11-02",
      reason: "Usei",
    });
    await command(b, "savings_reverse", {
      id: crypto.randomUUID(),
      goal_id: goal,
      version: 3,
      movement_id: withdraw,
      occurred_on: "2026-11-03",
      reason: "Corrigi",
    });
    expect(
      (
        await db.query(
          "select sum(amount)::int amount,count(*)::int count from savings_movements",
        )
      ).rows,
    ).toEqual([{ amount: 20000, count: 3 }]);
    expect(
      (
        await db.query(
          `select private.account_balance('${account}')::int balance`,
        )
      ).rows,
    ).toEqual([{ balance: 100000 }]);
    expect(
      (await db.query("select count(*)::int count from entries")).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (await db.query("select count(*)::int count from account_movements"))
        .rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await db.query(
          "select count(*)::int count from audit_logs where action='savings_move'",
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  });
  it("recusa saldo reservado excessivo, histórico negativo e edição sem versão", async () => {
    await expect(
      command(b, "savings_move", {
        id: crypto.randomUUID(),
        goal_id: goal,
        version: 4,
        amount: 50000,
        direction: "withdrawal",
        occurred_on: "2026-11-04",
        reason: "Inválido",
      }),
    ).rejects.toThrow(/exceeds/);
    await expect(
      command(b, "savings_goal", {
        id: crypto.randomUUID(),
        version: 0,
        name: "Dupla reserva",
        kind: "savings",
        target: 200000,
        initial: 90000,
        account_id: account,
      }),
    ).rejects.toThrow(/exceeds/);
    await expect(
      command(b, "savings_goal", {
        id: goal,
        name: "Ausente versão",
        kind: "savings",
        target: 200000,
        account_id: account,
      }),
    ).rejects.toThrow(/conflict/);
    await expect(
      command(b, "savings_goal", {
        id: goal,
        version: 4,
        name: "Alteração inicial",
        kind: "savings",
        target: 200000,
        initial: 0,
        account_id: account,
      }),
    ).rejects.toThrow(/audited/);
    expect(
      (await db.query("select count(*)::int count from savings_goals")).rows,
    ).toEqual([{ count: 1 }]);
    expect((await db.query("select version from savings_goals")).rows).toEqual([
      { version: 4 },
    ]);
  });
  it("desativar perfil remove acesso a orçamento e reserva", async () => {
    await db.exec(`update profiles set active=false where id='${b}'`);
    expect((await asUser(b, "select * from savings_goals")).rows).toEqual([]);
    await expect(
      command(b, "budget_copy", { month: "2027-01" }),
    ).rejects.toThrow(/Unauthorized/);
  });
});
