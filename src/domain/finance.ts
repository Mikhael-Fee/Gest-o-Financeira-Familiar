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
  due_on: string;
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
  first_due: string;
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
  date.parse(plan.first_due);
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
    due_on: addMonths(plan.first_due, i),
    house: false,
    confirmed:
      i + 1 === plan.last_paid ||
      (plan.history_confirmed && i + 1 <= plan.last_paid)
        ? plan.amount
        : 0,
    unknown: i + 1 < plan.last_paid && !plan.history_confirmed,
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
  if (o.unknown) return "Histórico a conferir";
  if (left < o.amount) return "Parcialmente paga";
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
          o.due_on <= `${month}-31`,
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
export function forecast(s: State, month: string, base: number, months = 12) {
  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(`${month}-01`, i).slice(0, 7);
    const actual = s.entries
      .filter(
        (e) =>
          e.kind === "income" &&
          e.income_type !== "extra" &&
          !e.voided &&
          e.occurred_on.startsWith(m),
      )
      .reduce((n, e) => n + e.amount, 0);
    const due = s.obligations
      .filter((o) => o.due_on.startsWith(m))
      .reduce((n, o) => n + remaining(o, s.payments), 0);
    const extras = s.entries
      .filter(
        (e) =>
          e.kind === "income" &&
          e.income_type === "extra" &&
          !e.voided &&
          e.occurred_on.startsWith(m),
      )
      .reduce((n, e) => n + e.amount, 0);
    return {
      month: m,
      income: (actual || base) + extras,
      estimated: !actual,
      due,
      free: (actual || base) + extras - due,
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
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
  return {
    highestPaid: paid[0]?.number ?? 0,
    earliestOpen: open[0],
    lastDue: addMonths(plan.first_due, plan.count - 1),
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
