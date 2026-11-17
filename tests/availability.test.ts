import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  emptyState,
  balance,
  type Entry,
  type Obligation,
  type State,
} from "../src/domain/finance";
import {
  historicalSalary,
  availableMoney,
  expectedSalaryDate,
  nextSalaryDate,
  type IncomePlanningState,
} from "../src/domain/availability";
import { applyIncomePlanning } from "../src/data/incomePlanning";
import { apply } from "../src/data/store";
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T15:00:00Z"));
});
afterAll(() => vi.useRealTimers());
function state(): IncomePlanningState {
  const s = emptyState() as IncomePlanningState;
  s.profiles = [
    {
      id: "a",
      family_id: "f",
      name: "Fictícia A",
      role: "admin",
      active: true,
    },
    {
      id: "b",
      family_id: "f",
      name: "Fictícia B",
      role: "member",
      active: true,
    },
  ];
  s.accounts = [
    {
      id: "bank",
      owner_id: "a",
      name: "Banco A",
      kind: "bank",
      opening: 100000,
      cutoff: "2026-01-01",
    },
    {
      id: "va",
      owner_id: "a",
      name: "VA",
      kind: "VA",
      opening: 50000,
      cutoff: "2026-01-01",
    },
    {
      id: "private",
      owner_id: "b",
      name: "Banco B",
      kind: "bank",
      opening: 999999,
      cutoff: "2026-01-01",
    },
  ];
  s.income_settings = [{ owner_id: "a", base: 250000, payday: 5 }];
  return s;
}
function entry(month: string, amount: number, extra = false): Entry {
  return {
    id: crypto.randomUUID(),
    owner_id: "a",
    family_id: "f",
    description: "Fictício",
    kind: "income",
    amount,
    occurred_on: month + "-05",
    salary_month: month,
    income_type: extra ? "extra" : "salary",
    category: "Salário",
    house: false,
    consumer_id: "a",
    responsible_id: null,
    card_id: null,
    splits: [],
    version: 1,
    voided: false,
  };
}
function obligation(
  id: string,
  amount: number,
  on: string | null,
  owner = "a",
): Obligation {
  return {
    id,
    owner_id: owner,
    family_id: "f",
    description: "Fictícia",
    amount,
    due_on: on,
    house: false,
    confirmed: 0,
    unknown: false,
    plan_id: null,
    number: null,
    card_id: null,
    replaced_by: null,
    version: 1,
  };
}
const user = { id: "a", family_id: "f", name: "Fictícia A" };
function command(
  s: State,
  type: string,
  payload: Record<string, unknown>,
  key = crypto.randomUUID(),
) {
  return applyIncomePlanning(s, { type, payload, key }, user, (st, e, k) =>
    apply(st, { type: "entry", payload: e, key: k }, user),
  ) as IncomePlanningState;
}
describe("previsão histórica robusta", () => {
  it("reconhece aumento recorrente acima da base e exclui bônus classificado", () => {
    const s = state();
    s.entries = [
      entry("2026-07", 280000),
      entry("2026-08", 280000),
      entry("2026-09", 280000),
      entry("2026-10", 400000, true),
    ];
    expect(historicalSalary(s, "a", "2026-11").amount).toBe(280000);
    expect(historicalSalary(s, "a", "2026-11").months).toHaveLength(3);
  });
  it("bônus alto não classificado e aumento isolado não substituem padrão recente", () => {
    const s = state();
    s.entries = [
      entry("2026-07", 250000),
      entry("2026-08", 250000),
      entry("2026-09", 250000),
      entry("2026-10", 400000),
    ];
    expect(historicalSalary(s, "a", "2026-11").amount).toBe(250000);
    s.entries = [
      entry("2026-05", 250000),
      entry("2026-06", 250000),
      entry("2026-07", 250000),
      entry("2026-08", 280000),
      entry("2026-09", 280000),
      entry("2026-10", 280000),
    ];
    expect(historicalSalary(s, "a", "2026-11").amount).toBe(280000);
  });
  it("competência é independente do caixa, meses faltantes não viram zero e histórico curto usa base", () => {
    const s = state();
    s.entries = [
      { ...entry("2026-07", 280000), occurred_on: "2026-08-05" },
      entry("2026-09", 280000),
      entry("2026-10", 280000),
    ];
    expect(historicalSalary(s, "a", "2026-11").amount).toBe(280000);
    expect(historicalSalary(s, "a", "2026-11").method).toContain("lacunas");
    s.entries = s.entries.slice(0, 2);
    expect(historicalSalary(s, "a", "2026-11").amount).toBe(250000);
    expect(historicalSalary(s, "a", "2026-11").sufficient).toBe(false);
  });
  it("ignora outros usuários, anulados, meses antigos e competência futura", () => {
    const s = state();
    s.entries = [
      { ...entry("2026-10", 900000), owner_id: "b" },
      { ...entry("2026-09", 900000), voided: true },
      entry("2026-02", 900000),
      entry("2026-12", 900000),
    ];
    expect(historicalSalary(s, "a", "2026-11").amount).toBe(250000);
  });
  it("preserva dia 31 ajustando fevereiro e aceita data específica fora da competência", () => {
    const s = state();
    s.income_settings[0].payday = 31;
    expect(expectedSalaryDate(s, "a", "2028-02")).toBe("2028-02-29");
    s.income_months = [
      {
        owner_id: "a",
        month: "2026-11",
        expected: 250000,
        version: 1,
        ...{ expected_on: "2026-12-05" },
      },
    ];
    expect(expectedSalaryDate(s, "a", "2026-11")).toBe("2026-12-05");
    expect(nextSalaryDate(s, "a", "2026-11-16")).toBe("2026-12-05");
  });
});
describe("dinheiro disponível sem dupla contagem", () => {
  it("deduz somente saldo aberto e considera pagamento já debitado uma vez", () => {
    const s = state();
    s.obligations = [obligation("bill", 30000, "2026-11-20")];
    s.payments = [
      {
        id: "p",
        obligation_id: "bill",
        account_id: "bank",
        payer_id: "a",
        amount: 10000,
        paid_on: "2026-11-15",
        key: "p",
      },
    ];
    const r = availableMoney(s, "a", "2026-11-30");
    expect(r.bank).toBe(90000);
    expect(r.obligations).toBe(20000);
    expect(r.free).toBe(70000);
    expect(r.benefits).toBe(50000);
  });
  it("reserva de obrigação dentro do horizonte não desconta duas vezes e reserva distante reduz livre", () => {
    const s = state();
    s.obligations = [
      obligation("bill", 30000, "2026-11-20"),
      obligation("future", 20000, "2027-01-05"),
    ];
    s.obligation_reservations = [
      {
        obligation_id: "bill",
        account_id: "bank",
        owner_id: "a",
        amount: 20000,
        version: 1,
      },
      {
        obligation_id: "future",
        account_id: "bank",
        owner_id: "a",
        amount: 10000,
        version: 1,
      },
    ];
    const r = availableMoney(s, "a", "2026-11-30");
    expect(r.reservedBills).toBe(20000);
    expect(r.reservedOutsideHorizon).toBe(10000);
    expect(r.free).toBe(60000);
  });
  it("não presume obrigação alheia/Casa como dívida pessoal, nem lê reservas e saldos de B", () => {
    const s = state();
    s.obligations = [
      { ...obligation("house", 50000, "2026-11-20", "b"), house: true },
    ];
    s.obligation_reservations = [
      {
        obligation_id: "house",
        account_id: "private",
        owner_id: "b",
        amount: 10000,
        version: 1,
      },
    ];
    s.savings_goals = [
      {
        id: "goal-b",
        owner_id: "b",
        initial: 90000,
        account_id: "private",
        active: true,
        name: "Fictícia",
        kind: "savings",
        target: 100000,
        due_on: null,
        version: 1,
        created_on: "2026-01-01",
      },
    ];
    expect(availableMoney(s, "a", "2026-11-30").free).toBe(100000);
    expect(availableMoney(s, "a", "2026-11-30").unassignedHouse).toBe(50000);
  });
  it("dívida renegociada soma zero, vencidos persistem e sem data torna estimativa incompleta", () => {
    const s = state();
    s.obligations = [
      { ...obligation("old", 80000, "2026-10-01"), replaced_by: "new" },
      { ...obligation("new", 85000, "2026-11-15"), card_id: "c" },
      obligation("undated", 20000, null),
    ];
    const r = availableMoney(s, "a", "2026-11-30");
    expect(r.overdue).toBe(85000);
    expect(r.invoices).toBe(85000);
    expect(r.undated).toBe(20000);
    expect(r.free).toBe(15000);
    expect(r.incomplete).toBe(true);
  });
  it("metas reservam apenas dinheiro vinculado e nunca fabricam saldo", () => {
    const s = state();
    s.savings_goals = [
      {
        id: "reserve",
        owner_id: "a",
        initial: 15000,
        account_id: "bank",
        active: true,
        name: "Fictícia",
        kind: "savings",
        target: 100000,
        due_on: null,
        version: 1,
        created_on: "2026-01-01",
      },
      {
        id: "unlinked",
        owner_id: "a",
        initial: 10000,
        account_id: null,
        active: true,
        name: "Fictícia",
        kind: "savings",
        target: 100000,
        due_on: null,
        version: 1,
        created_on: "2026-01-01",
      },
    ];
    s.savings_movements = [
      {
        id: crypto.randomUUID(),
        reason: "Fictício",
        reverse_of: null,
        goal_id: "reserve",
        owner_id: "a",
        amount: 5000,
        occurred_on: "2026-11-10",
      },
      {
        id: crypto.randomUUID(),
        reason: "Fictício",
        reverse_of: null,
        goal_id: "reserve",
        owner_id: "a",
        amount: -1000,
        occurred_on: "2026-11-12",
      },
      {
        id: crypto.randomUUID(),
        reason: "Fictício",
        reverse_of: null,
        goal_id: "reserve",
        owner_id: "a",
        amount: 90000,
        occurred_on: "2026-12-01",
      },
    ];
    const r = availableMoney(s, "a", "2026-11-30");
    expect(r.bank).toBe(100000);
    expect(r.savings).toBe(19000);
    expect(r.free).toBe(81000);
    expect(r.unlinkedSavings).toBe(10000);
  });
  it("receita futura não altera banco, benefício previsto fica separado e salário previsto não duplica", () => {
    let s = state();
    s = command(s, "future_receipt", {
      id: "f",
      version: 0,
      description: "Salário dezembro",
      amount: 280000,
      expected_on: "2026-12-05",
      month: "2026-12",
      kind: "salary",
      certainty: "committed",
      account_id: "bank",
    });
    s = command(s, "future_receipt", {
      id: "va-f",
      version: 0,
      description: "VA dezembro",
      amount: 50000,
      expected_on: "2026-12-05",
      month: "2026-12",
      kind: "benefit",
      certainty: "expected",
      account_id: "va",
    });
    const r = availableMoney(s, "a", "2026-12-20");
    expect(r.bank).toBe(100000);
    expect(r.committedIncome).toBe(280000);
    expect(r.expectedIncome).toBe(0);
    expect(r.projectedCommitted).toBe(380000);
  });
});
describe("confirmações explícitas e planejamento de caixa", () => {
  it("confirma entrada somente na própria conta e substitui uma previsão sem recebimento fictício", () => {
    let s = state();
    s = command(s, "future_receipt", {
      id: "f",
      version: 0,
      description: "Salário novembro",
      amount: 250000,
      expected_on: "2026-11-15",
      month: "2026-11",
      kind: "salary",
      certainty: "expected",
      account_id: null,
    });
    expect(balance(s.accounts[0], s)).toBe(100000);
    const n = command(s, "confirm_future_receipt", {
      id: "f",
      version: 1,
      date: "2026-11-15",
      amount: 260000,
      account_id: "bank",
    });
    expect(balance(n.accounts[0], n)).toBe(360000);
    expect(n.future_receipts?.[0].status).toBe("received");
    expect(n.entries.filter((e) => e.kind === "income")).toHaveLength(1);
    expect(availableMoney(n, "a", "2026-11-30").expectedIncome).toBe(0);
    expect(() =>
      command(n, "confirm_future_receipt", {
        id: "f",
        version: 1,
        date: "2026-11-15",
        account_id: "bank",
      }),
    ).toThrow();
  });
  it("nega benefício no banco, salário em VA, datas futuras e alteração concorrente", () => {
    let s = state();
    expect(() =>
      command(s, "future_receipt", {
        id: "f",
        version: 0,
        description: "VA",
        amount: 100,
        expected_on: "2026-11-15",
        month: "2026-11",
        kind: "benefit",
        certainty: "expected",
        account_id: "bank",
      }),
    ).toThrow();
    s = command(s, "future_receipt", {
      id: "f",
      version: 0,
      description: "Salário",
      amount: 100,
      expected_on: "2026-11-15",
      month: "2026-11",
      kind: "salary",
      certainty: "expected",
      account_id: "bank",
    });
    expect(() =>
      command(s, "confirm_future_receipt", {
        id: "f",
        version: 1,
        date: "2026-11-17",
        account_id: "bank",
      }),
    ).toThrow();
    expect(() =>
      command(s, "confirm_future_receipt", {
        id: "f",
        version: 1,
        date: "2026-11-15",
        account_id: "va",
      }),
    ).toThrow();
    expect(() =>
      command(s, "future_receipt", { ...s.future_receipts![0], version: 0 }),
    ).toThrow();
  });
  it("conferência não muda saldo e nega falsa confirmação antes de conciliar", () => {
    const s = state();
    expect(() =>
      command(s, "account_check", {
        account_id: "bank",
        date: "2026-11-16",
        confirmed_balance: 90000,
        version: 0,
      }),
    ).toThrow();
    const n = command(s, "account_check", {
      account_id: "bank",
      date: "2026-11-16",
      confirmed_balance: 100000,
      version: 0,
    });
    expect(balance(n.accounts[0], n)).toBe(100000);
    expect(availableMoney(n, "a", "2026-11-30").staleAccounts).toHaveLength(0);
  });
});
