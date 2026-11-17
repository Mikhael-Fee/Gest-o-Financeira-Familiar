// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  asUser,
  auditDb,
  dbCommand,
  entryPayload,
  ids,
} from "./helpers/audit-db";
import { contribution, type State } from "../src/domain/finance";
let db: PGlite;
beforeAll(async () => {
  db = await auditDb();
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("SQL recusa transferir responsabilidade para C sem autorização de C", async () => {
  await expect(
    dbCommand(db, ids.b, "entry", {
      ...entryPayload(crypto.randomUUID()),
      responsible_id: ids.c,
    }),
  ).rejects.toThrow();
});
it("SQL e domínio atribuem Pix confirmado a B, preservando apenas um consumo", async () => {
  const id = crypto.randomUUID();
  await dbCommand(db, ids.b, "entry", entryPayload(id));
  await dbCommand(db, ids.b, "send", {
    id,
    amount: 50000,
    account_id: ids.bankB,
    sent_on: "2026-11-04",
  });
  await dbCommand(db, ids.a, "confirm", {
    id,
    version: 2,
    account_id: ids.bankA,
    date: "2026-11-05",
  });
  await dbCommand(db, ids.a, "pay", {
    obligation_id: id + ":1",
    version: 1,
    account_id: ids.bankA,
    amount: 50000,
    paid_on: "2026-11-06",
  });
  const s = (
    (await asUser(db, ids.a, "select load_finances() as s")).rows[0] as {
      s: State;
    }
  ).s;
  expect(contribution(s, ids.b, "2026-11").actual).toBe(50000);
  expect(contribution(s, ids.a, "2026-11").actual).toBe(0);
  expect(s.entries.filter((e) => e.id === id)).toHaveLength(1);
});
it("limite global compartilhado pode esgotar antes de nova identidade legítima", async () => {
  await db.exec("set role service_role");
  try {
    const r = await db.query<{ blocked: number }>(
      `select count(*) filter(where not public.identity_rate_limit('audit:global',300))::int as blocked from generate_series(1,301)`,
    );
    expect(r.rows[0].blocked).toBe(1);
    const fresh = await db.query<{ allowed: boolean }>(
      `select public.identity_rate_limit('audit:legitimate',10) as allowed`,
    );
    expect(fresh.rows[0].allowed).toBe(true);
  } finally {
    await db.exec("reset role");
  }
});
it("C vê a contribuição familiar sem receber transferências, contas ou acertos privados A/B", async () => {
  const s = (
    (await asUser(db, ids.c, "select load_finances() as s")).rows[0] as {
      s: State;
    }
  ).s;
  expect(contribution(s, ids.b, "2026-11").actual).toBe(50000);
  expect(s.accounts.every((a) => a.owner_id === ids.c)).toBe(true);
  expect(s.settlements).toHaveLength(0);
  expect(s.settlement_transfers).toHaveLength(0);
  expect(JSON.stringify(s.house_funding)).not.toMatch(
    /source_id|destination_id|account_id|opening/,
  );
  const foreign = (
    (await asUser(db, ids.foreign, "select house_financing() as h"))
      .rows[0] as { h: unknown[] }
  ).h;
  expect(foreign).toHaveLength(0);
  await expect(
    asUser(db, ids.c, `select private.open_funding('x')`),
  ).rejects.toThrow(/permission denied/);
  await expect(
    asUser(db, ids.c, `select identity_invite_valid('x',false)`),
  ).rejects.toThrow(/permission denied/);
});
it("pagamento direto e estorno ajustam somente o crédito bancário; retries não duplicam", async () => {
  const id = crypto.randomUUID();
  await dbCommand(db, ids.b, "entry", entryPayload(id));
  const key = crypto.randomUUID();
  const p = {
    obligation_id: id + ":1",
    version: 1,
    account_id: ids.bankB,
    amount: 20000,
    paid_on: "2026-11-07",
  };
  await dbCommand(db, ids.b, "pay", p, key);
  await dbCommand(db, ids.b, "pay", p, key);
  expect(
    (
      await db.query(
        "select bank_credit,confirmed,sent from settlements where id=$1",
        [id],
      )
    ).rows[0],
  ).toMatchObject({ bank_credit: 20000, confirmed: 0, sent: 0 });
  await expect(
    dbCommand(db, ids.b, "send", {
      id,
      amount: 30001,
      account_id: ids.bankB,
      sent_on: "2026-11-08",
    }),
  ).rejects.toThrow();
  await dbCommand(db, ids.c, "pay", {
    ...p,
    version: 2,
    account_id: ids.bankC,
    amount: 30000,
  });
  expect(
    (await db.query("select bank_credit from settlements where id=$1", [id]))
      .rows[0],
  ).toMatchObject({ bank_credit: 50000 });
  await dbCommand(db, ids.b, "reverse_payment", {
    id: key,
    date: "2026-11-09",
    reason: "Devolução fictícia",
  });
  expect(
    (await db.query("select bank_credit from settlements where id=$1", [id]))
      .rows[0],
  ).toMatchObject({ bank_credit: 30000 });
  expect(
    (await db.query("select count(*)::int n from payments where key=$1", [key]))
      .rows[0],
  ).toMatchObject({ n: 1 });
});
it("transporte de compras compartilhadas preserva financiamento e soma de centavos", async () => {
  const e = crypto.randomUUID(),
    roll = crypto.randomUUID();
  await dbCommand(db, ids.b, "entry", {
    ...entryPayload(e),
    amount: 50003,
    installments: 2,
  });
  await dbCommand(db, ids.a, "replace", {
    id: roll,
    sources: [e + ":1", e + ":2"],
    fee: 1,
    count: 3,
    date: "2026-12-15",
    occurred_on: "2026-11-10",
    description: "Transporte fictício",
  });
  const rows = (
    await db.query<{
      funding_parts: { entry_id: string; amount: number }[];
      amount: number;
      house: boolean;
      card_id: string;
    }>(
      "select funding_parts,amount,house,card_id from obligations where id like $1 order by number",
      [roll + ":%"],
    )
  ).rows;
  expect(rows.reduce((n, o) => n + o.amount, 0)).toBe(50004);
  expect(rows.every((o) => o.house && o.card_id === ids.card)).toBe(true);
  for (let i = 0; i < rows.length; i++)
    await dbCommand(db, ids.a, "pay", {
      obligation_id: roll + ":" + (i + 1),
      version: 1,
      account_id: ids.bankA,
      amount: rows[i].amount,
      paid_on: "2026-11-11",
    });
  const funded = (
    await db.query<{ total: number }>(
      `select sum((f->>'amount')::bigint)::int total from payments p cross join lateral jsonb_array_elements(p.funding_parts) f where p.obligation_id like $1`,
      [roll + ":%"],
    )
  ).rows[0].total;
  expect(funded).toBe(50004);
  const s = (
    (await asUser(db, ids.c, "select load_finances() as s")).rows[0] as {
      s: State;
    }
  ).s;
  const events = s.house_funding!.filter(
    (f) => f.entry_id === e || f.entry_id === roll,
  );
  expect(
    events
      .filter((f) => f.kind === "advance")
      .reduce((n, f) => n + f.amount, 0),
  ).toBe(50003);
  expect(
    events
      .filter((f) => f.kind === "payment")
      .reduce((n, f) => n + f.amount, 0),
  ).toBe(1);
});
