import { createClient } from "@supabase/supabase-js";
import {
  balance,
  cents,
  date,
  emptyState,
  remaining,
  schedule,
  statementDate,
  addMonths,
  today,
  installmentAmounts,
  validateEntry,
  type Account,
  type Card,
  type Entry,
  type Plan,
  type State,
} from "../domain/finance";
export const supabase =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        },
      )
    : null;
export type Command = {
  key: string;
  type:
    | "account"
    | "card"
    | "entry"
    | "plan"
    | "pay"
    | "goal"
    | "send"
    | "confirm"
    | "void"
    | "transfer"
    | "reconcile"
    | "recurrence"
    | "generate"
    | "replace"
    | "adjust_due"
    | "permission"
    | "salary"
    | "purchase_split"
    | "reverse_payment"
    | "history"
    | "category"
    | "reject"
    | "reverse_settlement"
    | "income_month"
    | "income_edit";
  payload: Record<string, unknown>;
};
export type Identity = { id: string; family_id: string; name: string };
export const demoIdentity: Identity = {
  id: "a",
  family_id: "demo",
  name: "Pessoa A",
};
export const id = () => crypto.randomUUID();
export function apply(s: State, c: Command, user: Identity): State {
  const n = structuredClone(s),
    p = c.payload;
  const actualDate =
    c.type === "entry"
      ? p.occurred_on
      : c.type === "account"
        ? p.cutoff
        : c.type === "plan"
          ? p.last_paid_on
          : c.type === "pay"
            ? p.paid_on
            : c.type === "send"
              ? p.sent_on
              : [
                    "transfer",
                    "reconcile",
                    "confirm",
                    "history",
                    "reverse_payment",
                    "reverse_settlement",
                    "reject",
                  ].includes(c.type)
                ? p.date
                : null;
  if (actualDate && date.parse(actualDate) > today())
    throw Error("Data efetiva no futuro. Use Planejamento para previsões.");

  if (c.type === "purchase_split") {
    const parts = p.parts as Entry[];
    if (
      parts.length < 2 ||
      parts.reduce((n, x) => n + x.amount, 0) !== p.amount
    )
      throw Error("Divisão inconsistente.");
    let updated = n;
    for (const part of parts)
      updated = apply(
        updated,
        { key: part.id, type: "entry", payload: part },
        user,
      );
    return updated;
  }
  if (c.type === "category") {
    const old = n.categories.find((x) => x.id === p.id);
    if (old) {
      if (old.owner_id !== user.id || old.version !== p.version)
        throw Error("Categoria alterada. Atualize.");
      Object.assign(old, {
        name: String(p.name),
        parent_id: p.parent_id || null,
        active: !!p.active,
        version: old.version + 1,
      });
    } else {
      if (n.categories.some((x) => x.owner_id === user.id && x.name === p.name))
        throw Error("Categoria já existe.");
      n.categories.push({
        id: String(p.id),
        owner_id: user.id,
        name: String(p.name),
        parent_id: p.parent_id ? String(p.parent_id) : null,
        active: !!p.active,
        version: 1,
      });
    }
  }
  if (c.type === "income_month") {
    const m = String(p.month);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw Error("Mês inválido.");
    const old = n.income_months.find(
      (x) => x.owner_id === user.id && x.month === m,
    );
    if ((old?.version ?? 0) !== p.version)
      throw Error("Previsão alterada. Atualize os dados.");
    const expected = cents.parse(p.expected);
    if (old) {
      old.expected = expected;
      old.version++;
    } else
      n.income_months.push({
        owner_id: user.id,
        month: m,
        expected,
        version: 1,
      });
    if (p.future) {
      if (!n.income_references.some((r) => r.owner_id === user.id))
        n.income_references.push({
          owner_id: user.id,
          effective_month: "0001-01",
          base:
            n.income_settings.find((x) => x.owner_id === user.id)?.base ?? 0,
          version: 1,
        });
      const ref = n.income_references.find(
        (r) => r.owner_id === user.id && r.effective_month === m,
      );
      if ((ref?.version ?? 0) !== p.reference_version)
        throw Error("Referência alterada.");
      if (ref) {
        ref.base = expected;
        ref.version++;
      } else
        n.income_references.push({
          owner_id: user.id,
          effective_month: m,
          base: expected,
          version: 1,
        });
    }
  }
  if (c.type === "income_edit") {
    const e = n.entries.find(
      (e) =>
        e.id === p.id &&
        e.owner_id === user.id &&
        e.kind === "income" &&
        !e.voided,
    );
    const a = n.accounts.find(
      (a) =>
        a.id === p.account_id &&
        a.owner_id === user.id &&
        ["bank", "cash"].includes(a.kind),
    );
    if (!e || !a || e.version !== p.version || e.splits.length !== 1)
      throw Error("Recebimento alterado ou não autorizado.");
    const amount = cents.positive().parse(p.amount);
    const occurred = date.parse(p.occurred_on);
    if (occurred > today()) throw Error("Data futura.");
    e.amount = amount;
    e.occurred_on = occurred;
    e.salary_month = String(p.salary_month);
    e.splits = [{ account_id: a.id, amount }];
    e.version++;
  }
  if (c.type === "salary") {
    cents.parse(p.base);
    n.income_settings = n.income_settings.filter((x) => x.owner_id !== user.id);
    n.income_settings.push({
      owner_id: user.id,
      base: Number(p.base),
      payday: Number(p.payday),
    });
  }
  if (c.type === "permission") {
    const card = n.cards.find((c) => c.id === p.id && c.owner_id === user.id);
    if (
      !card ||
      !n.profiles.some(
        (m) => m.id === p.member_id && m.family_id === user.family_id,
      )
    )
      throw Error("Permissão não autorizada.");
    card.authorized = card.authorized.filter((m) => m !== p.member_id);
    if (p.allowed) card.authorized.push(String(p.member_id));
  }
  if (c.type === "account") {
    const a = p as Account;
    cents.parse(a.opening);
    date.parse(a.cutoff);
    n.accounts.push({ ...a, owner_id: user.id });
  }
  if (c.type === "card") {
    n.cards.push({ ...(p as Card), owner_id: user.id });
  }
  if (c.type === "entry") {
    const e = {
      ...p,
      owner_id: user.id,
      family_id: user.family_id,
      version: 1,
      voided: false,
    } as Entry;
    if (e.occurred_on > today())
      throw Error("Data efetiva no futuro. Use Planejamento.");
    validateEntry(e, n.accounts);
    if (
      e.kind === "loan_received" &&
      !n.plans.some((p) => p.id === e.loan_id && p.owner_id === user.id)
    )
      throw Error("Contrato de empréstimo não autorizado.");
    if (
      e.consumer_id !== user.id &&
      !n.cards.some(
        (c) =>
          c.id === e.card_id &&
          c.owner_id === user.id &&
          c.authorized.includes(e.consumer_id),
      )
    )
      throw Error("Consumidor não autorizado.");
    if (
      e.card_id &&
      !n.cards.some(
        (x) =>
          x.id === e.card_id &&
          (x.owner_id === user.id || x.authorized.includes(user.id)),
      )
    )
      throw Error("Cartão não autorizado.");
    if (e.kind === "income")
      e.salary_month = String(p.salary_month ?? e.occurred_on.slice(0, 7));
    n.entries.push(e);
    if (e.card_id) {
      const card = n.cards.find((c) => c.id === e.card_id)!;
      const first = statementDate(e.occurred_on, card.closing, card.due);
      const parts = installmentAmounts(e.amount, e.installments ?? 1);
      parts.forEach((amount, i) => {
        const key = `${e.id}:${i + 1}`;
        n.obligations.push({
          id: key,
          owner_id: card.owner_id,
          family_id: user.family_id,
          description: `${e.description} · ${i + 1}/${parts.length}`,
          amount,
          due_on: addMonths(first, i),
          house: e.house,
          confirmed: 0,
          unknown: false,
          plan_id: null,
          number: i + 1,
          card_id: card.id,
          replaced_by: null,
          version: 1,
        });
      });
      if ((e.responsible_id ?? e.consumer_id) !== card.owner_id)
        n.settlements.push({
          id: e.id,
          debtor_id: e.responsible_id ?? e.consumer_id,
          creditor_id: card.owner_id,
          description: e.description,
          amount: e.amount,
          sent: 0,
          confirmed: 0,
          sent_on: null,
          version: 1,
        });
    }
  }
  if (c.type === "plan") {
    const plan = { ...p, owner_id: user.id } as Plan;
    n.obligations.push(...schedule(plan, user.family_id));
    n.plans.push(plan);
  }
  if (c.type === "pay") {
    const o = n.obligations.find((o) => o.id === p.obligation_id);
    const a = n.accounts.find(
      (a) => a.id === p.account_id && a.owner_id === user.id,
    );
    if (!o || (o.owner_id !== user.id && !o.house) || !a)
      throw Error("Pagamento não autorizado.");
    if (o.unknown && o.recurrence_id)
      throw Error("Confirme o valor previsto antes de pagar.");
    if (o.version !== p.version)
      throw Error("Registro alterado. Atualize e tente novamente.");
    const amount = cents.positive().parse(p.amount);
    date.parse(p.paid_on);
    if (amount > remaining(o, n.payments))
      throw Error("Pagamento maior que o saldo em aberto.");
    if (["VA", "VR"].includes(a.kind))
      throw Error("Use conta bancária para pagar obrigações.");
    if (balance(a, n) < amount)
      throw Error("Saldo insuficiente no registro. Confira a conta.");
    n.payments.push({
      id: c.key,
      obligation_id: o.id,
      account_id: a.id,
      amount,
      paid_on: String(p.paid_on),
      payer_id: user.id,
      key: c.key,
    });
    o.version++;
    o.unknown = false;
    if (o.recurrence_id && !n.entries.some((e) => e.id === o.id))
      n.entries.push({
        id: o.id,
        owner_id: o.owner_id,
        family_id: o.family_id,
        description: o.description,
        kind: "expense",
        amount: o.amount,
        occurred_on: o.due_on ?? String(p.paid_on),
        category: "Contas da Casa",
        house: o.house,
        consumer_id: o.owner_id,
        responsible_id: null,
        card_id: null,
        splits: [],
        version: 1,
        voided: false,
      });
  }
  if (c.type === "reject" || c.type === "reverse_settlement") {
    const x = n.settlements.find(
      (x) => x.id === p.id && x.creditor_id === user.id,
    );
    if (!x || x.version !== p.version || String(p.reason ?? "").length < 5)
      throw Error("Correção não autorizada.");
    if (c.type === "reject") {
      n.settlement_transfers
        .filter(
          (t) => t.settlement_id === x.id && !t.confirmed_on && !t.rejected_on,
        )
        .forEach((t) => (t.rejected_on = String(p.date)));
      x.sent = 0;
    } else {
      const t = n.settlement_transfers.find(
        (t) =>
          t.id === p.transfer_id &&
          t.settlement_id === x.id &&
          t.confirmed_on &&
          !t.reversed_on,
      );
      if (!t) throw Error("Transferência inválida.");
      n.account_movements.push(
        {
          id: id(),
          owner_id: t.sender_id,
          account_id: t.source_id,
          amount: t.amount,
          occurred_on: String(p.date),
          kind: "reversal",
          reference_id: c.key,
          reason: String(p.reason),
        },
        {
          id: id(),
          owner_id: user.id,
          account_id: t.destination_id!,
          amount: -t.amount,
          occurred_on: String(p.date),
          kind: "reversal",
          reference_id: c.key,
          reason: String(p.reason),
        },
      );
      t.reversed_on = String(p.date);
      x.confirmed -= t.amount;
    }
    x.version++;
  }
  if (c.type === "reverse_payment") {
    const payment = n.payments.find(
      (x) => x.id === p.id && x.payer_id === user.id,
    );
    const o = n.obligations.find((o) => o.id === payment?.obligation_id);
    if (
      !payment ||
      payment.reversed_on ||
      String(p.date) < payment.paid_on ||
      o?.replaced_by ||
      String(p.reason ?? "").trim().length < 5
    )
      throw Error("Estorno inválido.");
    payment.reversed_on = date.parse(p.date);
    if (o) o.version++;
    n.account_movements.push({
      id: id(),
      owner_id: user.id,
      account_id: payment.account_id,
      amount: payment.amount,
      occurred_on: String(p.date),
      kind: "reversal",
      reference_id: c.key,
      reason: String(p.reason),
    });
  }
  if (c.type === "history") {
    const o = n.obligations.find(
      (o) => o.id === p.id && o.owner_id === user.id,
    );
    const a = n.accounts.find(
      (a) => a.id === p.account_id && a.owner_id === user.id,
    );
    if (
      !o ||
      !a ||
      o.version !== p.version ||
      String(p.date) >= a.cutoff ||
      String(p.reason ?? "").length < 5
    )
      throw Error(
        "Use pagamento efetivo para datas posteriores ao início do controle.",
      );
    const value = cents.parse(p.amount);
    if (value > o.amount) throw Error("Valor maior que a parcela.");
    o.confirmed = value;
    o.unknown = false;
    o.version++;
  }
  if (c.type === "transfer" || c.type === "reconcile") {
    const a = n.accounts.find(
      (a) => a.id === p.account_id && a.owner_id === user.id,
    );
    if (!a) throw Error("Conta não autorizada.");
    date.parse(p.date);
    if (String(p.date) < a.cutoff)
      throw Error("Data anterior ao início do controle.");
    const recorded = balance(a, n);
    const amount = cents.parse(p.amount);
    const movement = (account_id: string, amount: number) =>
      n.account_movements.push({
        id: id(),
        owner_id: user.id,
        account_id,
        amount,
        occurred_on: String(p.date),
        kind: c.type,
        reference_id: c.key,
        reason: String(p.reason ?? ""),
      });
    if (c.type === "transfer") {
      const dest = n.accounts.find(
        (a) => a.id === p.destination_id && a.owner_id === user.id,
      );
      if (
        !dest ||
        dest.id === a.id ||
        ["VA", "VR"].includes(a.kind) ||
        ["VA", "VR"].includes(dest.kind) ||
        amount > recorded
      )
        throw Error("Transferência inválida.");
      movement(a.id, -amount);
      movement(dest.id, amount);
    } else {
      if (String(p.reason ?? "").trim().length < 5)
        throw Error("Informe uma justificativa.");
      if (amount !== recorded) movement(a.id, amount - recorded);
    }
  }
  if (c.type === "recurrence") {
    const rec = {
      id: String(p.id),
      owner_id: user.id,
      description: String(p.description),
      amount: cents.positive().parse(p.amount),
      first_due: date.parse(p.date),
      house: !!p.house,
      variable: !!p.variable,
      active: true,
    };
    n.recurrences.push(rec);
    for (let i = 0; i < 12; i++)
      n.obligations.push({
        id: `${rec.id}:${i}`,
        owner_id: user.id,
        family_id: user.family_id,
        description: rec.description,
        amount: rec.amount,
        due_on: addMonths(rec.first_due, i),
        house: rec.house,
        confirmed: 0,
        unknown: rec.variable,
        recurrence_id: rec.id,
        plan_id: null,
        number: null,
        card_id: null,
        replaced_by: null,
        version: 1,
      });
  }
  if (c.type === "generate") {
    /* Existing first-year instances are unique by rule and month. */
  }
  if (c.type === "replace") {
    const sources = n.obligations.filter((o) =>
      (p.sources as string[]).includes(o.id),
    );
    if (
      sources.length !== (p.sources as string[]).length ||
      sources.some((o) => o.owner_id !== user.id || o.replaced_by)
    )
      throw Error("Origem inválida.");
    const fee = cents.parse(p.fee);
    const original =
      sources.reduce((sum, o) => sum + remaining(o, n.payments), 0) + fee;
    const total = p.quote ? cents.positive().parse(p.quote) : original;
    if (total > original)
      throw Error("Cotação maior que o saldo e os encargos informados.");
    const amounts = installmentAmounts(total, Number(p.count));
    const first = String(p.id) + ":1";
    sources.forEach((o) => {
      o.replaced_by = first;
      o.version++;
    });
    amounts.forEach((amount, i) =>
      n.obligations.push({
        id: `${p.id}:${i + 1}`,
        owner_id: user.id,
        family_id: user.family_id,
        description: String(p.description),
        amount,
        due_on: addMonths(String(p.date), i),
        house: false,
        confirmed: 0,
        unknown: false,
        plan_id: null,
        number: i + 1,
        card_id: null,
        replaced_by: null,
        version: 1,
      }),
    );
    if (fee)
      n.entries.push({
        id: String(p.id),
        owner_id: user.id,
        family_id: user.family_id,
        description: "Encargos confirmados · " + p.description,
        kind: "expense",
        amount: fee,
        occurred_on: String(p.occurred_on ?? today()),
        category: "Financeiro",
        house: false,
        consumer_id: user.id,
        responsible_id: null,
        card_id: null,
        splits: [],
        version: 1,
        voided: false,
      });
  }
  if (c.type === "adjust_due") {
    const o = n.obligations.find(
      (o) => o.id === p.id && o.owner_id === user.id,
    );
    if (
      !o ||
      o.version !== p.version ||
      String(p.reason ?? "").trim().length < 5
    )
      throw Error("Alteração inválida.");
    const amount = cents.positive().parse(p.amount);
    if (amount < o.amount - remaining(o, n.payments))
      throw Error("Valor menor que o já pago.");
    o.due_on = date.parse(p.date);
    o.amount = amount;
    const consumption = n.entries.find(
      (e) =>
        (e as Entry & { obligation_id?: string }).obligation_id === o.id ||
        e.id === o.id,
    );
    if (consumption) {
      consumption.amount = amount;
      consumption.version++;
    }
    o.unknown = false;
    o.version++;
  }
  if (c.type === "goal") {
    cents.parse(p.amount);
    n.goals = n.goals.filter(
      (g) => g.owner_id !== user.id || g.month !== p.month,
    );
    n.goals.push({
      owner_id: user.id,
      month: String(p.month),
      amount: Number(p.amount),
    });
  }
  if (c.type === "send") {
    const x = n.settlements.find(
      (x) => x.id === p.id && x.debtor_id === user.id,
    );
    if (!x) throw Error("Acerto não autorizado.");
    const amount = cents.positive().parse(p.amount);
    if (x.sent + amount > x.amount - x.confirmed)
      throw Error("Valor excede o acerto.");
    const source = n.accounts.find(
      (a) =>
        a.id === p.account_id &&
        a.owner_id === user.id &&
        !["VA", "VR"].includes(a.kind),
    );
    if (!source) throw Error("Informe a conta de origem.");
    n.settlement_transfers.push({
      id: c.key,
      settlement_id: x.id,
      sender_id: user.id,
      source_id: source.id,
      amount,
      sent_on: String(p.sent_on),
      confirmed_on: null,
      destination_id: null,
    });
    x.sent += amount;
    x.sent_on = String(p.sent_on);
    x.version++;
  }
  if (c.type === "confirm") {
    const x = n.settlements.find(
      (x) => x.id === p.id && x.creditor_id === user.id,
    );
    if (!x || !x.sent) throw Error("Nenhum envio aguardando confirmação.");
    if (x.version !== p.version) throw Error("Acerto alterado. Atualize.");
    const account = n.accounts.find(
      (a) =>
        a.id === p.account_id &&
        a.owner_id === user.id &&
        !["VA", "VR"].includes(a.kind),
    );
    if (!account) throw Error("Informe a conta de recebimento.");
    n.settlement_transfers
      .filter(
        (t) => t.settlement_id === x.id && !t.confirmed_on && !t.rejected_on,
      )
      .forEach((t) => {
        n.account_movements.push(
          {
            id: id(),
            owner_id: t.sender_id,
            account_id: t.source_id,
            amount: -t.amount,
            occurred_on: t.sent_on,
            kind: "settlement",
            reference_id: t.id,
            reason: null,
          },
          {
            id: id(),
            owner_id: user.id,
            account_id: account.id,
            amount: t.amount,
            occurred_on: String(p.date),
            kind: "settlement",
            reference_id: t.id,
            reason: null,
          },
        );
        t.confirmed_on = String(p.date);
        t.destination_id = account.id;
      });
    x.confirmed += x.sent;
    x.sent = 0;
    x.version++;
  }
  if (c.type === "void") {
    const e = n.entries.find((e) => e.id === p.id && e.owner_id === user.id);
    if (!e || e.version !== p.version)
      throw Error("Registro alterado ou não autorizado.");
    if (e.card_id)
      throw Error("Estorne a obrigação vinculada antes de anular.");
    e.voided = true;
    e.version++;
  }
  return n;
}
export function demoState(): State {
  const s = emptyState();
  s.profiles = [
    { ...demoIdentity, role: "admin", active: true },
    {
      id: "b",
      family_id: "demo",
      name: "Pessoa B",
      role: "member",
      active: true,
    },
  ];
  s.accounts = [
    {
      id: "bank-a",
      owner_id: "a",
      name: "Inter · conta principal",
      kind: "bank",
      opening: 320000,
      cutoff: "2026-11-01",
    },
    {
      id: "va-a",
      owner_id: "a",
      name: "Meu vale-alimentação",
      kind: "VA",
      opening: 50000,
      cutoff: "2026-11-01",
    },
  ];
  s.cards = [
    {
      id: "card-a",
      owner_id: "a",
      name: "Itaú · compartilhado",
      closing: 5,
      due: 15,
      authorized: ["b"],
    },
  ];
  s.entries = [
    {
      id: "e1",
      owner_id: "a",
      family_id: "demo",
      description: "Mercado da semana",
      kind: "expense",
      amount: 40000,
      occurred_on: "2026-11-05",
      category: "Alimentação",
      house: true,
      consumer_id: "a",
      responsible_id: null,
      card_id: null,
      splits: [
        { account_id: "va-a", amount: 25000 },
        { account_id: "bank-a", amount: 15000 },
      ],
      version: 1,
      voided: false,
    },
    {
      id: "e2",
      owner_id: "b",
      family_id: "demo",
      description: "Compras da Pessoa B",
      kind: "expense",
      amount: 65000,
      occurred_on: "2026-11-04",
      category: "Compras pessoais",
      house: false,
      consumer_id: "b",
      responsible_id: "b",
      card_id: "card-a",
      splits: [],
      version: 1,
      voided: false,
    },
    {
      id: "e3",
      owner_id: "a",
      family_id: "demo",
      description: "Compras da Pessoa A",
      kind: "expense",
      amount: 35000,
      occurred_on: "2026-11-04",
      category: "Compras pessoais",
      house: false,
      consumer_id: "a",
      responsible_id: "a",
      card_id: "card-a",
      splits: [],
      version: 1,
      voided: false,
    },
  ];
  const p: Plan = {
    id: "loan-a",
    owner_id: "a",
    description: "Empréstimo demonstrativo",
    first_due: "2026-03-20",
    count: 10,
    amount: 20000,
    last_paid: 8,
    last_paid_on: "2026-10-20",
    history_confirmed: false,
    payoff: null,
    kind: "loan",
  };
  s.plans = [p];
  s.obligations = schedule(p, "demo");
  s.obligations.push({
    id: "statement-a",
    owner_id: "a",
    family_id: "demo",
    description: "Fatura Itaú · novembro",
    amount: 100000,
    due_on: "2026-11-15",
    house: false,
    confirmed: 0,
    unknown: false,
    plan_id: null,
    number: null,
    card_id: "card-a",
    replaced_by: null,
    version: 1,
  });
  s.settlements = [
    {
      id: "settlement-ab",
      debtor_id: "b",
      creditor_id: "a",
      description: "Compras no Itaú · novembro",
      amount: 65000,
      sent: 40000,
      confirmed: 0,
      sent_on: "2026-11-10",
      version: 1,
    },
  ];
  s.settlement_transfers = [
    {
      id: "demo-pix",
      settlement_id: "settlement-ab",
      sender_id: "b",
      source_id: "bank-b",
      amount: 40000,
      sent_on: "2026-11-10",
      confirmed_on: null,
      destination_id: null,
    },
  ];
  s.goals = [{ owner_id: "a", month: "2026-11", amount: 60000 }];
  return s;
}
export class DemoRepository {
  private state = demoState();
  private keys = new Map<string, string>();
  async load() {
    return structuredClone(this.state);
  }
  async execute(c: Command, user: Identity) {
    const signature = JSON.stringify(c);
    if (this.keys.has(c.key)) {
      if (this.keys.get(c.key) !== signature)
        throw Error("Chave reutilizada com conteúdo diferente.");
      return;
    }
    const next = apply(this.state, c, user);
    this.state = next;
    this.keys.set(c.key, signature);
  }
}
export class RemoteRepository {
  async load(): Promise<State> {
    if (!supabase) throw Error("Configure o Supabase.");
    const { data, error } = await supabase.rpc("load_finances");
    if (error || !data)
      throw Error(
        "Não foi possível carregar os dados. Verifique sua conexão e as permissões.",
      );
    return data as State;
  }

  async execute(c: Command) {
    const { error } = await supabase!.rpc("execute_command", { command: c });
    if (error)
      throw Error(
        "Operação recusada. Confira os valores, as permissões e atualize os dados antes de tentar novamente.",
      );
  }
}
