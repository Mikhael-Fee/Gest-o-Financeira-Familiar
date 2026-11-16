// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
import { applyLoanDetails, loanDue } from "../src/domain/loans";
import { emptyState } from "../src/domain/finance";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  fam = "00000000-0000-4000-8000-000000000010",
  plan = "00000000-0000-4000-8000-000000000020";
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
    "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.exec(
    "create or replace function private.business_today() returns date language sql stable as $$select date '2026-11-16'$$",
  );
  await db.exec(
    `insert into auth.users values('${a}'),('${b}');insert into public.families values('${fam}','Fictícia');insert into public.profiles values('${a}','${fam}','A','member',true),('${b}','${fam}','B','admin',true)`,
  );
  await command(a, "plan", {
    id: plan,
    description: "Contrato fictício",
    kind: "loan",
    first_due: "2026-09-30",
    count: 6,
    amount: 20000,
    last_paid: 1,
    last_paid_on: "2026-09-30",
    history_confirmed: false,
  });
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("datas contratuais por âncora preservam fim de mês e ano bissexto", () => {
  expect(loanDue("2028-01-31", 1, "months", 1)).toBe("2028-02-29");
  expect(loanDue("2028-01-31", 2, "months", 1)).toBe("2028-03-31");
  expect(loanDue("2026-11-30", 2, "days", 14)).toBe("2026-12-28");
  expect(() => loanDue("2026-02-30", 1, "months", 1)).toThrow();
});
it("metadados privados aceitam desconhecidos e não criam movimento nem calculam CET", async () => {
  const p = {
    id: plan,
    version: 1,
    institution: "Instituição fictícia",
    modality: "financing",
    interest_kind: "unknown",
    original_amount: null,
    cet_basis_points: null,
    signed_on: "2026-08-01",
    contract_notes: "Principal desconhecido",
    cadence_unit: "months",
    cadence_count: 1,
    reason: "Conferência do contrato",
  };
  const key = crypto.randomUUID();
  await command(a, "loan_details", p, key);
  await command(a, "loan_details", p, key);
  expect(
    (
      await asUser(
        a,
        "select institution,original_amount,cet_basis_points,version from public.plans",
      )
    ).rows[0],
  ).toMatchObject({
    institution: "Instituição fictícia",
    original_amount: null,
    cet_basis_points: null,
    version: 2,
  });
  expect((await asUser(b, "select * from public.plans")).rows).toHaveLength(0);
  await expect(
    command(b, "loan_details", { ...p, version: 2 }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(command(a, "loan_details", p)).rejects.toThrow(
    /Version conflict/,
  );
  expect(
    (await db.query("select count(*)::int as n from public.account_movements"))
      .rows[0],
  ).toEqual({ n: 0 });
  expect(
    (await db.query("select count(*)::int as n from public.entries")).rows[0],
  ).toEqual({ n: 0 });
});
it("calendário quinzenal altera apenas abertas futuras e mantém histórico pago/parcial/vencido", async () => {
  await db.exec(
    `update public.obligations set confirmed=5000 where plan_id='${plan}' and number=4`,
  );
  const p = {
    id: plan,
    version: 2,
    modality: "personal",
    interest_kind: "with",
    original_amount: 100000,
    cet_basis_points: 2550,
    cadence_unit: "days",
    cadence_count: 14,
    apply_calendar: true,
    anchor_number: 3,
    anchor_due: "2026-11-30",
    reason: "Periodicidade confirmada",
  };
  await command(a, "loan_details", p);
  const rows = (
    await asUser(
      a,
      `select number,due_on::text,confirmed from public.obligations where plan_id='${plan}' order by number`,
    )
  ).rows;
  expect(rows).toEqual([
    { number: 1, due_on: "2026-09-30", confirmed: 20000 },
    { number: 2, due_on: "2026-10-30", confirmed: 0 },
    { number: 3, due_on: "2026-11-30", confirmed: 0 },
    { number: 4, due_on: "2026-12-30", confirmed: 5000 },
    { number: 5, due_on: "2026-12-28", confirmed: 0 },
    { number: 6, due_on: "2027-01-11", confirmed: 0 },
  ]);
  expect(
    (
      await asUser(
        a,
        "select first_due::text,cet_basis_points from public.plans",
      )
    ).rows[0],
  ).toMatchObject({ first_due: "2026-09-30", cet_basis_points: 2550 });
  await expect(
    command(a, "loan_details", { ...p, version: 3, anchor_number: 4 }),
  ).rejects.toThrow(/Anchor/);
  await expect(
    command(a, "loan_details", { ...p, version: 3, anchor_number: 2 }),
  ).rejects.toThrow(/Anchor/);
  expect(
    (
      await db.query(
        "select count(*)::int as n from public.audit_logs where action='loan_details'",
      )
    ).rows[0],
  ).toEqual({ n: 2 });
});
it("demonstração aplica autorização e deixa principal/CET desconhecidos sem inferência", () => {
  const s = emptyState();
  s.plans = [
    {
      id: "p",
      owner_id: "a",
      description: "Dívida",
      first_due: "2026-09-30",
      count: 6,
      amount: 20000,
      last_paid: 0,
      last_paid_on: null,
      history_confirmed: false,
      payoff: null,
      kind: "loan",
    },
  ];
  const c = {
    type: "loan_details",
    payload: {
      id: "p",
      version: 1,
      modality: "other",
      interest_kind: "unknown",
      cadence_unit: "months",
      cadence_count: 1,
      reason: "Dados ainda não conferidos",
    },
  };
  const n = applyLoanDetails(s, c, { id: "a", family_id: "f", name: "A" })!;
  expect(n.plans[0]).toMatchObject({
    original_amount: null,
    cet_basis_points: null,
  });
  expect(n.entries).toHaveLength(0);
  expect(s.plans[0]).not.toHaveProperty("version");
  expect(() =>
    applyLoanDetails(s, c, { id: "b", family_id: "f", name: "B" }),
  ).toThrow(/autorizado/);
});
