import { z } from "zod";
import { addMonths, balance, cents, date, today, type State } from "./finance";

export type PersonalBudget = {
  owner_id: string;
  month: string;
  category: string;
  amount: number;
  warning: number;
  version: number;
};
export type SavingsGoal = {
  id: string;
  owner_id: string;
  name: string;
  kind: "emergency" | "savings" | "purchase" | "travel" | "debt" | "custom";
  target: number;
  initial: number;
  account_id: string | null;
  due_on: string | null;
  created_on: string;
  active: boolean;
  version: number;
};
export type SavingsMovement = {
  id: string;
  goal_id: string;
  owner_id: string;
  amount: number;
  occurred_on: string;
  reason: string;
  reverse_of: string | null;
};
export type PersonalState = {
  personal_budgets: PersonalBudget[];
  savings_goals: SavingsGoal[];
  savings_movements: SavingsMovement[];
};
export type PersonalCommandType =
  | "budget"
  | "budget_copy"
  | "savings_goal"
  | "savings_move"
  | "savings_reverse";
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const goalKind = z.enum([
  "emergency",
  "savings",
  "purchase",
  "travel",
  "debt",
  "custom",
]);
export const personalEmpty = (): PersonalState => ({
  personal_budgets: [],
  savings_goals: [],
  savings_movements: [],
});
export function budgetSpent(
  s: Pick<State, "entries">,
  owner: string,
  month: string,
  category: string,
): number {
  return s.entries
    .filter(
      (e) =>
        !e.voided &&
        e.kind === "expense" &&
        !e.house &&
        e.consumer_id === owner &&
        e.occurred_on.startsWith(month) &&
        e.category === category,
    )
    .reduce((n, e) => n + e.amount, 0);
}
export function budgetSummary(s: Pick<State, "entries">, b: PersonalBudget) {
  const actual = budgetSpent(s, b.owner_id, b.month, b.category);
  const previousMonth = addMonths(`${b.month}-01`, -1).slice(0, 7);
  const previous = budgetSpent(s, b.owner_id, previousMonth, b.category);
  return {
    actual,
    remaining: b.amount - actual,
    percent: b.amount ? (actual / b.amount) * 100 : actual ? null : 0,
    previous,
    difference: actual - previous,
    status:
      actual > b.amount
        ? "ultrapassado"
        : actual === b.amount && actual > 0
          ? "atingido"
          : b.amount > 0 && actual * 100 >= b.amount * b.warning
            ? "atenção"
            : "dentro do planejado",
  };
}
export function savingsSummary(
  goal: SavingsGoal,
  movements: SavingsMovement[],
  asOf = today(),
) {
  const own = movements.filter(
    (m) =>
      m.goal_id === goal.id &&
      m.owner_id === goal.owner_id &&
      m.occurred_on <= asOf,
  );
  const reserved =
    (goal.created_on <= asOf ? goal.initial : 0) +
    own.reduce((n, m) => n + m.amount, 0);
  const missing = Math.max(0, goal.target - reserved);
  // All allocations, including withdrawals/corrections, enter the observed monthly pace.
  const from = addMonths(`${asOf.slice(0, 7)}-01`, -2);
  const recent = own
    .filter((m) => m.occurred_on >= from)
    .reduce((n, m) => n + m.amount, 0);
  const monthsObserved = Math.min(
    3,
    Math.max(
      1,
      (Number(asOf.slice(0, 4)) - Number(goal.created_on.slice(0, 4))) * 12 +
        Number(asOf.slice(5, 7)) -
        Number(goal.created_on.slice(5, 7)) +
        1,
    ),
  );
  const pace = Math.floor(recent / monthsObserved);
  const completion =
    missing === 0
      ? asOf.slice(0, 7)
      : pace > 0
        ? addMonths(`${asOf.slice(0, 7)}-01`, Math.ceil(missing / pace)).slice(
            0,
            7,
          )
        : null;
  return {
    reserved,
    missing,
    percent: (reserved / goal.target) * 100,
    pace,
    completion,
  };
}
function validHistory(goal: SavingsGoal, movements: SavingsMovement[]) {
  let value = goal.initial;
  const days = new Map<string, number>();
  for (const m of movements.filter((m) => m.goal_id === goal.id)) {
    if (m.occurred_on < goal.created_on)
      throw Error("A alocação deve ocorrer após a criação da meta.");
    days.set(m.occurred_on, (days.get(m.occurred_on) ?? 0) + m.amount);
  }
  for (const [, amount] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    value += amount;
    if (value < 0 || value > 100_000_000_000)
      throw Error(
        "A retirada excede o valor separado na meta. Confira o histórico.",
      );
  }
}
/** Demo follows the same authorization and version checks as the SQL command boundary. */
export function applyPersonal<T extends State>(
  state: T,
  command: { type: string; payload: Record<string, unknown> },
  user: { id: string },
): (T & PersonalState) | null {
  if (
    ![
      "budget",
      "budget_copy",
      "savings_goal",
      "savings_move",
      "savings_reverse",
    ].includes(command.type)
  )
    return null;
  const n = structuredClone({ ...state, ...personalEmpty(), ...state }) as T &
    PersonalState;
  const p = command.payload;
  if (command.type === "budget") {
    const month = monthSchema.parse(p.month),
      category = z.string().trim().min(1).max(100).parse(p.category),
      amount = cents.parse(p.amount),
      warning = z.number().int().min(1).max(100).parse(p.warning);
    const count = z
      .number()
      .int()
      .min(1)
      .max(24)
      .parse(p.months ?? 1);
    const versions = (p.versions ?? {}) as Record<string, number>;
    for (let i = 0; i < count; i++) {
      const m = addMonths(`${month}-01`, i).slice(0, 7);
      const b = n.personal_budgets.find(
        (b) =>
          b.owner_id === user.id && b.month === m && b.category === category,
      );
      const expected = i === 0 ? p.version : (versions[m] ?? 0);
      if ((b?.version ?? 0) !== expected)
        throw Error(
          "Orçamento alterado em outra sessão. Atualize antes de salvar.",
        );
      if (b) Object.assign(b, { amount, warning, version: b.version + 1 });
      else
        n.personal_budgets.push({
          owner_id: user.id,
          month: m,
          category,
          amount,
          warning,
          version: 1,
        });
    }
  } else if (command.type === "budget_copy") {
    const month = monthSchema.parse(p.month),
      from = addMonths(`${month}-01`, -1).slice(0, 7);
    for (const b of n.personal_budgets.filter(
      (b) => b.owner_id === user.id && b.month === from,
    )) {
      if (
        !n.personal_budgets.some(
          (x) =>
            x.owner_id === user.id &&
            x.month === month &&
            x.category === b.category,
        )
      )
        n.personal_budgets.push({ ...b, month, version: 1 });
    }
  } else if (command.type === "savings_goal") {
    const existing = n.savings_goals.find((g) => g.id === p.id);
    if (existing && existing.owner_id !== user.id)
      throw Error("Meta não autorizada.");
    if ((existing?.version ?? 0) !== p.version)
      throw Error("Meta alterada em outra sessão. Atualize antes de salvar.");
    const account_id = p.account_id ? String(p.account_id) : null;
    if (
      account_id &&
      !n.accounts.some(
        (a) =>
          a.id === account_id &&
          a.owner_id === user.id &&
          ["bank", "cash"].includes(a.kind),
      )
    )
      throw Error("Vincule uma conta bancária própria ou dinheiro.");
    const initial = existing?.initial ?? cents.parse(p.initial ?? 0);
    if (existing && p.initial !== undefined && p.initial !== existing.initial)
      throw Error("Corrija o valor separado por aporte ou retirada auditável.");
    const g: SavingsGoal = {
      id: z.string().min(1).parse(p.id),
      owner_id: user.id,
      name: z.string().trim().min(1).max(100).parse(p.name),
      kind: goalKind.parse(p.kind),
      target: cents.positive().parse(p.target),
      initial,
      account_id,
      due_on: p.due_on ? date.parse(p.due_on) : null,
      created_on: existing?.created_on ?? date.parse(p.created_on ?? today()),
      active: p.active !== false,
      version: (existing?.version ?? 0) + 1,
    };
    if (g.created_on > today())
      throw Error("A data da reserva não pode ser futura.");
    if (existing) Object.assign(existing, g);
    else n.savings_goals.push(g);
  } else {
    const g = n.savings_goals.find(
      (g) => g.id === p.goal_id && g.owner_id === user.id,
    );
    if (!g || !g.active) throw Error("Meta não autorizada ou inativa.");
    if (g.version !== p.version)
      throw Error("Meta alterada em outra sessão. Atualize antes de salvar.");
    const occurred_on = date.parse(p.occurred_on);
    if (occurred_on > today()) throw Error("Não confirme uma reserva futura.");
    let amount: number,
      reverse_of: string | null = null;
    if (command.type === "savings_reverse") {
      const original = n.savings_movements.find(
        (m) =>
          m.id === p.movement_id &&
          m.goal_id === g.id &&
          m.owner_id === user.id,
      );
      if (
        !original ||
        original.reverse_of ||
        n.savings_movements.some((m) => m.reverse_of === original.id) ||
        occurred_on < original.occurred_on
      )
        throw Error("Correção de reserva inválida.");
      amount = -original.amount;
      reverse_of = original.id;
    } else
      amount =
        cents.positive().parse(p.amount) *
        (z.enum(["deposit", "withdrawal"]).parse(p.direction) === "withdrawal"
          ? -1
          : 1);
    if (n.savings_movements.some((m) => m.id === p.id))
      throw Error("Registro já existente.");
    n.savings_movements.push({
      id: z.string().min(1).parse(p.id),
      goal_id: g.id,
      owner_id: user.id,
      amount,
      occurred_on,
      reason: z.string().trim().min(3).max(500).parse(p.reason),
      reverse_of,
    });
    validHistory(g, n.savings_movements);
    g.version++;
  }
  // Allocation is informational and never changes bank balance; associated amounts must be plausible.
  for (const account of (command.type.startsWith("savings_")
    ? n.accounts
    : []
  ).filter(
    (a) => a.owner_id === user.id && ["bank", "cash"].includes(a.kind),
  )) {
    const reserved = n.savings_goals
      .filter(
        (g) =>
          g.owner_id === user.id && g.active && g.account_id === account.id,
      )
      .reduce(
        (sum, g) => sum + savingsSummary(g, n.savings_movements).reserved,
        0,
      );
    if (reserved > balance(account, n))
      throw Error(
        "O valor separado excede o saldo registrado da conta vinculada. Confira o saldo ou ajuste as reservas.",
      );
  }
  return n;
}
