import { addMonths, remaining, today, type State } from "./finance";
import { budgetSummary } from "./personal";
export function financialAlerts(
  state: State,
  ownerId: string,
  house = false,
  asOf = today(),
) {
  const end = new Date(asOf + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + 7);
  const through = end.toISOString().slice(0, 10);
  const obligations = state.obligations.filter(
    (o) =>
      (house ? o.house : o.owner_id === ownerId) &&
      remaining(o, state.payments) > 0,
  );
  const overdue = obligations.filter((o) => o.due_on && o.due_on < asOf);
  const upcoming = obligations.filter(
    (o) => o.due_on && o.due_on >= asOf && o.due_on <= through,
  );
  const unknown = obligations.filter((o) => !o.due_on || o.unknown);
  const month = asOf.slice(0, 7);
  const budgets = house
    ? []
    : state.personal_budgets
        .filter((b) => b.owner_id === ownerId && b.month === month)
        .map((b) => ({ budget: b, summary: budgetSummary(state, b) }))
        .filter(
          ({ budget, summary }) =>
            summary.actual * 100 >= budget.amount * budget.warning &&
            summary.actual > 0,
        );
  const entries = state.entries.filter(
    (e) =>
      !e.voided &&
      e.kind === "expense" &&
      (house ? e.house : e.consumer_id === ownerId && !e.house),
  );
  const unusual: string[] = [];
  for (const category of new Set(entries.map((e) => e.category))) {
    const current = entries
      .filter((e) => e.category === category && e.occurred_on.startsWith(month))
      .reduce((n, e) => n + e.amount, 0);
    const past = [1, 2, 3]
      .map((i) => {
        const m = addMonths(month + "-01", -i).slice(0, 7);
        return entries
          .filter((e) => e.category === category && e.occurred_on.startsWith(m))
          .reduce((n, e) => n + e.amount, 0);
      })
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    if (past.length === 3 && current > past[1] * 1.5) unusual.push(category);
  }
  return { overdue, upcoming, unknown, budgets, unusual };
}
