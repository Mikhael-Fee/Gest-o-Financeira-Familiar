// Explicit LOCAL integration check. Refuses remote hosts; never prints identities or keys.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
const raw = await readFile(
  process.env.SUPABASE_STATUS_FILE || "/tmp/financas-supabase-status.env",
  "utf8",
);
const settings = Object.fromEntries(
  raw
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      let value = l.slice(i + 1);
      if (value.startsWith('"')) value = JSON.parse(value);
      return [l.slice(0, i), value];
    }),
);
const url = settings.API_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw Error("Teste permitido somente em Supabase local.");
const admin = createClient(url, settings.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const publicClient = () =>
  createClient(url, settings.ANON_KEY, { auth: { persistSession: false } });
let step = "bootstrap";
const check = (value) => {
  if (!value) throw Error(`Falha na etapa ${step}`);
};
const authCall = async (action, body = {}, session) => {
  const response = await fetch(`${url}/functions/v1/identity`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: settings.ANON_KEY,
      Origin: "http://localhost:5173",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  return { status: response.status, data: await response.json() };
};
try {
  await mkdir(".cache", { recursive: true });
  let fixture;
  try {
    fixture = JSON.parse(
      await readFile(".cache/local-api-fixture.json", "utf8"),
    );
  } catch {
    const username = `admin_${crypto.randomUUID().slice(0, 8)}`;
    const password = `LocalAa9_${crypto.randomUUID()}`;
    const email = `member-${crypto.randomUUID()}@financas.example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    check(!error && data.user);
    const { error: bootstrapError } = await admin.rpc("bootstrap_identity", {
      auth_id: data.user.id,
      login_name: username,
      tech_email: email,
      family_name: "Casa exclusivamente fictícia",
    });
    check(!bootstrapError);
    fixture = { username, password };
    await writeFile(".cache/local-api-fixture.json", JSON.stringify(fixture), {
      mode: 0o600,
    });
  }
  step = "login adaptado";
  const owner = await authCall("login", fixture);
  check(owner.status === 200 && owner.data.session);
  const a = publicClient();
  await a.auth.setSession(owner.data.session);
  step = "convite";
  const invitation = await authCall("create_invite", {}, owner.data.session);
  check(invitation.status === 200 && invitation.data.token);
  const username = `member_${crypto.randomUUID().slice(0, 8)}`,
    password = `LocalBb8_${crypto.randomUUID()}`;
  step = "cadastro convidado";
  const invited = await authCall("invite", {
    username,
    password,
    token: invitation.data.token,
  });
  check(invited.status === 200 && invited.data.session);
  const b = publicClient();
  await b.auth.setSession(invited.data.session);
  step = "reuso de convite";
  const replay = await authCall("invite", {
    username: `other_${crypto.randomUUID().slice(0, 8)}`,
    password,
    token: invitation.data.token,
  });
  check(replay.status === 400);
  step = "cadastro público bloqueado";
  const openSignup = await publicClient().auth.signUp({
    email: `forbidden-${crypto.randomUUID()}@financas.example.test`,
    password,
  });
  check(!!openSignup.error && !openSignup.data.user);
  step = "login genérico";
  const unknown = await authCall("login", {
    username: `missing_${crypto.randomUUID().slice(0, 8)}`,
    password,
  });
  check(unknown.status === 400 && !unknown.data.session);
  const userA = (await a.auth.getUser()).data.user.id,
    userB = (await b.auth.getUser()).data.user.id;
  const execute = async (client, type, payload, key = crypto.randomUUID()) => {
    const { error } = await client.rpc("execute_command", {
      command: { key, type, payload },
    });
    check(!error);
    return key;
  };
  step = "contas";
  const accountA = crypto.randomUUID(),
    accountB = crypto.randomUUID();
  await execute(a, "account", {
    id: accountA,
    name: "Conta fictícia A",
    kind: "bank",
    opening: 200000,
    cutoff: "2026-11-01",
  });
  await execute(b, "account", {
    id: accountB,
    name: "Conta fictícia B",
    kind: "bank",
    opening: 100000,
    cutoff: "2026-11-01",
  });
  step = "RLS pela API real";
  const hidden = await a.from("accounts").select("*").eq("id", accountB);
  check(!hidden.error && hidden.data.length === 0);
  const forbidden = await a
    .from("accounts")
    .update({ opening: 0 })
    .eq("id", accountB);
  check(!!forbidden.error);
  step = "cartão compartilhado";
  const card = crypto.randomUUID();
  await execute(a, "card", {
    id: card,
    name: "Itaú fictício",
    closing: 5,
    due: 15,
    authorized: [],
  });
  await execute(a, "permission", { id: card, member_id: userB, allowed: true });
  const purchaseB = crypto.randomUUID(),
    purchaseA = crypto.randomUUID();
  const common = {
    kind: "expense",
    occurred_on: "2026-11-04",
    category: "Outros",
    house: false,
    card_id: card,
    splits: [],
    installments: 1,
  };
  await execute(b, "entry", {
    ...common,
    id: purchaseB,
    description: "Consumo fictício B",
    amount: 65000,
    consumer_id: userB,
  });
  await execute(a, "entry", {
    ...common,
    id: purchaseA,
    description: "Consumo fictício A",
    amount: 35000,
    consumer_id: userA,
  });
  step = "privacidade de compras";
  const bEntries = await b.from("entries").select("*").eq("card_id", card);
  check(
    !bEntries.error &&
      bEntries.data.length === 1 &&
      bEntries.data[0].amount === 65000,
  );
  step = "Pix e confirmação independente";
  await execute(b, "send", {
    id: purchaseB,
    amount: 40000,
    sent_on: "2026-11-10",
    account_id: accountB,
  });
  const s = (
    await a.from("settlements").select("*").eq("id", purchaseB).single()
  ).data;
  await execute(a, "confirm", {
    id: purchaseB,
    version: s.version,
    date: "2026-11-12",
    account_id: accountA,
  });
  const o = (
    await a.from("obligations").select("*").eq("id", `${purchaseB}:1`).single()
  ).data;
  check(o.confirmed === 0);
  step = "correção de acerto";
  const transfer = (
    await a
      .from("settlement_transfers")
      .select("*")
      .eq("settlement_id", purchaseB)
      .not("confirmed_on", "is", null)
      .single()
  ).data;
  let current = (
    await a.from("settlements").select("*").eq("id", purchaseB).single()
  ).data;
  await execute(a, "reverse_settlement", {
    id: purchaseB,
    transfer_id: transfer.id,
    version: current.version,
    date: "2026-11-12",
    reason: "Confirmação fictícia corrigida para teste",
  });
  await execute(b, "send", {
    id: purchaseB,
    amount: 10000,
    sent_on: "2026-11-12",
    account_id: accountB,
  });
  current = (
    await a.from("settlements").select("*").eq("id", purchaseB).single()
  ).data;
  await execute(a, "reject", {
    id: purchaseB,
    version: current.version,
    date: "2026-11-12",
    reason: "Declaração fictícia recusada para teste",
  });
  step = "pagamento idempotente";
  const key = crypto.randomUUID(),
    payload = {
      obligation_id: o.id,
      version: o.version,
      amount: 20000,
      account_id: accountA,
      paid_on: "2026-11-12",
    };
  await Promise.all([
    execute(a, "pay", payload, key),
    execute(a, "pay", payload, key),
  ]);
  const payments = await a.from("payments").select("*").eq("key", key);
  assert.equal(payments.data.length, 1);
  step = "crédito exige contrato";
  const plan = crypto.randomUUID();
  await execute(b, "plan", {
    id: plan,
    description: "Contrato fictício vinculado",
    first_due: "2026-03-20",
    count: 10,
    amount: 20000,
    last_paid: 8,
    last_paid_on: "2026-10-20",
    history_confirmed: false,
    kind: "loan",
  });
  const receipt = {
    id: crypto.randomUUID(),
    description: "Crédito fictício recebido",
    kind: "loan_received",
    amount: 10000,
    occurred_on: "2026-11-12",
    category: "Crédito recebido",
    house: false,
    consumer_id: userB,
    splits: [{ account_id: accountB, amount: 10000 }],
  };
  const missingContract = await b.rpc("execute_command", {
    command: { key: crypto.randomUUID(), type: "entry", payload: receipt },
  });
  check(!!missingContract.error);
  await execute(b, "entry", { ...receipt, loan_id: plan });
  step = "confirmação futura bloqueada";
  const future = await b.rpc("execute_command", {
    command: {
      key: crypto.randomUUID(),
      type: "account",
      payload: {
        id: crypto.randomUUID(),
        name: "Abertura futura recusada",
        kind: "bank",
        opening: 100,
        cutoff: "2099-01-01",
      },
    },
  });
  check(!!future.error);
  step = "salário mensal privado e correção versionada";
  await execute(b, "income_month", {
    month: "2026-11",
    expected: 250000,
    version: 0,
    future: true,
    reference_version: 0,
  });
  const salaryId = crypto.randomUUID();
  await execute(b, "entry", {
    id: salaryId,
    description: "Salário exclusivamente fictício",
    kind: "income",
    income_type: "salary",
    amount: 120000,
    occurred_on: "2026-11-12",
    salary_month: "2026-10",
    category: "Salário",
    house: false,
    consumer_id: userB,
    splits: [{ account_id: accountB, amount: 120000 }],
  });
  const correction = {
    id: salaryId,
    amount: 123000,
    occurred_on: "2026-11-12",
    salary_month: "2026-10",
    account_id: accountB,
  };
  const missingVersion = await b.rpc("execute_command", {
    command: {
      key: crypto.randomUUID(),
      type: "income_edit",
      payload: correction,
    },
  });
  check(!!missingVersion.error);
  const correctionKey = crypto.randomUUID();
  await execute(b, "income_edit", { ...correction, version: 1 }, correctionKey);
  await execute(b, "income_edit", { ...correction, version: 1 }, correctionKey);
  const salary = await b
    .from("entries")
    .select("amount,salary_month,version")
    .eq("id", salaryId);
  assert.deepEqual(salary.data, [
    { amount: 123000, salary_month: "2026-10", version: 2 },
  ]);
  for (const table of ["income_months", "income_references"]) {
    const hiddenSalary = await a.from(table).select("*").eq("owner_id", userB);
    check(!hiddenSalary.error && hiddenSalary.data.length === 0);
  }
  step = "empréstimo com calendário parcial pela API";
  const partialPlan = crypto.randomUUID();
  await execute(b, "plan", {
    id: partialPlan,
    description: "Histórico fictício desconhecido",
    first_due: null,
    next_due: "2026-11-20",
    next_number: 9,
    count: 10,
    amount: 20000,
    last_paid: 0,
    last_paid_on: null,
    last_paid_known: false,
    history_confirmed: false,
    kind: "loan",
  });
  const partialItems = await b
    .from("obligations")
    .select("number,due_on,confirmed,unknown")
    .eq("plan_id", partialPlan)
    .order("number");
  check(!partialItems.error && partialItems.data.length === 10);
  check(
    partialItems.data
      .slice(0, 8)
      .every(
        (item) => item.due_on === null && item.unknown && item.confirmed === 0,
      ),
  );
  assert.equal(partialItems.data[8].due_on, "2026-11-20");
  assert.equal(partialItems.data[9].due_on, "2026-12-20");
  const inventedPayments = await b
    .from("payments")
    .select("id")
    .like("obligation_id", `${partialPlan}:%`);
  check(!inventedPayments.error && inventedPayments.data.length === 0);
  step = "snapshot";
  const snapshot = await b.rpc("load_finances");
  check(
    !snapshot.error &&
      snapshot.data.accounts.every((x) => x.owner_id === userB) &&
      snapshot.data.income_months.some(
        (x) => x.owner_id === userB && x.expected === 250000,
      ),
  );
  step = "recuperação";
  const reset = await authCall(
    "create_invite",
    { reset_id: userB },
    owner.data.session,
  );
  check(reset.status === 200);
  const newPassword = `NewCc7_${crypto.randomUUID()}`;
  const recovered = await authCall("reset", {
    username,
    password: newPassword,
    token: reset.data.token,
  });
  check(recovered.status === 200 && recovered.data.session);
  const oldLogin = await authCall("login", { username, password });
  check(oldLogin.status === 400);
  await a.auth.signOut();
  await b.auth.signOut();
  console.log(
    "Integração local aprovada: bootstrap, login, convite, reuso negado, RLS via HTTP, cartão, Pix, pagamento idempotente, salário mensal/correção, calendário parcial, snapshot e recuperação. Dados exclusivamente fictícios.",
  );
} catch {
  console.error(
    `Integração local interrompida: ${step}. Nenhuma credencial foi exibida.`,
  );
  process.exitCode = 1;
}
