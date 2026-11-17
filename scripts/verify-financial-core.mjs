// Explicit operator-only audit. Never run by setup/CI. All identities and money are fictional.
import assert from "node:assert/strict";
import { writeFile, readFile, realpath } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { build } from "esbuild";
export async function verifyFinancialCore({
  url,
  origin,
  publicKey,
  serviceKey,
  operatorQuery,
  fixturePath,
  allowLocal = false,
}) {
  const local =
    allowLocal &&
    url === "http://127.0.0.1:54321" &&
    origin === "http://localhost:5173";
  if (
    !local &&
    (url !== "https://ovoqhnoaigjzihhpdukn.supabase.co" ||
      origin !== "https://entre-nos-homologacao.netlify.app")
  )
    throw Error("Projeto fora da homologação autorizada");
  const root = await realpath(new URL("..", import.meta.url)),
    parent = await realpath(dirname(fixturePath));
  if (!relative(root, parent).startsWith(".."))
    throw Error("Fixture deve ficar fora do checkout");
  const domainPath = resolve(parent, "audit-domain.mjs");
  await build({
    stdin: {
      contents:
        'export {contribution,totals,balance} from "./src/domain/finance";export {availableMoney} from "./src/domain/availability";export {budgetSpent} from "./src/domain/personal";export {consumptionReport} from "./src/domain/reports";',
      resolveDir: root,
    },
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: domainPath,
    logLevel: "silent",
  });
  const domain = await import(
    pathToFileURL(domainPath).href + "?" + Date.now()
  );
  let f;
  try {
    f = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    f = {
      run: crypto.randomUUID().slice(0, 8),
      members: [],
      ids: {},
      commands: {},
      evidence: {},
    };
  }
  const save = () => writeFile(fixturePath, JSON.stringify(f), { mode: 0o600 });
  const id = (name) => (f.ids[name] ??= crypto.randomUUID());
  const q = (v) => "'" + String(v).replaceAll("'", "''") + "'";
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let i = 0; i < 5; i++)
    if (!f.members[i]) {
      const username = `audit_${f.run}_${i}`,
        password = `Audit-Aa7-${crypto.randomUUID()}`,
        email = `${username}@entre-nos-homologacao.netlify.app`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user)
        throw Error("Falha ao criar identidade fictícia");
      f.members[i] = { id: data.user.id, username, password, email };
      await save();
    }
  await operatorQuery(
    `insert into public.families(id,name) values(${q(id("family"))},'Auditoria financeira fictícia'),(${q(id("foreign"))},'Auditoria isolada fictícia') on conflict do nothing;`,
  );
  for (let i = 0; i < 5; i++) {
    const m = f.members[i];
    await operatorQuery(
      `insert into public.profiles(id,family_id,name,role) values(${q(m.id)},${q(id(i < 3 ? "family" : "foreign"))},${q(m.username)},${q(i === 0 || i === 3 ? "admin" : "member")}) on conflict do nothing;insert into private.username_identities(username,user_id,technical_email) values(${q(m.username)},${q(m.id)},${q(m.email)}) on conflict do nothing;`,
    );
  }
  const clients = [];
  for (const m of f.members) {
    const r = await fetch(url + "/functions/v1/identity", {
      method: "POST",
      headers: {
        apikey: publicKey,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({
        action: "login",
        username: m.username,
        password: m.password,
      }),
    });
    const body = await r.json();
    assert.equal(r.status, 200, "Login fictício recusado");
    assert.ok(body.session);
    const c = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const session = await c.auth.setSession(body.session);
    assert.equal(session.error, null);
    clients.push(c);
  }
  async function cmd(i, name, type, payload) {
    f.commands[name] ??= { key: crypto.randomUUID(), type, payload };
    await save();
    const { error } = await clients[i].rpc("execute_command", {
      command: f.commands[name],
    });
    if (error) throw Error(`${name}: ${error.message}`);
  }
  async function snap(i) {
    const { data, error } = await clients[i].rpc("load_finances");
    assert.equal(error, null);
    return data;
  }
  async function purchase(
    name,
    amount = 50000,
    house = true,
    who = 1,
    card = "card",
  ) {
    await cmd(who, name, "entry", {
      id: id(name),
      description: `Auditoria ${f.run} ${name}`,
      kind: "expense",
      amount,
      occurred_on: name === "mathreceivable" ? "2026-11-10" : "2026-11-03",
      category: "Alimentação",
      house,
      consumer_id: f.members[who].id,
      responsible_id: f.members[who].id,
      card_id: id(card),
      splits: [],
      installments: 1,
    });
  }
  async function sendConfirm(name, amount) {
    await cmd(1, name + "send", "send", {
      id: id(name),
      amount,
      account_id: id("bank1"),
      sent_on: "2026-11-04",
    });
    await cmd(0, name + "confirm", "confirm", {
      id: id(name),
      version: 2,
      account_id: id("bank0"),
      date: "2026-11-05",
    });
  }
  async function pay(name, amount, who = 0, version = 1) {
    await cmd(who, name + "pay" + who, "pay", {
      obligation_id: id(name) + ":1",
      version,
      account_id: id("bank" + who),
      amount,
      paid_on: "2026-11-06",
    });
  }
  const entryEvents = (s, name) =>
    s.house_funding.filter((e) => e.entry_id === id(name));
  const actual = (s, name, i) =>
    entryEvents(s, name)
      .filter((e) => e.member_id === f.members[i].id && e.kind !== "advance")
      .reduce((n, e) => n + e.amount, 0);
  try {
    for (let i = 0; i < 5; i++)
      await cmd(i, "bank" + i, "account", {
        id: id("bank" + i),
        name: "Conta exclusivamente fictícia " + i,
        kind: "bank",
        opening: i === 3 ? 200000 : 2000000,
        cutoff: "2026-01-01",
      });
    await cmd(0, "card", "card", {
      id: id("card"),
      name: "Cartão auditoria fictícia",
      closing: 5,
      due: 15,
      authorized: [],
    });
    await cmd(0, "permission", "permission", {
      id: id("card"),
      member_id: f.members[1].id,
      allowed: true,
    });
    await purchase("full");
    await cmd(1, "fullsend", "send", {
      id: id("full"),
      amount: 50000,
      account_id: id("bank1"),
      sent_on: "2026-11-04",
    });
    // Same request may succeed twice; its effect must occur exactly once.
    await cmd(1, "fullsend", "send", {});
    let s = await snap(1);
    assert.equal(s.settlements.find((x) => x.id === id("full")).sent, 50000);
    assert.equal(actual(s, "full", 1), 0);
    const confirmations = await Promise.all(
      [0, 1].map(() =>
        clients[0].rpc("execute_command", {
          command: {
            key: crypto.randomUUID(),
            type: "confirm",
            payload: {
              id: id("full"),
              version: 2,
              account_id: id("bank0"),
              date: "2026-11-05",
            },
          },
        }),
      ),
    );
    assert.equal(
      confirmations.filter((r) => !r.error).length,
      1,
      "Pix concorrente foi confirmado duas vezes",
    );
    const payPayload = {
      obligation_id: id("full") + ":1",
      version: 1,
      account_id: id("bank0"),
      amount: 50000,
      paid_on: "2026-11-06",
    };
    const payments = await Promise.all(
      [0, 1].map(() =>
        clients[0].rpc("execute_command", {
          command: {
            key: crypto.randomUUID(),
            type: "pay",
            payload: payPayload,
          },
        }),
      ),
    );
    assert.equal(
      payments.filter((r) => !r.error).length,
      1,
      "Pagamento concorrente duplicado",
    );
    s = await snap(0);
    assert.equal(actual(s, "full", 1), 50000);
    assert.equal(actual(s, "full", 0), 0);
    assert.equal(s.entries.filter((e) => e.id === id("full")).length, 1);
    f.evidence.full = {
      B: 50000,
      A: 0,
      consumption: 50000,
      concurrentConfirmations: 1,
      concurrentPayments: 1,
    };
    await purchase("partial");
    await sendConfirm("partial", 30000);
    await pay("partial", 50000);
    s = await snap(0);
    assert.equal(actual(s, "partial", 1), 30000);
    assert.equal(actual(s, "partial", 0), 0);
    assert.equal(
      domain.contribution(s, f.members[0].id, "2026-11").reimbursableAdvance,
      20000,
    );
    const b = await snap(1);
    assert.equal(
      b.settlements.find((x) => x.id === id("partial")).amount -
        b.settlements.find((x) => x.id === id("partial")).confirmed,
      20000,
    );
    f.evidence.partial = { B: 30000, A: 0, pending: 20000, advance: 20000 };
    await purchase("direct");
    await pay("direct", 20000, 1);
    await pay("direct", 30000, 2, 2);
    s = await snap(1);
    assert.equal(
      s.settlements.find((x) => x.id === id("direct")).bank_credit,
      50000,
    );
    assert.equal(actual(s, "direct", 1), 20000);
    assert.equal(actual(s, "direct", 2), 30000);
    f.evidence.direct = { B: 20000, C: 30000, pending: 0 };
    await purchase("personal", 50000, false);
    await sendConfirm("personal", 50000);
    await pay("personal", 50000);
    s = await snap(0);
    assert.equal(entryEvents(s, "personal").length, 0);
    await purchase("credit");
    await cmd(1, "advance", "send_advance", {
      id: id("advance"),
      recipient_id: f.members[0].id,
      amount: 60000,
      account_id: id("bank1"),
      date: "2026-11-04",
      description: "Crédito fictício excedente",
    });
    await cmd(0, "advanceconfirm", "confirm_advance", {
      id: id("advance"),
      version: 1,
      account_id: id("bank0"),
      date: "2026-11-05",
    });
    await cmd(1, "allocate", "allocate_advance", {
      id: id("advance"),
      version: 2,
      settlement_id: id("credit"),
      settlement_version: 1,
      amount: 50000,
      date: "2026-11-06",
    });
    s = await snap(1);
    assert.equal(actual(s, "credit", 1), 50000);
    assert.equal(
      s.family_advances.find((a) => a.id === id("advance")).amount -
        s.advance_allocations.find((a) => a.settlement_id === id("credit"))
          .amount,
      10000,
    );
    f.evidence.excess = {
      provided: 60000,
      allocatedContribution: 50000,
      unusedCredit: 10000,
    };
    await purchase("old", 80000);
    await purchase("new", 30000);
    await cmd(0, "roll", "replace", {
      id: id("roll"),
      sources: [id("old") + ":1", id("new") + ":1"],
      fee: 5000,
      count: 1,
      date: "2026-12-15",
      occurred_on: "2026-11-07",
      description: "Transporte fictício auditado",
    });
    await sendConfirm("old", 80000);
    await sendConfirm("new", 30000);
    await pay("roll", 115000);
    s = await snap(0);
    assert.equal(
      s.obligations.find((o) => o.id === id("roll") + ":1").amount,
      115000,
    );
    assert.equal(actual(s, "old", 1) + actual(s, "new", 1), 110000);
    assert.equal(actual(s, "roll", 0), 5000);
    f.evidence.rollover = {
      dueBeforePayment: 115000,
      principal: 110000,
      fee: 5000,
      activeAfterPayment: 0,
    };
    const t = s.settlement_transfers.find(
        (t) => t.settlement_id === id("full"),
      ),
      x = s.settlements.find((x) => x.id === id("full"));
    await cmd(0, "reversePix", "reverse_settlement", {
      id: x.id,
      version: x.version,
      transfer_id: t.id,
      date: "2026-11-17",
      reason: "Estorno fictício auditado",
    });
    s = await snap(0);
    assert.equal(actual(s, "full", 1), 0);
    assert.equal(
      entryEvents(s, "full").filter((e) => e.kind === "reimbursement").length,
      2,
    );
    const p = s.payments.find((p) => p.obligation_id === id("partial") + ":1");
    await cmd(0, "reversePayment", "reverse_payment", {
      id: p.id,
      date: "2026-11-17",
      reason: "Estorno fictício auditado",
    });
    s = await snap(0);
    assert.ok(s.payments.find((y) => y.id === p.id).reversed_on);
    assert.equal(actual(s, "partial", 1), 30000);
    f.evidence.reversals = {
      originalRowsPreserved: true,
      newConsumption: false,
    };
    // Isolated family D/E: exact availability equation, unrelated to the other audit scenarios.
    await cmd(3, "mathloan", "plan", {
      id: id("mathloan"),
      description: "Obrigação fictícia R$800",
      first_due: "2026-11-20",
      count: 1,
      amount: 80000,
      last_paid: 0,
      last_paid_on: null,
      history_confirmed: false,
      kind: "loan",
    });
    await cmd(3, "mathreserve", "savings_goal", {
      id: id("mathreserve"),
      version: 0,
      name: "Reserva fictícia",
      kind: "emergency",
      target: 100000,
      initial: 30000,
      account_id: id("bank3"),
      created_on: "2026-01-01",
      active: true,
    });
    await cmd(4, "cardE", "card", {
      id: id("cardE"),
      name: "E fictício",
      closing: 5,
      due: 15,
      authorized: [],
    });
    await cmd(4, "permE", "permission", {
      id: id("cardE"),
      member_id: f.members[3].id,
      allowed: true,
    });
    await purchase("mathdebt", 20000, false, 3, "cardE");
    await cmd(3, "cardD", "card", {
      id: id("cardD"),
      name: "D fictício",
      closing: 5,
      due: 15,
      authorized: [],
    });
    await cmd(3, "permD", "permission", {
      id: id("cardD"),
      member_id: f.members[4].id,
      allowed: true,
    });
    await purchase("mathreceivable", 50000, false, 4, "cardD");
    s = await snap(3);
    const available = domain.availableMoney(s, f.members[3].id, "2026-11-30");
    assert.equal(available.free, 70000);
    assert.equal(available.receivables, 50000);
    assert.equal(available.benefits, 0);
    f.evidence.available = {
      bank: 200000,
      obligations: 80000,
      savings: 30000,
      pending: 20000,
      receivableExcluded: 50000,
      free: 70000,
    };
    await cmd(1, "va", "account", {
      id: id("va"),
      name: "VA fictício",
      kind: "VA",
      opening: 50000,
      cutoff: "2026-01-01",
    });
    for (const [name, amount, house, account] of [
      ["strict", 15000, false, "bank1"],
      ["houseVA", 40000, true, "va"],
    ])
      await cmd(1, name, "entry", {
        id: id(name),
        description: "Auditoria " + name,
        kind: "expense",
        amount,
        occurred_on: "2026-11-12",
        category: "Alimentação",
        house,
        consumer_id: f.members[1].id,
        responsible_id: f.members[1].id,
        card_id: null,
        splits: [{ account_id: id(account), amount }],
      });
    s = await snap(1);
    const focused = {
      ...s,
      entries: s.entries.filter((e) =>
        [id("strict"), id("houseVA")].includes(e.id),
      ),
    };
    assert.equal(
      domain.budgetSpent(focused, f.members[1].id, "2026-11", "Alimentação"),
      15000,
    );
    assert.equal(
      domain.consumptionReport(focused, f.members[1].id, "personal", "2026-11")
        .total,
      55000,
    );
    assert.equal(actual(s, "houseVA", 1), 40000);
    f.evidence.budget = {
      strict: 15000,
      house: 40000,
      total: 55000,
      contribution: 40000,
    };
    await cmd(1, "privateLoan", "plan", {
      id: id("privateLoan"),
      description: "Contrato privado fictício",
      first_due: "2026-11-20",
      count: 2,
      amount: 12000,
      last_paid: 0,
      last_paid_on: null,
      history_confirmed: false,
      kind: "loan",
    });
    const unauthorizedLoan = await clients[0].rpc("execute_command", {
      command: {
        key: crypto.randomUUID(),
        type: "loan_details",
        payload: {
          id: id("privateLoan"),
          version: 1,
          reason: "Tentativa não autorizada",
        },
      },
    });
    assert.ok(unauthorizedLoan.error);
    const aPrivate = await clients[0]
      .from("accounts")
      .select("id,opening")
      .eq("id", id("bank1"));
    assert.equal(aPrivate.data.length, 0);
    await purchase("privateA", 5011, false, 0);
    const authorizedSnapshot = await snap(1);
    assert.equal(
      authorizedSnapshot.entries.some((e) => e.id === id("privateA")),
      false,
    );
    const shared = await snap(2),
      foreign = await snap(3);
    assert.ok(shared.accounts.every((a) => a.owner_id === f.members[2].id));
    assert.equal(shared.settlements.length, 0);
    assert.equal(shared.settlement_transfers.length, 0);
    assert.equal(actual(shared, "partial", 1), 30000);
    assert.ok(foreign.entries.every((e) => e.family_id === id("foreign")));
    assert.equal(
      JSON.stringify(shared.house_funding).includes("account_id"),
      false,
    );
    const forced = await clients[1].rpc("execute_command", {
      command: {
        key: crypto.randomUUID(),
        type: "entry",
        payload: {
          id: crypto.randomUUID(),
          description: "Dívida não autorizada",
          kind: "expense",
          amount: 1,
          occurred_on: "2026-11-17",
          category: "Outros",
          house: true,
          consumer_id: f.members[1].id,
          responsible_id: f.members[2].id,
          card_id: id("card"),
          splits: [],
        },
      },
    });
    assert.ok(forced.error);
    const direct = await clients[0]
      .from("accounts")
      .update({ opening: 0 })
      .eq("id", id("bank1"));
    assert.ok(direct.error);
    const lower = await clients[0].rpc("execute_before_financial_attribution", {
      command: {},
    });
    assert.ok(lower.error);
    f.evidence.security = {
      privateAccountsDenied: true,
      privateLoansDenied: true,
      authorizedCardNotGeneralPrivateAccess: true,
      forcedResponsibilityDenied: true,
      directWriteDenied: true,
      lowerWriterDenied: true,
      otherFamilyDenied: true,
      sharedProjectionWithoutPrivateTransfers: true,
    };
    await save();
    return f.evidence;
  } finally {
    for (const c of clients) c.auth.stopAutoRefresh();
  }
}
