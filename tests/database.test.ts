// @vitest-environment node
// Real PostgreSQL engine (WASM). Supabase's auth.uid/roles are reproduced locally.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  stranger = "00000000-0000-4000-8000-000000000003",
  family = "00000000-0000-4000-8000-000000000010",
  acc = "00000000-0000-4000-8000-000000000020",
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
async function command(
  user: string,
  type: string,
  payload: unknown,
  key = crypto.randomUUID(),
) {
  const c = JSON.stringify({ key, type, payload }).replaceAll("'", "''");
  return asUser(user, `select public.execute_command('${c}'::jsonb)`);
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
  ]) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  await db.exec(
    "create or replace function private.business_today() returns date language sql stable as $$select date '2026-12-31'$$",
  );
  await db.exec(
    `insert into auth.users values('${a}'),('${b}'),('${stranger}');insert into public.families values('${family}','Fictícia'),('00000000-0000-4000-8000-000000000011','Outra');insert into public.profiles values('${a}','${family}','Pessoa A','admin',true),('${b}','${family}','Pessoa B','member',true),('${stranger}','00000000-0000-4000-8000-000000000011','Estranho','member',true);insert into public.accounts values('${acc}','${b}','Conta privada B','bank',900000,'2026-11-01',now());insert into public.cards values('${card}','${a}','Itaú',5,15,ARRAY['${b}'::uuid]);`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("PostgreSQL, RLS, GRANTs e comandos ACID", () => {
  it("admin da Casa não lê conta privada de B", async () => {
    expect(
      (await asUser(a, "select * from public.accounts")).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(b, "select * from public.accounts")).rows,
    ).toHaveLength(1);
  });
  it("estranho não lê família nem perfis de A/B", async () =>
    expect(
      (
        await asUser(
          stranger,
          `select * from public.profiles where family_id='${family}'`,
        )
      ).rows,
    ).toHaveLength(0));
  it.each(["insert", "update", "delete"])(
    "GRANT nega %s direto",
    async (op) => {
      const sql =
        op === "insert"
          ? `insert into public.accounts(id,owner_id,name,kind,opening,cutoff) values(gen_random_uuid(),'${a}','x','bank',0,'2026-11-01')`
          : op === "update"
            ? `update public.accounts set opening=0 where id='${acc}'`
            : `delete from public.accounts where id='${acc}'`;
      await expect(asUser(a, sql)).rejects.toThrow(/permission denied/);
    },
  );
  it("comando nega conta privada alheia e splits inválidos sem gravar parcialmente", async () => {
    const e = {
      id: crypto.randomUUID(),
      description: "X",
      kind: "expense",
      amount: 40000,
      occurred_on: "2026-11-05",
      category: "Alimentação",
      house: false,
      consumer_id: a,
      card_id: null,
      splits: [{ account_id: acc, amount: 40000 }],
    };
    await expect(command(a, "entry", e)).rejects.toThrow();
    e.consumer_id = b;
    e.splits[0].amount = 20000;
    await expect(command(b, "entry", e)).rejects.toThrow(/Split sum/);
    expect((await db.query("select * from public.entries")).rows).toHaveLength(
      0,
    );
  });
  it("titular vê compras do usuário e autorizado não vê compras privadas do titular", async () => {
    await command(a, "entry", {
      id: crypto.randomUUID(),
      description: "Privada A",
      kind: "expense",
      amount: 35000,
      occurred_on: "2026-11-04",
      category: "Outros",
      house: false,
      consumer_id: a,
      card_id: card,
      splits: [],
    });
    await command(b, "entry", {
      id: crypto.randomUUID(),
      description: "Compra B",
      kind: "expense",
      amount: 65000,
      occurred_on: "2026-11-04",
      category: "Outros",
      house: false,
      consumer_id: b,
      card_id: card,
      splits: [],
    });
    expect((await asUser(a, "select * from public.entries")).rows).toHaveLength(
      2,
    );
    expect((await asUser(b, "select * from public.entries")).rows).toHaveLength(
      1,
    );
    expect(
      (await asUser(stranger, "select * from public.entries")).rows,
    ).toHaveLength(0);
  });
  it("obrigação da fatura não vaza total para usuário autorizado", async () => {
    expect(
      (await asUser(b, "select sum(amount)::int total from public.obligations"))
        .rows,
    ).toEqual([{ total: 65000 }]);
    const result = await asUser(
      a,
      "select sum(amount)::int total from public.obligations",
    );
    expect(result.rows[0]).toMatchObject({ total: 100000 });
  });
  it("empréstimo antigo não gera pagamentos fictícios e respeita mês de fevereiro", async () => {
    await command(b, "plan", {
      id: "00000000-0000-4000-8000-000000000040",
      description: "Antigo",
      first_due: "2026-01-31",
      count: 10,
      amount: 20000,
      last_paid: 8,
      last_paid_on: "2026-08-31",
      history_confirmed: false,
      kind: "loan",
    });
    const rows = (
      await asUser(
        b,
        "select * from public.obligations where plan_id is not null order by number",
      )
    ).rows;
    expect(
      (rows[1] as { due_on: Date }).due_on.toISOString().slice(0, 10),
    ).toBe("2026-02-28");
    expect(rows[1]).toMatchObject({ unknown: true });
    expect(rows[7]).toMatchObject({ confirmed: 20000 });
    expect(
      (await asUser(b, "select * from public.payments")).rows,
    ).toHaveLength(0);
  });
  it("pagamento idempotente, conflito de versão e excesso são protegidos no servidor", async () => {
    const payload = {
        obligation_id: "00000000-0000-4000-8000-000000000040:9",
        account_id: acc,
        amount: 10000,
        paid_on: "2026-11-12",
        version: 1,
      },
      key = crypto.randomUUID();
    await command(b, "pay", payload, key);
    await command(b, "pay", payload, key);
    expect(
      (await asUser(b, "select * from public.payments")).rows,
    ).toHaveLength(1);
    await expect(command(b, "pay", payload)).rejects.toThrow(/Conflict/);
    await expect(
      command(b, "pay", { ...payload, version: 2, amount: 20000 }),
    ).rejects.toThrow(/Overpayment/);
  });
  it("auditoria é append-only e privada", async () => {
    expect(
      (await asUser(stranger, "select * from public.audit_logs")).rows,
    ).toHaveLength(0);
    await expect(asUser(b, "delete from public.audit_logs")).rejects.toThrow(
      /permission denied/,
    );
    expect(
      (await asUser(b, "select * from public.audit_logs")).rows.length,
    ).toBeGreaterThan(0);
  });
  it("RPCs de identidade não podem ser chamados por navegador", async () => {
    await expect(
      asUser(a, "select public.identity_lookup('pessoa_b')"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(a, `select public.create_invite('${a}','hash',null)`),
    ).rejects.toThrow(/permission denied/);
  });
  it("convite expirado, consumido ou reivindicado é recusado", async () => {
    await db.exec(
      `insert into private.invites(token_hash,family_id,created_by,expires_at) values('expired','${family}','${a}',now()-interval '1 minute'),('valid','${family}','${a}',now()+interval '1 hour');`,
    );
    await expect(
      db.query("select public.claim_invite('expired',false)"),
    ).rejects.toThrow(/Invalid/);
    await db.query("select public.claim_invite('valid',false)");
    await expect(
      db.query("select public.claim_invite('valid',false)"),
    ).rejects.toThrow(/Invalid/);
  });
  it("membro não concede acesso ao cartão de outro", async () => {
    await expect(
      asUser(
        b,
        `select public.set_card_permission('${card}','${stranger}',true)`,
      ),
    ).rejects.toThrow(/Unauthorized/);
    await expect(
      asUser(
        a,
        `select public.set_card_permission('${card}','${stranger}',true)`,
      ),
    ).rejects.toThrow(/Unauthorized/);
  });
  it("6x200 cria seis linhas e um único consumo de 1200", async () => {
    const obj = crypto.randomUUID();
    await command(a, "entry", {
      id: obj,
      description: "Parcelada",
      kind: "expense",
      amount: 120000,
      occurred_on: "2026-11-06",
      category: "Outros",
      house: false,
      consumer_id: a,
      card_id: card,
      splits: [],
      installments: 6,
    });
    const result = await db.query(
      `select amount,due_on from public.obligations where id like '${obj}:%' order by due_on`,
    );
    expect(result.rows).toHaveLength(6);
    expect(result.rows.map((r) => (r as { amount: number }).amount)).toEqual(
      Array(6).fill(20000),
    );
    expect(
      (result.rows[0] as { due_on: Date }).due_on.toISOString().slice(0, 10),
    ).toBe("2026-12-15");
    expect(
      (await db.query(`select * from public.entries where id='${obj}'`)).rows,
    ).toHaveLength(1);
  });
  it("transporte de 800 com encargo 50 + compras 300 soma 1150, não 1950", async () => {
    const old = crypto.randomUUID(),
      other = crypto.randomUUID();
    await db.exec(
      `insert into public.obligations(id,owner_id,family_id,description,amount,due_on) values('${old}','${a}','${family}','Outubro',80000,'2026-10-15'),('${other}','${a}','${family}','Novembro',30000,'2026-11-15');`,
    );
    const newId = crypto.randomUUID();
    await command(a, "replace", {
      id: newId,
      sources: [old],
      description: "Saldo transportado confirmado",
      fee: 5000,
      count: 1,
      date: "2026-11-15",
    });
    const result = await db.query(
      `select sum(amount)::int total from public.obligations where replaced_by is null and (id in ('${old}','${other}') or id like '${newId}:%')`,
    );
    expect(result.rows[0]).toMatchObject({ total: 115000 });
    expect(
      (await db.query(`select * from public.entries where id='${newId}'`))
        .rows[0],
    ).toMatchObject({ amount: 5000, category: "Financeiro" });
  });
  it("transferência e conciliação são auditadas sem criar receita/consumo", async () => {
    const target = crypto.randomUUID();
    await command(b, "account", {
      id: target,
      name: "Outra conta",
      kind: "bank",
      opening: 0,
      cutoff: "2026-11-01",
    });
    await command(b, "transfer", {
      account_id: acc,
      destination_id: target,
      amount: 30000,
      date: "2026-11-12",
    });
    expect(
      (
        await db.query(
          `select private.account_balance('${target}')::int balance`,
        )
      ).rows[0],
    ).toMatchObject({ balance: 30000 });
    await command(b, "reconcile", {
      account_id: target,
      amount: 31000,
      date: "2026-11-12",
      reason: "Conferido no extrato fictício",
    });
    expect(
      (
        await db.query(
          `select private.account_balance('${target}')::int balance`,
        )
      ).rows[0],
    ).toMatchObject({ balance: 31000 });
    expect(
      (
        await db.query(
          `select * from public.entries where owner_id='${b}' and kind='income'`,
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("recorrência idempotente preserva 31 de janeiro e valor previsto exige confirmação", async () => {
    const obj = crypto.randomUUID();
    await command(b, "recurrence", {
      id: obj,
      description: "Energia variável",
      amount: 15000,
      date: "2026-01-31",
      house: true,
      variable: true,
    });
    await command(b, "generate", { id: obj });
    const rows = (
      await db.query(
        `select * from public.obligations where recurrence_id='${obj}' order by due_on`,
      )
    ).rows;
    expect(rows).toHaveLength(12);
    expect(
      (rows[1] as { due_on: Date }).due_on.toISOString().slice(0, 10),
    ).toBe("2026-02-28");
    await expect(
      command(b, "pay", {
        obligation_id: `${obj}:0`,
        account_id: acc,
        amount: 10000,
        paid_on: "2026-11-12",
        version: 1,
      }),
    ).rejects.toThrow(/Confirm estimated/);
  });
  it("Pix confirmado movimenta ambas as contas sem pagar fatura nem inflar renda", async () => {
    const target = crypto.randomUUID();
    await command(a, "account", {
      id: target,
      name: "Recebimento A",
      kind: "bank",
      opening: 0,
      cutoff: "2026-11-01",
    });
    const settlement = (
      await db.query(
        `select * from public.settlements where debtor_id='${b}' order by description limit 1`,
      )
    ).rows[0] as { id: string; version: number };
    await command(b, "send", {
      id: settlement.id,
      amount: 40000,
      sent_on: "2026-11-10",
      account_id: acc,
    });
    const x = (
      await db.query(
        `select * from public.settlements where id='${settlement.id}'`,
      )
    ).rows[0] as { version: number };
    expect(
      (
        await db.query(
          `select private.account_balance('${target}')::int balance`,
        )
      ).rows[0],
    ).toMatchObject({ balance: 0 });
    await command(a, "confirm", {
      id: settlement.id,
      version: x.version,
      date: "2026-11-12",
      account_id: target,
    });
    expect(
      (
        await db.query(
          `select private.account_balance('${target}')::int balance`,
        )
      ).rows[0],
    ).toMatchObject({ balance: 40000 });
    expect(
      (await db.query(`select * from public.payments where payer_id='${a}'`))
        .rows,
    ).toHaveLength(0);
  });
  it("limitação persistente recusa excesso de tentativas", async () => {
    for (let i = 0; i < 3; i++)
      expect(
        (await db.query("select public.identity_rate_limit('test',3) allowed"))
          .rows[0],
      ).toMatchObject({ allowed: true });
    expect(
      (await db.query("select public.identity_rate_limit('test',3) allowed"))
        .rows[0],
    ).toMatchObject({ allowed: false });
  });

  it("estorno restitui caixa e reabre obrigação, sem apagar o pagamento original", async () => {
    const pay = (
      await db.query(
        `select * from public.payments where payer_id='${b}' and reversed_on is null limit 1`,
      )
    ).rows[0] as { id: string; account_id: string; amount: number };
    const before = (
      await db.query(
        `select private.account_balance('${pay.account_id}')::int balance`,
      )
    ).rows[0] as { balance: number };
    await command(b, "reverse_payment", {
      id: pay.id,
      date: "2026-11-13",
      reason: "Correção de pagamento informado por engano",
    });
    expect(
      (
        await db.query(
          `select private.account_balance('${pay.account_id}')::int balance`,
        )
      ).rows[0],
    ).toMatchObject({ balance: before.balance + pay.amount });
    expect(
      (await db.query(`select * from public.payments where id='${pay.id}'`))
        .rows,
    ).toHaveLength(1);
    await expect(
      command(b, "reverse_payment", {
        id: pay.id,
        date: "2026-11-13",
        reason: "Segundo estorno indevido",
      }),
    ).rejects.toThrow(/Invalid reversal/);
  });
  it("compra pessoal/Casa compartilha apenas a parte familiar e preserva total", async () => {
    const account = crypto.randomUUID();
    await command(a, "account", {
      id: account,
      name: "Conta A",
      kind: "bank",
      opening: 100000,
      cutoff: "2026-11-01",
    });
    const group = crypto.randomUUID(),
      house = crypto.randomUUID(),
      personal = crypto.randomUUID();
    const common = {
      description: "Compra",
      kind: "expense",
      occurred_on: "2026-11-12",
      category: "Alimentação",
      consumer_id: a,
      card_id: null,
    };
    await command(a, "purchase_split", {
      id: group,
      amount: 40000,
      parts: [
        {
          ...common,
          id: house,
          amount: 30000,
          house: true,
          splits: [{ account_id: account, amount: 30000 }],
        },
        {
          ...common,
          id: personal,
          amount: 10000,
          house: false,
          splits: [{ account_id: account, amount: 10000 }],
        },
      ],
    });
    const visible = (
      await asUser(
        b,
        `select amount from public.entries where group_id='${group}'`,
      )
    ).rows;
    expect(visible).toEqual([{ amount: 30000 }]);
    expect(
      (
        await asUser(
          b,
          `select * from public.purchase_groups where id='${group}'`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `select sum(amount)::int amount from public.entries where group_id='${group}'`,
        )
      ).rows,
    ).toEqual([{ amount: 40000 }]);
  });
  it("cotação antecipada não é confundida com soma futura", async () => {
    const source = crypto.randomUUID();
    await db.exec(
      `insert into public.obligations(id,owner_id,family_id,description,amount,due_on) values('${source}','${a}','${family}','Saldo futuro',100000,'2026-12-20')`,
    );
    const newId = crypto.randomUUID();
    await command(a, "replace", {
      id: newId,
      sources: [source],
      description: "Cotação de quitação informada",
      fee: 0,
      count: 1,
      date: "2026-11-20",
      quote: 85000,
    });
    expect(
      (
        await db.query(
          `select amount from public.obligations where id='${newId}:1'`,
        )
      ).rows,
    ).toEqual([{ amount: 85000 }]);
  });
  it("helper de saldo privado não é executável por membro", async () =>
    await expect(
      asUser(a, `select private.account_balance('${acc}')`),
    ).rejects.toThrow(/permission denied/));

  it("snapshot RPC também preserva privacidade e não usa limite de 1000 linhas", async () => {
    const result = await asUser(a, "select public.load_finances() state");
    const state = (
      result.rows[0] as { state: { accounts: { owner_id: string }[] } }
    ).state;
    expect(state.accounts.every((x) => x.owner_id === a)).toBe(true);
    await expect(
      db.exec("set role anon;select public.load_finances()"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
  it("categorias privadas, subcategorias e versão são validadas no banco", async () => {
    const root = crypto.randomUUID(),
      child = crypto.randomUUID();
    await command(a, "category", {
      id: root,
      name: "Categoria de teste",
      parent_id: null,
      active: true,
      version: 0,
    });
    await command(a, "category", {
      id: child,
      name: "Subcategoria",
      parent_id: root,
      active: true,
      version: 0,
    });
    expect(
      (await asUser(b, `select * from public.categories where id='${root}'`))
        .rows,
    ).toHaveLength(0);
    await expect(
      command(b, "category", {
        id: child,
        name: "Alteração alheia",
        parent_id: null,
        active: false,
        version: 1,
      }),
    ).rejects.toThrow(/Category conflict/);
    await command(a, "category", {
      id: child,
      name: "Subcategoria",
      parent_id: root,
      active: false,
      version: 1,
    });
    await expect(
      command(a, "category", {
        id: child,
        name: "Versão antiga",
        parent_id: root,
        active: true,
        version: 1,
      }),
    ).rejects.toThrow(/Category conflict/);
  });
  it("corrigir confirmação e rejeitar envio preserva rastros e não reaplica envio rejeitado", async () => {
    const transfer = (
      await db.query(
        `select t.*,s.version from public.settlement_transfers t join public.settlements s on s.id=t.settlement_id where t.confirmed_on is not null and t.reversed_on is null limit 1`,
      )
    ).rows[0] as {
      id: string;
      settlement_id: string;
      destination_id: string;
      version: number;
    };
    await command(a, "reverse_settlement", {
      id: transfer.settlement_id,
      transfer_id: transfer.id,
      version: transfer.version,
      date: "2026-11-13",
      reason: "Recebimento marcado por engano",
    });
    await command(b, "send", {
      id: transfer.settlement_id,
      account_id: acc,
      amount: 10000,
      sent_on: "2026-11-13",
    });
    let x = (
      await db.query(
        `select * from public.settlements where id='${transfer.settlement_id}'`,
      )
    ).rows[0] as { version: number };
    await command(a, "reject", {
      id: transfer.settlement_id,
      version: x.version,
      date: "2026-11-13",
      reason: "Declaração divergente do extrato",
    });
    await command(b, "send", {
      id: transfer.settlement_id,
      account_id: acc,
      amount: 5000,
      sent_on: "2026-11-14",
    });
    x = (
      await db.query(
        `select * from public.settlements where id='${transfer.settlement_id}'`,
      )
    ).rows[0] as { version: number };
    await command(a, "confirm", {
      id: transfer.settlement_id,
      version: x.version,
      date: "2026-11-14",
      account_id: transfer.destination_id,
    });
    expect(
      (
        await db.query(
          `select confirmed,sent from public.settlements where id='${transfer.settlement_id}'`,
        )
      ).rows,
    ).toEqual([{ confirmed: 5000, sent: 0 }]);
    expect(
      (
        await db.query(
          `select private.account_balance('${transfer.destination_id}')::int balance`,
        )
      ).rows,
    ).toEqual([{ balance: 5000 }]);
  });
  it("conta da Casa aceita dois pagadores e reconhece consumo uma única vez", async () => {
    const rec = crypto.randomUUID();
    await command(b, "recurrence", {
      id: rec,
      description: "Casa com dois pagadores",
      amount: 3000,
      date: "2026-11-20",
      house: true,
      variable: false,
    });
    const accountA = (
      await db.query(
        `select id from public.accounts where owner_id='${a}' and opening=100000 limit 1`,
      )
    ).rows[0] as { id: string };
    await command(a, "pay", {
      obligation_id: rec + ":0",
      account_id: accountA.id,
      amount: 1000,
      paid_on: "2026-11-20",
      version: 1,
    });
    await command(b, "pay", {
      obligation_id: rec + ":0",
      account_id: acc,
      amount: 1000,
      paid_on: "2026-11-20",
      version: 2,
    });
    expect(
      (
        await asUser(
          a,
          `select sum(amount)::int amount from public.payments where obligation_id='${rec}:0'`,
        )
      ).rows,
    ).toEqual([{ amount: 2000 }]);
    expect(
      (
        await db.query(
          `select amount from public.entries where obligation_id='${rec}:0'`,
        )
      ).rows,
    ).toEqual([{ amount: 3000 }]);
  });

  it("crédito recebido exige passivo vinculado e não cria salário", async () => {
    const common = {
      id: crypto.randomUUID(),
      description: "Recebimento de crédito",
      kind: "loan_received",
      amount: 10000,
      occurred_on: "2026-11-20",
      category: "Crédito recebido",
      house: false,
      consumer_id: b,
      splits: [{ account_id: acc, amount: 10000 }],
    };
    await expect(command(b, "entry", common)).rejects.toThrow(/Loan receipt/);
    await command(b, "entry", {
      ...common,
      id: crypto.randomUUID(),
      loan_id: "00000000-0000-4000-8000-000000000040",
    });
    expect(
      (
        await db.query(
          `select kind from public.entries where description='Recebimento de crédito'`,
        )
      ).rows,
    ).toEqual([{ kind: "loan_received" }]);
  });
  it("datas futuras de confirmação são recusadas e previsão continua permitida", async () => {
    await expect(
      command(b, "account", {
        id: crypto.randomUUID(),
        name: "Futuro",
        kind: "bank",
        opening: 100,
        cutoff: "2027-01-01",
      }),
    ).rejects.toThrow(/future/);
    await expect(
      command(b, "entry", {
        id: crypto.randomUUID(),
        description: "Não recebido ainda",
        kind: "income",
        amount: 100,
        occurred_on: "2027-01-01",
        category: "Salário",
        house: false,
        consumer_id: b,
        splits: [{ account_id: acc, amount: 100 }],
      }),
    ).rejects.toThrow(/future/);
    await command(b, "recurrence", {
      id: crypto.randomUUID(),
      description: "Previsão permitida",
      amount: 1000,
      date: "2027-01-31",
      house: false,
      variable: true,
    });
  });
  it("corrigir conta parcialmente paga ajusta consumo vinculado com auditoria", async () => {
    const item = (
      await db.query(
        "select o.id,o.version from public.obligations o join public.recurrences r on r.id=o.recurrence_id where r.description='Casa com dois pagadores' order by o.due_on limit 1",
      )
    ).rows[0] as { id: string; version: number };
    await command(b, "adjust_due", {
      id: item.id,
      version: item.version,
      date: "2026-11-20",
      amount: 3500,
      reason: "Valor efetivo corrigido com registro",
    });
    expect(
      (
        await db.query(
          `select amount from public.entries where obligation_id='${item.id}'`,
        )
      ).rows,
    ).toEqual([{ amount: 3500 }]);
    expect(
      (
        await db.query(
          "select count(*)::int count from public.audit_logs where action='consumption_correction'",
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it("previsões mensais são privadas, versionadas e não movimentam caixa", async () => {
    await command(b, "salary", { base: 300000, payday: 5 });
    const balance = (
      await db.query(`select private.account_balance('${acc}')::bigint balance`)
    ).rows[0];
    const key = crypto.randomUUID();
    const payload = {
      month: "2026-11",
      expected: 280000,
      version: 0,
      future: true,
      reference_version: 0,
    };
    await command(b, "income_month", payload, key);
    await command(b, "income_month", payload, key);
    expect(
      (
        await db.query(
          `select private.account_balance('${acc}')::bigint balance`,
        )
      ).rows[0],
    ).toEqual(balance);
    expect(
      (await asUser(a, "select * from public.income_months")).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(a, "select * from public.income_references")).rows,
    ).toHaveLength(0);
    await expect(
      command(b, "income_month", { ...payload, expected: 290000 }),
    ).rejects.toThrow(/conflict/);
    expect(
      (
        await db.query(
          `select base from public.income_references where owner_id='${b}' and effective_month='0001-01'`,
        )
      ).rows,
    ).toEqual([{ base: 300000 }]);
  });
  it("correção de salário não duplica receita e admin não pode editar recebimento privado", async () => {
    const obj = crypto.randomUUID();
    await command(b, "entry", {
      id: obj,
      description: "Salário corrigível",
      kind: "income",
      income_type: "salary",
      amount: 100000,
      occurred_on: "2026-11-10",
      salary_month: "2026-10",
      category: "Salário",
      house: false,
      consumer_id: b,
      card_id: null,
      splits: [{ account_id: acc, amount: 100000 }],
    });
    const before = (
      await db.query(`select private.account_balance('${acc}')::bigint balance`)
    ).rows[0] as { balance: number };
    const payload = {
      id: obj,
      version: 1,
      amount: 110000,
      occurred_on: "2026-11-10",
      salary_month: "2026-10",
      account_id: acc,
    };
    await expect(command(a, "income_edit", payload)).rejects.toThrow(
      /conflict/,
    );
    await expect(
      command(b, "income_edit", { ...payload, version: undefined }),
    ).rejects.toThrow(/conflict/);
    await expect(
      command(b, "income_edit", { ...payload, version: null }),
    ).rejects.toThrow(/conflict/);
    const key = crypto.randomUUID();
    await command(b, "income_edit", payload, key);
    await command(b, "income_edit", payload, key);
    expect(
      (
        await db.query(
          `select amount,salary_month from public.entries where id='${obj}'`,
        )
      ).rows,
    ).toEqual([{ amount: 110000, salary_month: "2026-10" }]);
    expect(
      (
        await db.query(
          `select private.account_balance('${acc}')::bigint balance`,
        )
      ).rows,
    ).toEqual([{ balance: before.balance + 10000 }]);
  });
  it("empréstimo parcial preserva datas desconhecidas e somente a última parcela explicitamente paga", async () => {
    const obj = crypto.randomUUID();
    const payload = {
      id: obj,
      description: "Calendário incompleto",
      first_due: null,
      next_due: "2026-11-20",
      next_number: 9,
      count: 10,
      amount: 20000,
      last_paid: 8,
      last_paid_on: "2026-10-20",
      history_confirmed: false,
      last_paid_known: true,
      kind: "loan",
    };
    await command(b, "plan", payload);
    const rows = (
      await db.query(
        `select due_on,confirmed,unknown from public.obligations where plan_id='${obj}' order by number`,
      )
    ).rows as { due_on: Date | null; confirmed: number; unknown: boolean }[];
    expect(rows).toHaveLength(10);
    expect(rows.slice(0, 8).every((o) => o.due_on === null)).toBe(true);
    expect(rows.slice(0, 7).every((o) => o.unknown && o.confirmed === 0)).toBe(
      true,
    );
    expect(rows[7].confirmed).toBe(20000);
    expect(rows[8].due_on?.toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(
      (
        await db.query(
          `select * from public.payments where obligation_id like '${obj}:%'`,
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      command(b, "plan", {
        ...payload,
        id: crypto.randomUUID(),
        next_number: null,
      }),
    ).rejects.toThrow();
  });
  it("salário não pode ser lançado como recarga de VA/VR", async () => {
    const wallet = crypto.randomUUID();
    await command(b, "account", {
      id: wallet,
      name: "VA fictício",
      kind: "VA",
      opening: 0,
      cutoff: "2026-11-01",
    });
    await expect(
      command(b, "entry", {
        id: crypto.randomUUID(),
        description: "Salário indevido",
        kind: "income",
        amount: 10000,
        occurred_on: "2026-11-10",
        category: "Salário",
        house: false,
        consumer_id: b,
        splits: [{ account_id: wallet, amount: 10000 }],
      }),
    ).rejects.toThrow(/Cash income/);
  });
});
