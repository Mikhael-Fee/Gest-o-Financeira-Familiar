import { z } from "zod";
export const cents = z.number().int().safe().nonnegative().max(100_000_000_000);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Data inválida",
  );
export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value / 100,
  );
export function parseMoney(value: string): number {
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(value.trim()))
    throw Error("Informe um valor como 200,50, sem separador de milhar.");
  const [whole, part = ""] = value.trim().replace(",", ".").split(".");
  return cents.parse(Number(whole) * 100 + Number(part.padEnd(2, "0")));
}
export function addMonths(value: string, count: number): string {
  date.parse(value);
  const [y, m, d] = value.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + count, 1));
  target.setUTCDate(
    Math.min(
      d,
      new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return target.toISOString().slice(0, 10);
}
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export type Account = {
  id: string;
  owner_id: string;
  name: string;
  kind: "bank" | "cash" | "VA" | "VR";
  opening: number;
  cutoff: string;
};
export type Card = {
  id: string;
  owner_id: string;
  name: string;
  closing: number;
  due: number;
  authorized: string[];
};
export type Split = { account_id: string; amount: number };
export type Entry = {
  id: string;
  owner_id: string;
  family_id: string;
  description: string;
  kind: "expense" | "income" | "benefit" | "transfer" | "loan_received";
  amount: number;
  occurred_on: string;
  category: string;
  house: boolean;
  consumer_id: string;
  responsible_id: string | null;
  card_id: string | null;
  splits: Split[];
  version: number;
  voided: boolean;
  installments?: number;
  income_type?: string;
  salary_month?: string | null;
  loan_id?: string | null;
  tags?: string[];
  beneficiary_id?: string | null;
};
export type Payment = {
  id: string;
  obligation_id: string;
  account_id: string;
  amount: number;
  paid_on: string;
  payer_id: string;
  key: string;
  reversed_on?: string | null;
};
export type Obligation = {
  id: string;
  owner_id: string;
  family_id: string;
  description: string;
  amount: number;
  due_on: string | null;
  house: boolean;
  confirmed: number;
  unknown: boolean;
  plan_id: string | null;
  number: number | null;
  card_id: string | null;
  replaced_by: string | null;
  version: number;
  recurrence_id?: string | null;
};
export type Plan = {
  id: string;
  owner_id: string;
  description: string;
  first_due: string | null;
  next_due?: string | null;
  next_number?: number | null;
  last_paid_known?: boolean;
  count: number;
  amount: number;
  last_paid: number;
  last_paid_on: string | null;
  history_confirmed: boolean;
  payoff: number | null;
  kind: "loan" | "purchase" | "refinance";
};
export type Settlement = {
  id: string;
  debtor_id: string;
  creditor_id: string;
  description: string;
  amount: number;
  sent: number;
  confirmed: number;
  sent_on: string | null;
  version: number;
};
export type State = {
  income_months: {
    owner_id: string;
    month: string;
    expected: number;
    version: number;
  }[];
  income_references: {
    owner_id: string;
    effective_month: string;
    base: number;
    version: number;
  }[];
  categories: {
    id: string;
    owner_id: string;
    name: string;
    parent_id: string | null;
    active: boolean;
    version: number;
  }[];
  income_settings: { owner_id: string; base: number; payday: number }[];
  profiles: {
    id: string;
    family_id: string;
    name: string;
    role: string;
    active: boolean;
  }[];
  accounts: Account[];
  cards: Card[];
  entries: Entry[];
  obligations: Obligation[];
  payments: Payment[];
  plans: Plan[];
  settlements: Settlement[];
  settlement_transfers: {
    id: string;
    settlement_id: string;
    sender_id: string;
    source_id: string;
    amount: number;
    sent_on: string;
    confirmed_on: string | null;
    destination_id: string | null;
    rejected_on?: string | null;
    reversed_on?: string | null;
  }[];
  account_movements: {
    id: string;
    owner_id: string;
    account_id: string;
    amount: number;
    occurred_on: string;
    kind: string;
    reference_id: string;
    reason: string | null;
  }[];
  recurrences: {
    id: string;
    owner_id: string;
    description: string;
    amount: number;
    first_due: string;
    house: boolean;
    variable: boolean;
    active: boolean;
  }[];
  goals: { owner_id: string; month: string; amount: number }[];
};
export const emptyState = (): State => ({
  income_months: [],
  income_references: [],
  categories: [],
  income_settings: [],
  profiles: [],
  accounts: [],
  cards: [],
  entries: [],
  obligations: [],
  payments: [],
  plans: [],
  settlements: [],
  settlement_transfers: [],
  account_movements: [],
  recurrences: [],
  goals: [],
});
export function schedule(plan: Plan, family_id: string): Obligation[] {
  if (plan.first_due) date.parse(plan.first_due);
  else {
    date.parse(plan.next_due);
    z.number().int().min(1).max(plan.count).parse(plan.next_number);
  }
  if (
    plan.last_paid_known === false &&
    (plan.last_paid !== 0 || plan.last_paid_on || plan.history_confirmed)
  )
    throw Error("Não confirme parcelas quando o histórico é desconhecido.");
  cents.parse(plan.amount);
  z.number().int().min(1).max(600).parse(plan.count);
  z.number().int().min(0).max(plan.count).parse(plan.last_paid);
  if (plan.last_paid && !plan.last_paid_on)
    throw Error("Informe a data efetiva da última parcela paga.");
  return Array.from({ length: plan.count }, (_, i) => ({
    id: `${plan.id}:${i + 1}`,
    owner_id: plan.owner_id,
    family_id,
    description: `${plan.description} · ${i + 1}/${plan.count}`,
    amount: plan.amount,
    due_on: plan.first_due
      ? addMonths(plan.first_due, i)
      : i + 1 >= (plan.next_number ?? 1)
        ? addMonths(plan.next_due!, i + 1 - plan.next_number!)
        : null,
    house: false,
    confirmed:
      i + 1 === plan.last_paid ||
      (plan.history_confirmed && i + 1 <= plan.last_paid)
        ? plan.amount
        : 0,
    unknown:
      (!plan.first_due && i + 1 < plan.next_number!) ||
      (i + 1 < plan.last_paid && !plan.history_confirmed),
    plan_id: plan.id,
    number: i + 1,
    card_id: null,
    replaced_by: null,
    version: 1,
  }));
}
export function remaining(o: Obligation, payments: Payment[]): number {
  return o.replaced_by
    ? 0
    : Math.max(
        0,
        o.amount -
          o.confirmed -
          payments
            .filter((p) => p.obligation_id === o.id && !p.reversed_on)
            .reduce((s, p) => s + p.amount, 0),
      );
}
export function status(
  o: Obligation,
  payments: Payment[],
  now = today(),
): string {
  if (o.replaced_by) return "Renegociada";
  const left = remaining(o, payments);
  if (!left) return "Paga";
  if (o.unknown)
    return o.due_on
      ? "Histórico a conferir"
      : "Histórico a conferir · vencimento desconhecido";
  if (left < o.amount) return "Parcialmente paga";
  if (!o.due_on) return "Vencimento desconhecido · a conferir";
  return o.due_on < now ? "Vencida · sem confirmação" : "A vencer";
}
export function statementDate(
  purchase: string,
  closing: number,
  due: number,
): string {
  z.number().int().min(1).max(31).parse(closing);
  z.number().int().min(1).max(31).parse(due);
  const month = purchase.slice(0, 7) + "-01";
  const close = addMonths(
    month.slice(0, 8) +
      String(
        Math.min(
          closing,
          new Date(
            Number(month.slice(0, 4)),
            Number(month.slice(5, 7)),
            0,
          ).getDate(),
        ),
      ).padStart(2, "0"),
    0,
  );
  const cycle = addMonths(month, purchase > close ? 1 : 0);
  const dueMonth = addMonths(cycle, due <= closing ? 1 : 0);
  const [y, m] = dueMonth.split("-").map(Number);
  return `${dueMonth.slice(0, 7)}-${String(Math.min(due, new Date(Date.UTC(y, m, 0)).getUTCDate())).padStart(2, "0")}`;
}
export function validateEntry(e: Entry, accounts: Account[]): void {
  cents.positive().parse(e.amount);
  if (e.kind === "loan_received" && !e.loan_id)
    throw Error("Vincule o recebimento a um contrato de empréstimo.");
  date.parse(e.occurred_on);
  if (e.card_id) {
    if (e.splits.length) throw Error("Compra no crédito não debita conta.");
    return;
  }
  if (e.splits.reduce((s, p) => s + cents.parse(p.amount), 0) !== e.amount)
    throw Error("A soma dos pagamentos deve ser igual ao total.");
  for (const split of e.splits) {
    const account = accounts.find((a) => a.id === split.account_id);
    if (!account || account.owner_id !== e.owner_id)
      throw Error("Conta não autorizada.");
    if (
      ["income", "loan_received"].includes(e.kind) &&
      !["bank", "cash"].includes(account.kind)
    )
      throw Error(
        "Receita em dinheiro exige conta bancária ou dinheiro físico.",
      );
    if (e.kind === "benefit" && !["VA", "VR"].includes(account.kind))
      throw Error("Recarga exige carteira VA/VR.");
    if (
      e.kind === "expense" &&
      ["VA", "VR"].includes(account.kind) &&
      e.category !== "Alimentação"
    )
      throw Error("VA/VR exige alimentação.");
  }
}
export function balance(a: Account, s: State, asOf = today()): number {
  if (a.cutoff > asOf) return 0;
  return (
    a.opening +
    s.account_movements
      .filter(
        (m) =>
          m.account_id === a.id &&
          m.occurred_on >= a.cutoff &&
          m.occurred_on <= asOf,
      )
      .reduce((n, m) => n + m.amount, 0) +
    s.entries
      .filter(
        (e) => !e.voided && e.occurred_on >= a.cutoff && e.occurred_on <= asOf,
      )
      .reduce(
        (sum, e) =>
          sum +
          e.splits
            .filter((p) => p.account_id === a.id)
            .reduce((n, p) => n + p.amount, 0) *
            (e.kind === "expense" ? -1 : 1),
        0,
      ) -
    s.payments
      .filter(
        (p) =>
          p.account_id === a.id && p.paid_on >= a.cutoff && p.paid_on <= asOf,
      )
      .reduce((sum, p) => sum + p.amount, 0)
  );
}
export function totals(s: State, month: string, owner?: string, house = false) {
  const entries = s.entries.filter(
    (e) =>
      !e.voided &&
      e.occurred_on.startsWith(month) &&
      (!owner || e.consumer_id === owner) &&
      (!house || e.house),
  );
  return {
    consumption: entries
      .filter((e) => e.kind === "expense")
      .reduce((n, e) => n + e.amount, 0),
    income: entries
      .filter((e) => e.kind === "income")
      .reduce((n, e) => n + e.amount, 0),
    due: s.obligations
      .filter(
        (o) =>
          (!owner || o.owner_id === owner) &&
          (!house || o.house) &&
          (!o.due_on || o.due_on <= `${month}-31`),
      )
      .reduce((n, o) => n + remaining(o, s.payments), 0),
  };
}
export function contribution(s: State, owner: string, month: string) {
  const actual =
    s.entries
      .filter(
        (e) =>
          !e.voided &&
          e.house &&
          e.kind === "expense" &&
          e.owner_id === owner &&
          e.occurred_on.startsWith(month) &&
          !e.card_id,
      )
      .reduce((n, e) => n + e.splits.reduce((v, p) => v + p.amount, 0), 0) +
    s.payments
      .filter(
        (p) =>
          !p.reversed_on &&
          p.payer_id === owner &&
          p.paid_on.startsWith(month) &&
          s.obligations.find((o) => o.id === p.obligation_id)?.house,
      )
      .reduce((n, p) => n + p.amount, 0);
  const goal =
    s.goals.find((g) => g.owner_id === owner && g.month === month)?.amount ?? 0;
  return {
    actual,
    goal,
    missing: Math.max(0, goal - actual),
    above: Math.max(0, actual - goal),
    debt: 0,
  };
}
export function incomeForMonth(
  s: State,
  owner: string,
  month: string,
  base?: number,
) {
  const override = s.income_months.find(
    (m) => m.owner_id === owner && m.month === month,
  );
  const reference = s.income_references
    .filter((r) => r.owner_id === owner && r.effective_month <= month)
    .sort((a, b) => b.effective_month.localeCompare(a.effective_month))[0];
  const expected =
    override?.expected ??
    reference?.base ??
    base ??
    s.income_settings.find((x) => x.owner_id === owner)?.base ??
    0;
  const receipts = s.entries.filter(
    (e) =>
      e.owner_id === owner &&
      e.kind === "income" &&
      !e.voided &&
      (e.salary_month ?? e.occurred_on.slice(0, 7)) === month,
  );
  const salaries = receipts.filter((e) => e.income_type !== "extra");
  const received = salaries.reduce((n, e) => n + e.amount, 0),
    extras = receipts
      .filter((e) => e.income_type === "extra")
      .reduce((n, e) => n + e.amount, 0);
  return {
    expected,
    received,
    extras,
    estimated: salaries.length === 0,
    income: (salaries.length ? received : expected) + extras,
    receipts: salaries,
  };
}
export function forecast(
  s: State,
  month: string,
  base: number,
  months = 12,
  ownerId?: string,
  respectSchedule = true,
) {
  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(`${month}-01`, i).slice(0, 7);
    const possible = [
      ...new Set([
        ...s.income_settings.map((x) => x.owner_id),
        ...s.income_months.map((x) => x.owner_id),
        ...s.income_references.map((x) => x.owner_id),
        ...s.entries.filter((e) => e.kind === "income").map((e) => e.owner_id),
      ]),
    ];
    if (!ownerId && possible.length > 1)
      throw Error("Informe a pessoa da previsão.");
    const owner = ownerId ?? possible[0] ?? "";
    const income = incomeForMonth(
      respectSchedule ? s : { ...s, income_months: [], income_references: [] },
      owner,
      m,
      base,
    );
    const due = s.obligations
      .filter((o) => o.due_on?.startsWith(m))
      .reduce((n, o) => n + remaining(o, s.payments), 0);
    return {
      month: m,
      income: income.income,
      estimated: income.estimated,
      due,
      free: income.income - due,
    };
  });
}

export function installmentAmounts(total: number, count: number): number[] {
  cents.positive().parse(total);
  z.number().int().min(1).max(600).parse(count);
  if (total < count)
    throw Error("Cada parcela precisa ter pelo menos um centavo.");
  return Array.from(
    { length: count },
    (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0),
  );
}
export function conservativeSalary(history: number[], base: number): number {
  const values = history
    .filter((x) => x > 0)
    .slice(-6)
    .sort((a, b) => a - b);
  if (values.length < 3) return base;
  const median = values[Math.floor((values.length - 1) / 2)];
  return Math.min(base || median, median);
}

export function loanSummary(plan: Plan, state: State) {
  const items = state.obligations.filter((o) => o.plan_id === plan.id);
  const paid = items
    .filter((o) => remaining(o, state.payments) === 0 && !o.replaced_by)
    .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
  const open = items
    .filter((o) => remaining(o, state.payments) > 0)
    .sort((a, b) => (a.due_on ?? "0000").localeCompare(b.due_on ?? "0000"));
  return {
    highestPaid: paid[0]?.number ?? 0,
    earliestOpen: open[0],
    lastDue: plan.first_due
      ? addMonths(plan.first_due, plan.count - 1)
      : plan.next_due && plan.next_number
        ? addMonths(plan.next_due, plan.count - plan.next_number)
        : null,
    futureSum: open.reduce((n, o) => n + remaining(o, state.payments), 0),
  };
}

export function divideSources(
  sources: Split[],
  part: number,
): [Split[], Split[]] {
  const total = sources.reduce((n, s) => n + cents.parse(s.amount), 0);
  cents.parse(part);
  if (!total || part > total) throw Error("Parte da Casa inválida.");
  let allocated = 0;
  const first = sources.map((s, i) => {
    const amount =
      i === sources.length - 1
        ? part - allocated
        : Number((BigInt(s.amount) * BigInt(part)) / BigInt(total));
    allocated += amount;
    return { ...s, amount };
  });
  return [
    first.filter((s) => s.amount > 0),
    sources
      .map((s, i) => ({ ...s, amount: s.amount - first[i].amount }))
      .filter((s) => s.amount > 0),
  ];
}
