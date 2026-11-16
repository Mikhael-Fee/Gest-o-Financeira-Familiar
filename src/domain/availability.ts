import {
  addMonths,
  balance,
  cents,
  date,
  incomeForMonth,
  remaining,
  today,
  type State,
} from "./finance";

export type IncomeScenario = "conservative" | "history" | "manual";
export type FutureReceipt = {
  id: string;
  owner_id: string;
  description: string;
  amount: number;
  expected_on: string;
  month: string;
  kind: "salary" | "extra" | "benefit";
  certainty: "expected" | "committed";
  status: "planned" | "received" | "cancelled";
  account_id: string | null;
  entry_id: string | null;
  version: number;
};
export type AccountCheck = {
  account_id: string;
  owner_id: string;
  checked_on: string;
  confirmed_balance: number;
  version: number;
};
export type ObligationReservation = {
  obligation_id: string;
  account_id: string;
  owner_id: string;
  amount: number;
  version: number;
};
export type IncomePlanningState = State & {
  future_receipts?: FutureReceipt[];
  account_checks?: AccountCheck[];
  obligation_reservations?: ObligationReservation[];
  savings_goals?: {
    id: string;
    owner_id: string;
    initial: number;
    account_id: string | null;
    active: boolean;
    created_on: string;
  }[];
  savings_movements?: {
    goal_id: string;
    owner_id: string;
    amount: number;
    occurred_on: string;
  }[];
};
export type MonthlyIncome = State["income_months"][number] & {
  expected_on?: string | null;
  scenario?: IncomeScenario;
};
export function addDays(value: string, count: number): string {
  date.parse(value);
  const d = new Date(value + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function paydayForMonth(month: string, payday: number) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error("Mês inválido.");
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(Math.min(Math.max(1, payday), new Date(Date.UTC(y, m, 0)).getUTCDate())).padStart(2, "0")}`;
}
/** Most recent consecutive monthly cluster; a one-off rise must not become habitual. */
export function historicalSalary(
  state: State,
  ownerId: string,
  beforeMonth: string,
) {
  const firstMonth = addMonths(beforeMonth + "-01", -6).slice(0, 7);
  const totals = new Map<string, number>();
  state.entries
    .filter(
      (e) =>
        e.owner_id === ownerId &&
        !e.voided &&
        e.kind === "income" &&
        e.income_type !== "extra" &&
        e.occurred_on <= today(),
    )
    .forEach((e) => {
      const month = e.salary_month ?? e.occurred_on.slice(0, 7);
      if (month >= firstMonth && month < beforeMonth)
        totals.set(month, (totals.get(month) ?? 0) + e.amount);
    });
  const rows = [...totals.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const reference = incomeForMonth(state, ownerId, beforeMonth).expected;
  const recent = rows.slice(-3);
  const consecutive =
    recent.length === 3 &&
    recent.every(
      ([m], i) =>
        i === 0 || addMonths(recent[i - 1][0] + "-01", 1).slice(0, 7) === m,
    );
  const values = (consecutive ? recent : rows)
    .map(([, v]) => v)
    .sort((a, b) => a - b);
  // Lower median also discards an unclassified isolated high bonus; explicit extras never enter.
  const median = values[Math.floor((values.length - 1) / 2)] ?? reference;
  const enough = rows.length >= 3;
  return {
    amount: enough ? median : reference,
    months: rows.map(([month, amount]) => ({ month, amount })),
    sufficient: enough,
    method: enough
      ? consecutive
        ? "Mediana dos 3 meses consecutivos mais recentes; extras separados"
        : "Mediana dos meses disponíveis nos últimos 6 meses; há lacunas"
      : "Menos de 3 competências confirmadas nos últimos 6 meses; usada a referência",
  };
}
export function expectedSalaryDate(
  state: State,
  ownerId: string,
  month: string,
) {
  const row = state.income_months.find(
    (x) => x.owner_id === ownerId && x.month === month,
  ) as MonthlyIncome | undefined;
  return (
    row?.expected_on ||
    paydayForMonth(
      month,
      state.income_settings.find((x) => x.owner_id === ownerId)?.payday ?? 5,
    )
  );
}
export function nextSalaryDate(state: State, ownerId: string, asOf = today()) {
  for (let i = 0; i < 14; i++) {
    const month = addMonths(asOf.slice(0, 7) + "-01", i).slice(0, 7);
    const expected = expectedSalaryDate(state, ownerId, month);
    if (expected >= asOf && incomeForMonth(state, ownerId, month).estimated)
      return expected;
  }
  return addDays(asOf, 30);
}
export function availableMoney(
  state: IncomePlanningState,
  ownerId: string,
  until: string,
  asOf = today(),
) {
  date.parse(until);
  date.parse(asOf);
  if (until < asOf) throw Error("O horizonte deve começar hoje ou depois.");
  const accounts = state.accounts.filter(
    (a) => a.owner_id === ownerId && ["bank", "cash"].includes(a.kind),
  );
  const bank = accounts.reduce((n, a) => n + balance(a, state, asOf), 0);
  const benefits = state.accounts
    .filter((a) => a.owner_id === ownerId && ["VA", "VR"].includes(a.kind))
    .reduce((n, a) => n + balance(a, state, asOf), 0);
  const ownObligations = state.obligations.filter(
    (o) => o.owner_id === ownerId && remaining(o, state.payments) > 0,
  );
  const dated = ownObligations.filter(
    (o) => o.due_on !== null && o.due_on <= until,
  );
  const undated = ownObligations
    .filter((o) => o.due_on === null)
    .reduce((n, o) => n + remaining(o, state.payments), 0);
  const overdue = dated
    .filter((o) => o.due_on! < asOf)
    .reduce((n, o) => n + remaining(o, state.payments), 0);
  const invoices = dated
    .filter((o) => o.card_id)
    .reduce((n, o) => n + remaining(o, state.payments), 0);
  const obligations = dated.reduce(
    (n, o) => n + remaining(o, state.payments),
    0,
  );
  const otherBills = obligations - invoices;
  const goals = (state.savings_goals ?? []).filter(
    (g) => g.owner_id === ownerId && g.active && g.created_on <= asOf,
  );
  const goalReserved = (g: (typeof goals)[number]) =>
    Math.max(
      0,
      g.initial +
        (state.savings_movements ?? [])
          .filter(
            (m) =>
              m.owner_id === ownerId &&
              m.goal_id === g.id &&
              m.occurred_on <= asOf,
          )
          .reduce((n, m) => n + m.amount, 0),
    );
  const savings = goals
    .filter((g) => accounts.some((a) => a.id === g.account_id))
    .reduce((n, g) => n + goalReserved(g), 0);
  const unlinkedSavings = goals
    .filter((g) => !g.account_id)
    .reduce((n, g) => n + goalReserved(g), 0);
  const allReservations = (state.obligation_reservations ?? []).filter(
    (r) =>
      r.owner_id === ownerId && accounts.some((a) => a.id === r.account_id),
  );
  // Reservations are earmarks, not movements. Only the amount outside already deducted bills is extra.
  let reservedBills = 0,
    reservedOutsideHorizon = 0;
  for (const r of allReservations) {
    const o = ownObligations.find((o) => o.id === r.obligation_id);
    if (!o) continue;
    const amount = Math.min(r.amount, remaining(o, state.payments));
    if (dated.some((d) => d.id === o.id)) reservedBills += amount;
    else reservedOutsideHorizon += amount;
  }
  const pendingSettlements = state.settlements
    .filter((s) => s.debtor_id === ownerId)
    .reduce((n, s) => n + Math.max(0, s.amount - s.confirmed), 0);
  const future = (state.future_receipts ?? []).filter(
    (r) =>
      r.owner_id === ownerId &&
      r.status === "planned" &&
      r.expected_on >= asOf &&
      r.expected_on <= until &&
      r.kind !== "benefit",
  );
  let expectedIncome = future
    .filter((r) => r.certainty === "expected")
    .reduce((n, r) => n + r.amount, 0);
  const committedIncome = future
    .filter((r) => r.certainty === "committed")
    .reduce((n, r) => n + r.amount, 0);
  for (let i = -1; i < 14; i++) {
    const month = addMonths(asOf.slice(0, 7) + "-01", i).slice(0, 7);
    const on = expectedSalaryDate(state, ownerId, month),
      income = incomeForMonth(state, ownerId, month);
    if (
      on >= asOf &&
      on <= until &&
      income.estimated &&
      !(state.future_receipts ?? []).some(
        (r) =>
          r.owner_id === ownerId &&
          r.kind === "salary" &&
          r.month === month &&
          r.status !== "cancelled",
      )
    )
      expectedIncome += income.expected;
  }
  const staleAccounts = accounts.filter((a) => {
    const check = (state.account_checks ?? []).find(
      (c) =>
        c.account_id === a.id && c.owner_id === ownerId && c.checked_on <= asOf,
    );
    if (!check || check.checked_on < addDays(asOf, -30)) return true;
    const latestOpening = a.cutoff > check.checked_on;
    return (
      latestOpening ||
      balance(a, state, check.checked_on) !== check.confirmed_balance
    );
  });
  const family = state.profiles.find((p) => p.id === ownerId)?.family_id;
  const unassignedHouse = state.obligations
    .filter(
      (o) =>
        o.house &&
        o.owner_id !== ownerId &&
        o.family_id === family &&
        !o.replaced_by &&
        remaining(o, state.payments) > 0,
    )
    .reduce((n, o) => n + remaining(o, state.payments), 0);
  const free =
    bank - obligations - savings - reservedOutsideHorizon - pendingSettlements;
  return {
    bank,
    benefits,
    obligations,
    otherBills,
    invoices,
    overdue,
    undated,
    savings,
    unlinkedSavings,
    reservedBills,
    reservedOutsideHorizon,
    pendingSettlements,
    expectedIncome,
    committedIncome,
    free,
    projectedCommitted: free + committedIncome,
    projected: free + committedIncome + expectedIncome,
    incomplete:
      !accounts.length ||
      !!undated ||
      !!staleAccounts.length ||
      !!unlinkedSavings,
    staleAccounts,
    unassignedHouse,
  };
}
export function validateIncomeScenario(value: unknown): IncomeScenario {
  if (!["conservative", "history", "manual"].includes(String(value)))
    throw Error("Cenário inválido.");
  return value as IncomeScenario;
}
export function validateFutureReceipt(value: FutureReceipt) {
  cents.positive().parse(value.amount);
  date.parse(value.expected_on);
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month) ||
    !value.description.trim() ||
    value.description.length > 200 ||
    !["salary", "extra", "benefit"].includes(value.kind) ||
    !["expected", "committed"].includes(value.certainty)
  )
    throw Error("Confira a previsão de recebimento.");
}
