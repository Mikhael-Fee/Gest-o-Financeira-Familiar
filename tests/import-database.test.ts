// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCsv, type StatementRow } from "../src/domain/import";
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002",
  family = "10000000-0000-4000-8000-000000000010",
  acc = "10000000-0000-4000-8000-000000000020",
  other = "10000000-0000-4000-8000-000000000021";
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
  for (const file of [
    "202611120001_foundation.sql",
    "202611120002_identity.sql",
    "202611120003_workflows.sql",
    "202611120004_corrections.sql",
    "202611120005_snapshot.sql",
    "202611120006_categories.sql",
    "202611120007_settlement_corrections.sql",
    "202611120008_loan_receipts.sql",
    "202611120009_effective_dates.sql",
    "202611120010_monthly_income.sql",
    "202611120011_partial_loan_calendar.sql",
    "202611160015_import_tags.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(
    `create or replace function private.business_today() returns date language sql stable as $$select date '2026-12-31'$$;insert into auth.users values('${a}'),('${b}');insert into public.families values('${family}','Casa fictícia');insert into public.profiles values('${a}','${family}','Admin','admin',true),('${b}','${family}','Membro','member',true);insert into public.accounts(id,owner_id,name,kind,opening,cutoff) values('${acc}','${b}','Conta B','bank',500000,'2026-01-01'),('${other}','${a}','Conta A','bank',500000,'2026-01-01');`,
  );
}, 30000);
afterAll(async () => await db.close());
const row = (id: string, amount: string, description = "Compra fictícia") =>
  parseCsv(
    `Data;Descrição;Valor;Documento\n05/11/2026;${description};${amount};${id}`,
  )[0];
describe("PostgreSQL real — importação e etiquetas", () => {
  it("importa e repete sob nova chave sem duplicar saldo ou consumo", async () => {
    const rows = [row("B1", "-50,25"), row("B2", "100,50", "Extra")];
    await command(b, "import_statement", { account_id: acc, rows });
    await command(b, "import_statement", {
      account_id: acc,
      rows: rows.map((r) => ({ ...r, id: crypto.randomUUID() })),
    });
    expect(
      (
        await db.query(
          `select count(*)::int n from public.entries where owner_id='${b}'`,
        )
      ).rows[0],
    ).toEqual({ n: 2 });
    expect(
      (await db.query(`select private.account_balance('${acc}') as balance`))
        .rows[0],
    ).toEqual({ balance: 505025 });
  });
  it("RLS nega registros, snapshot e etiquetas privadas ao admin; GRANT nega escrita direta", async () => {
    expect(
      (await asUser(a, "select * from public.import_records")).rows,
    ).toHaveLength(0);
    expect(
      (
        await asUser(
          a,
          "select public.load_finances()->'import_records' as imports",
        )
      ).rows[0],
    ).toEqual({ imports: [] });
    await expect(
      asUser(b, "delete from public.import_records"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      command(a, "import_statement", {
        account_id: acc,
        rows: [row("steal", "-10,00")],
      }),
    ).rejects.toThrow(/Unauthorized/);
  });
  it("não aceita FITID conflitante nem datas futuras; falha desfaz lote inteiro", async () => {
    const conflicting = row("B1", "-90,00");
    await expect(
      command(b, "import_statement", { account_id: acc, rows: [conflicting] }),
    ).rejects.toThrow(/Source identity conflict/);
    const valid = row("rollback-valid", "-5,00"),
      invalid = { ...row("rollback-invalid", "-6,00"), date: "2027-01-01" };
    await expect(
      command(b, "import_statement", {
        account_id: acc,
        rows: [valid, invalid],
      }),
    ).rejects.toThrow(/Invalid statement row/);
    expect(
      (
        await db.query(
          "select * from public.import_records where source_key='id:rollback-valid'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("preserva movimentos idênticos legítimos no mesmo CSV e deduplica reimportação", async () => {
    const rows = parseCsv(
      "Data;Descrição;Valor\n08/11/2026;Ônibus;-5,00\n08/11/2026;Ônibus;-5,00",
    );
    await command(b, "import_statement", { account_id: acc, rows });
    await command(b, "import_statement", {
      account_id: acc,
      rows: rows.map((r) => ({ ...r, id: crypto.randomUUID() })),
    });
    expect(
      (
        await db.query(
          "select count(*)::int n from public.entries where description='Ônibus'",
        )
      ).rows[0],
    ).toEqual({ n: 2 });
  });
  it("transferência de extrato não gera salário nem consumo", async () => {
    const transfer = {
      ...row("T1", "-20,00", "Pix enviado"),
      classification: "transfer",
    };
    await command(b, "import_statement", { account_id: acc, rows: [transfer] });
    expect(
      (await db.query(`select * from public.entries where id='${transfer.id}'`))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `select amount::int,kind from public.account_movements where id='${transfer.id}'`,
        )
      ).rows[0],
    ).toEqual({ amount: -2000, kind: "transfer" });
  });
  it("vincula lançamento existente sem criar outro movimento", async () => {
    const original = (
      await db.query<{ entry_id: string }>(
        "select entry_id from public.import_records where source_key='id:B1'",
      )
    ).rows[0].entry_id;
    const candidate = {
      ...row("B1-another", "-50,25"),
      classification: "match",
      match_id: original,
    };
    const count = (await db.query("select count(*)::int n from public.entries"))
      .rows[0];
    await command(b, "import_statement", {
      account_id: acc,
      rows: [candidate],
    });
    expect(
      (await db.query("select count(*)::int n from public.entries")).rows[0],
    ).toEqual(count);
  });
  it("corrige metadados com versão, preserva identidade original e registra auditoria", async () => {
    const record = (
      await db.query<{ id: string; entry_id: string }>(
        "select id,entry_id from public.import_records where source_key='id:B1'",
      )
    ).rows[0];
    await command(b, "import_correct", {
      id: record.id,
      version: 1,
      entry_version: 1,
      description: "Descrição corrigida",
      category: "Alimentação",
      reason: "Conferência do extrato",
    });
    expect(
      (
        await db.query(
          `select description,category,version from public.entries where id='${record.entry_id}'`,
        )
      ).rows[0],
    ).toEqual({
      description: "Descrição corrigida",
      category: "Alimentação",
      version: 2,
    });
    expect(
      (
        await db.query(
          `select source_key,version from public.import_records where id='${record.id}'`,
        )
      ).rows[0],
    ).toEqual({ source_key: "id:B1", version: 2 });
    await expect(
      command(b, "import_correct", {
        id: record.id,
        version: 1,
        entry_version: 1,
        description: "Velha",
        category: "Outros",
        reason: "Conferência",
      }),
    ).rejects.toThrow(/conflict/);
    expect(
      (
        await db.query(
          `select * from public.audit_logs where action='import_correct' and record_id='${record.id}'`,
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("corrigir prévia preserva chave da origem e reimportação original não duplica", async () => {
    const source = "Data;Descrição;Valor\n09/11/2026;Texto bancário;-11,00";
    const rows = parseCsv(source);
    rows[0].date = "2026-11-10";
    rows[0].amount = -1250;
    rows[0].description = "Texto corrigido";
    await command(b, "import_statement", { account_id: acc, rows });
    await command(b, "import_statement", {
      account_id: acc,
      rows: parseCsv(source),
    });
    expect(
      (
        await db.query(
          "select count(*)::int n from public.entries where description='Texto corrigido'",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    expect(
      (
        await db.query(
          "select amount::int from public.import_records where description='Texto bancário'",
        )
      ).rows[0],
    ).toEqual({ amount: -1100 });
  });
  it("renomeia etiqueta já usada, mantém lançamento e antes/depois; admin não pode alterar", async () => {
    const id = crypto.randomUUID();
    const entry = (
      await db.query<{ id: string }>(
        "select id from public.entries where description='Descrição corrigida'",
      )
    ).rows[0].id;
    await db.exec(
      `update public.entries set tags=ARRAY['Viagem'] where id='${entry}'`,
    );
    await command(b, "tag", { id, name: "Viagem", active: true, version: 0 });
    await command(b, "tag", { id, name: "Férias", active: true, version: 1 });
    expect(
      (await db.query(`select tags from public.entries where id='${entry}'`))
        .rows[0],
    ).toEqual({ tags: ["Férias"] });
    expect(
      (
        await db.query(
          `select before_data->'tags' as before,after_data->'tags' as after from public.audit_logs where action='tag_entry_rename' and record_id='${entry}'`,
        )
      ).rows[0],
    ).toEqual({ before: ["Viagem"], after: ["Férias"] });
    expect(
      (await asUser(a, "select * from public.tags_catalog")).rows,
    ).toHaveLength(0);
    await expect(
      command(a, "tag", { id, name: "Espiar", active: true, version: 2 }),
    ).rejects.toThrow(/Tag conflict/);
    await expect(
      asUser(b, "update public.tags_catalog set name='x'"),
    ).rejects.toThrow(/permission denied/);
  });
  it("pagamento importado baixa obrigação sem duplicar consumo original", async () => {
    const oid = crypto.randomUUID();
    await db.exec(
      `insert into public.obligations(id,owner_id,family_id,description,amount,due_on) values('${oid}','${b}','${family}','Fatura fictícia',10000,'2026-11-10')`,
    );
    const payment: StatementRow = {
      ...row("P1", "-30,00", "Pagamento fatura"),
      classification: "payment",
      obligation_id: oid,
      version: 1,
    };
    await command(b, "import_statement", { account_id: acc, rows: [payment] });
    expect(
      (
        await db.query(
          `select amount::int from public.payments where id='${payment.id}'`,
        )
      ).rows[0],
    ).toEqual({ amount: 3000 });
    expect(
      (await db.query(`select * from public.entries where id='${payment.id}'`))
        .rows,
    ).toHaveLength(0);
    await command(b, "import_statement", {
      account_id: acc,
      rows: [{ ...payment, id: crypto.randomUUID() }],
    });
    expect(
      (
        await db.query(
          `select count(*)::int n from public.payments where obligation_id='${oid}'`,
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
});
