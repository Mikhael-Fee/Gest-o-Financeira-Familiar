import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  emptyState,
  balance,
  type Entry,
  type Account,
} from "../src/domain/finance";
import {
  applyPersonal,
  budgetSummary,
  personalEmpty,
  savingsSummary,
} from "../src/domain/personal";
const user = { id: "a" };
const fixture = () => ({
  ...emptyState(),
  ...personalEmpty(),
  accounts: [
    {
      id: "bank",
      owner_id: "a",
      name: "Própria",
      kind: "bank" as const,
      opening: 100000,
      cutoff: "2026-01-01",
    },
  ] as Account[],
});
const create = {
  id: "goal",
  version: 0,
  name: "Reserva",
  kind: "emergency",
  target: 200000,
  initial: 10000,
  account_id: "bank",
  created_on: "2026-01-01",
};
function run(
  s: ReturnType<typeof fixture>,
  type: string,
  payload: Record<string, unknown>,
) {
  return applyPersonal(s, { type, payload }, user)!;
}
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());
describe("Orçamentos e reservas pessoais", () => {
  it("consumo considera usuário/categoria/mês sem Casa, pagamento nem receita e não bloqueia excesso", () => {
    let s = fixture();
    s = run(s, "budget", {
      month: "2026-11",
      category: "Lazer",
      amount: 10000,
      warning: 80,
      version: 0,
    });
    const entry = {
      id: "e",
      owner_id: "a",
      family_id: "f",
      description: "Compra",
      kind: "expense",
      consumer_id: "a",
      house: false,
      category: "Lazer",
      amount: 12500,
      occurred_on: "2026-11-02",
      splits: [],
      card_id: "card",
      responsible_id: "a",
      version: 1,
      voided: false,
    } as Entry;
    s.entries = [
      entry,
      { ...entry, id: "house", house: true, amount: 100000 },
      { ...entry, id: "other", consumer_id: "b", amount: 100000 },
      { ...entry, id: "income", kind: "income", amount: 100000 },
      { ...entry, id: "old", occurred_on: "2026-10-02", amount: 9000 },
    ];
    expect(budgetSummary(s, s.personal_budgets[0])).toMatchObject({
      actual: 12500,
      remaining: -2500,
      status: "ultrapassado",
      previous: 9000,
      difference: 3500,
    });
    expect(s.entries).toHaveLength(5);
  });
  it("copia sem sobrescrever e preserva versões em ajuste futuro", () => {
    let s = run(fixture(), "budget", {
      month: "2026-10",
      category: "Lazer",
      amount: 10000,
      warning: 80,
      version: 0,
    });
    s = run(s, "budget", {
      month: "2026-11",
      category: "Lazer",
      amount: 15000,
      warning: 90,
      version: 0,
    });
    s = run(s, "budget_copy", { month: "2026-11" });
    expect(s.personal_budgets.find((b) => b.month === "2026-11")?.amount).toBe(
      15000,
    );
    expect(() =>
      run(s, "budget", {
        month: "2026-10",
        category: "Lazer",
        amount: 20000,
        warning: 80,
        version: 1,
        months: 3,
      }),
    ).toThrow(/sessão/);
    s = run(s, "budget", {
      month: "2026-10",
      category: "Lazer",
      amount: 20000,
      warning: 80,
      version: 1,
      months: 3,
      versions: { "2026-11": 1 },
    });
    expect(s.personal_budgets.map((b) => b.amount)).toEqual([
      20000, 20000, 20000,
    ]);
  });
  it("aviso configurável e orçamento zero não produzem Infinity", () => {
    const s = run(fixture(), "budget", {
      month: "2026-11",
      category: "Lazer",
      amount: 0,
      warning: 80,
      version: 0,
    });
    expect(budgetSummary(s, s.personal_budgets[0]).percent).toBe(0);
    s.entries = [
      {
        kind: "expense",
        amount: 1,
        house: false,
        consumer_id: "a",
        category: "Lazer",
        occurred_on: "2026-11-01",
        voided: false,
      } as Entry,
    ];
    expect(budgetSummary(s, s.personal_budgets[0])).toMatchObject({
      percent: null,
      status: "ultrapassado",
    });
  });
  it("meta, aporte, retirada e estorno não fabricam dinheiro ou dívida", () => {
    let s = fixture();
    const cash = balance(s.accounts[0], s);
    s = run(s, "savings_goal", create);
    s = run(s, "savings_move", {
      id: "m",
      goal_id: "goal",
      version: 1,
      amount: 20000,
      direction: "deposit",
      occurred_on: "2026-11-01",
      reason: "Separado",
    });
    s = run(s, "savings_move", {
      id: "w",
      goal_id: "goal",
      version: 2,
      amount: 5000,
      direction: "withdrawal",
      occurred_on: "2026-11-02",
      reason: "Utilizei",
    });
    s = run(s, "savings_reverse", {
      id: "r",
      goal_id: "goal",
      version: 3,
      movement_id: "w",
      occurred_on: "2026-11-03",
      reason: "Corrigir",
    });
    expect(
      savingsSummary(s.savings_goals[0], s.savings_movements).reserved,
    ).toBe(30000);
    expect(balance(s.accounts[0], s)).toBe(cash);
    expect(s.entries).toEqual([]);
    expect(s.obligations).toEqual([]);
    expect(s.savings_movements.map((m) => m.amount)).toEqual([
      20000, -5000, 5000,
    ]);
  });
  it("recusa acesso alheio, VA, excesso de reserva, versão antiga e retirada acima do separado", () => {
    const s = run(fixture(), "savings_goal", create);
    expect(() =>
      applyPersonal(
        s,
        { type: "savings_goal", payload: { ...create, version: 1 } },
        { id: "b" },
      ),
    ).toThrow(/autorizada/);
    expect(() => run(s, "savings_goal", { ...create, version: 0 })).toThrow(
      /sessão/,
    );
    expect(() =>
      run(s, "savings_goal", { ...create, id: "g2", initial: 100000 }),
    ).toThrow(/saldo/);
    expect(() =>
      run(s, "savings_move", {
        id: "w",
        goal_id: "goal",
        version: 1,
        amount: 20000,
        direction: "withdrawal",
        occurred_on: "2026-11-02",
        reason: "Utilizei",
      }),
    ).toThrow(/retirada/i);
    s.accounts.push({
      id: "va",
      owner_id: "a",
      name: "VA",
      kind: "VA",
      opening: 100000,
      cutoff: "2026-01-01",
    });
    expect(() =>
      run(s, "savings_goal", { ...create, id: "g2", account_id: "va" }),
    ).toThrow(/bancária/);
  });
  it("previsão depende do ritmo líquido e data futura não confirma reserva", () => {
    let s = run(fixture(), "savings_goal", create);
    expect(
      savingsSummary(s.savings_goals[0], s.savings_movements).completion,
    ).toBeNull();
    expect(() =>
      run(s, "savings_move", {
        id: "x",
        goal_id: "goal",
        version: 1,
        amount: 100,
        direction: "deposit",
        occurred_on: "2026-12-01",
        reason: "Futuro",
      }),
    ).toThrow(/futura/);
    s = run(s, "savings_move", {
      id: "x",
      goal_id: "goal",
      version: 1,
      amount: 30000,
      direction: "deposit",
      occurred_on: "2026-11-01",
      reason: "Separado",
    });
    expect(
      savingsSummary(s.savings_goals[0], s.savings_movements),
    ).toMatchObject({
      reserved: 40000,
      missing: 160000,
      pace: 10000,
      completion: "2028-03",
    });
  });
});
