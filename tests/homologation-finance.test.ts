import { beforeAll, afterAll, vi, it, expect } from "vitest";
import {
  demoState,
  demoIdentity,
  apply,
  DemoRepository,
} from "../src/data/store";
import {
  incomeForMonth,
  forecast,
  balance,
  schedule,
  status,
  remaining,
  type Plan,
} from "../src/domain/finance";
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-31T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());
it("ajuste mensal de previsão não altera caixa nem meses vizinhos", () => {
  const s = demoState();
  s.income_settings = [{ owner_id: "a", base: 300000, payday: 5 }];
  const n = apply(
    s,
    {
      key: "monthly",
      type: "income_month",
      payload: {
        month: "2026-11",
        expected: 280000,
        future: false,
        version: 0,
      },
    },
    demoIdentity,
  );
  expect(balance(s.accounts[0], n)).toBe(balance(s.accounts[0], s));
  expect(incomeForMonth(n, "a", "2026-10").expected).toBe(300000);
  expect(incomeForMonth(n, "a", "2026-11").expected).toBe(280000);
  expect(incomeForMonth(n, "a", "2026-12").expected).toBe(300000);
});
it("referência futura preserva passado e ajustes específicos, inclusive zero", () => {
  let s = demoState();
  s.income_settings = [{ owner_id: "a", base: 300000, payday: 5 }];
  s = apply(
    s,
    {
      key: "zero",
      type: "income_month",
      payload: { month: "2026-12", expected: 0, version: 0 },
    },
    demoIdentity,
  );
  s = apply(
    s,
    {
      key: "future",
      type: "income_month",
      payload: {
        month: "2026-11",
        expected: 350000,
        future: true,
        version: 0,
        reference_version: 0,
      },
    },
    demoIdentity,
  );
  expect(incomeForMonth(s, "a", "2026-10").expected).toBe(300000);
  expect(incomeForMonth(s, "a", "2026-11").expected).toBe(350000);
  expect(incomeForMonth(s, "a", "2026-12").expected).toBe(0);
  expect(incomeForMonth(s, "a", "2027-01").expected).toBe(350000);
});
it("salário por competência substitui previsão sem mudar a data física do caixa; correção não duplica", async () => {
  const repo = new DemoRepository();
  let s = await repo.load();
  s = apply(
    s,
    {
      key: "salary",
      type: "entry",
      payload: {
        id: "salary",
        description: "Salário",
        kind: "income",
        income_type: "salary",
        salary_month: "2026-10",
        amount: 220000,
        occurred_on: "2026-11-05",
        category: "Salário",
        house: false,
        consumer_id: "a",
        responsible_id: null,
        card_id: null,
        splits: [{ account_id: "bank-a", amount: 220000 }],
      },
    },
    demoIdentity,
  );
  expect(incomeForMonth(s, "a", "2026-10", 300000).income).toBe(220000);
  expect(incomeForMonth(s, "a", "2026-11", 300000).income).toBe(300000);
  const before = balance(s.accounts[0], s);
  const n = apply(
    s,
    {
      key: "edit",
      type: "income_edit",
      payload: {
        id: "salary",
        version: 1,
        amount: 230000,
        occurred_on: "2026-11-05",
        salary_month: "2026-10",
        account_id: "bank-a",
      },
    },
    demoIdentity,
  );
  expect(n.entries.filter((e) => e.id === "salary")).toHaveLength(1);
  expect(balance(n.accounts[0], n) - before).toBe(10000);
  expect(incomeForMonth(n, "a", "2026-10", 300000).income).toBe(230000);
});
it("simulação manual não modifica referências salvas e não substitui recebimento confirmado", () => {
  let s = demoState();
  s = apply(
    s,
    {
      key: "month",
      type: "income_month",
      payload: { month: "2026-11", expected: 350000, version: 0 },
    },
    demoIdentity,
  );
  expect(forecast(s, "2026-11", 200000, 1, "a")[0].income).toBe(350000);
  expect(forecast(s, "2026-11", 200000, 1, "a", false)[0].income).toBe(200000);
  expect(s.income_months[0].expected).toBe(350000);
});
const partial: Plan = {
  id: "partial",
  owner_id: "a",
  description: "Contrato parcial",
  first_due: null,
  next_due: "2026-11-20",
  next_number: 9,
  count: 10,
  amount: 20000,
  last_paid: 8,
  last_paid_on: "2026-10-20",
  history_confirmed: false,
  payoff: null,
  kind: "loan",
};
it("primeira data desconhecida não fabrica vencimentos antigos", () => {
  const rows = schedule(partial, "demo");
  expect(rows.slice(0, 8).map((o) => o.due_on)).toEqual(Array(8).fill(null));
  expect(rows[8].due_on).toBe("2026-11-20");
  expect(rows[9].due_on).toBe("2026-12-20");
  expect(rows[7].confirmed).toBe(20000);
  expect(rows.slice(0, 7).every((o) => o.unknown)).toBe(true);
  expect(status(rows[0], [])).toContain("desconhecido");
});
it("calendário parcial exige número e vencimento da âncora, sem presumir próxima paga", () => {
  expect(() => schedule({ ...partial, next_number: null }, "demo")).toThrow();
  expect(() => schedule({ ...partial, next_due: null }, "demo")).toThrow();
  const rows = schedule(
    { ...partial, last_paid: 9, next_number: 8, next_due: "2026-10-20" },
    "demo",
  );
  expect(remaining(rows[7], [])).toBe(20000);
  expect(remaining(rows[8], [])).toBe(0);
});
it("última paga desconhecida não é convertida em pagamentos ou saídas de caixa", () => {
  const s = demoState();
  const n = apply(
    s,
    {
      key: "partial",
      type: "plan",
      payload: {
        ...partial,
        last_paid: 0,
        last_paid_on: null,
        last_paid_known: false,
      },
    },
    demoIdentity,
  );
  expect(n.payments).toHaveLength(0);
  expect(
    n.obligations
      .filter((o) => o.plan_id === "partial")
      .every((o) => o.confirmed === 0),
  ).toBe(true);
  expect(balance(n.accounts[0], n)).toBe(balance(s.accounts[0], s));
});
