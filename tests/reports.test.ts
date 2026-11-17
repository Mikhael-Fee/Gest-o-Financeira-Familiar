import { describe, expect, it } from "vitest";
import { demoState } from "../src/data/store";
import {
  cashReport,
  consumptionReport,
  contributionReport,
  noConsumptionFilters,
  obligationWarnings,
  reportMonths,
} from "../src/domain/reports";
import type { Entry } from "../src/domain/finance";
const asOf = "2026-11-30";
function receipt(
  id: string,
  amount: number,
  kind: Entry["kind"] = "income",
): Entry {
  return {
    id,
    owner_id: "a",
    family_id: "demo",
    description: "Exclusivamente fictício",
    kind,
    amount,
    occurred_on: "2026-11-12",
    salary_month: "2026-10",
    category: "Salário",
    house: false,
    consumer_id: "a",
    responsible_id: null,
    card_id: null,
    splits: [{ account_id: "bank-a", amount }],
    version: 1,
    voided: false,
  };
}
describe("Relatórios sem duplicidade e com privacidade", () => {
  it("titular vê somente seu consumo no relatório pessoal, mesmo com fatura de terceiros", () => {
    const s = demoState();
    expect(
      consumptionReport(
        s,
        "a",
        "personal",
        "2026-11",
        6,
        noConsumptionFilters,
        asOf,
      ).total,
    ).toBe(75000);
    expect(
      consumptionReport(
        s,
        "a",
        "house",
        "2026-11",
        6,
        noConsumptionFilters,
        asOf,
      ).total,
    ).toBe(40000);
    expect(
      consumptionReport(
        s,
        "b",
        "personal",
        "2026-11",
        6,
        noConsumptionFilters,
        asOf,
      ).total,
    ).toBe(65000);
  });
  it("filtro de fonte considera só os 150 em dinheiro de uma compra 250 VA + 150 banco", () => {
    const s = demoState();
    const bank = consumptionReport(
      s,
      "a",
      "personal",
      "2026-11",
      6,
      { ...noConsumptionFilters, source: "account:bank-a" },
      asOf,
    );
    expect(bank.total).toBe(15000);
    expect(bank.categories.map((c) => c.amount)).toEqual([15000]);
    expect(bank.sources.map((c) => c.amount)).toEqual([15000]);
    expect(bank.history.at(-1)?.total).toBe(15000);
    expect(
      consumptionReport(
        s,
        "a",
        "personal",
        "2026-11",
        6,
        { ...noConsumptionFilters, source: "account:va-a" },
        asOf,
      ).total,
    ).toBe(25000);
  });
  it("meios de pagamento fecham com o consumo total sem contar pagamentos de fatura", () => {
    const s = demoState();
    s.payments.push({
      id: "pay",
      obligation_id: "statement-a",
      account_id: "bank-a",
      amount: 20000,
      paid_on: "2026-11-12",
      payer_id: "a",
      key: "pay",
    });
    const r = consumptionReport(
      s,
      "a",
      "personal",
      "2026-11",
      6,
      noConsumptionFilters,
      asOf,
    );
    expect(r.sources.reduce((n, g) => n + g.amount, 0)).toBe(r.total);
    expect(r.total).toBe(75000);
    expect(cashReport(s, "a", "2026-11", 6, asOf).at(-1)?.outgoing).toBe(35000);
  });
  it("anulações e datas futuras não entram em consumo nem caixa confirmado", () => {
    const s = demoState();
    s.entries[0].voided = true;
    s.entries.push({
      ...s.entries[2],
      id: "future",
      occurred_on: "2026-12-02",
      amount: 900000,
    });
    s.entries.push({
      ...receipt("future-income", 900000),
      occurred_on: "2026-12-02",
    });
    expect(
      consumptionReport(
        s,
        "a",
        "personal",
        "2026-11",
        6,
        noConsumptionFilters,
        asOf,
      ).total,
    ).toBe(35000);
    expect(
      consumptionReport(
        s,
        "a",
        "personal",
        "2026-12",
        6,
        noConsumptionFilters,
        asOf,
      ).total,
    ).toBe(0);
    expect(cashReport(s, "a", "2026-12", 6, asOf).at(-1)).toMatchObject({
      incoming: 0,
      outgoing: 0,
    });
  });
  it("caixa usa data efetiva, não competência, e distingue benefício de dinheiro", () => {
    const s = demoState();
    s.entries.push(
      receipt("salary", 200000),
      receipt("loan", 100000, "loan_received"),
      {
        ...receipt("benefit", 50000, "benefit"),
        splits: [{ account_id: "va-a", amount: 50000 }],
      },
    );
    const r = cashReport(s, "a", "2026-11", 6, asOf);
    expect(r.at(-1)).toMatchObject({
      incoming: 300000,
      outgoing: 15000,
      net: 285000,
    });
    expect(r.at(-2)?.incoming).toBe(0);
  });
  it("transferência própria, abertura e conciliação não viram entradas; respeita corte", () => {
    const s = demoState();
    s.entries.push({ ...receipt("before", 99900), occurred_on: "2026-10-31" });
    s.account_movements.push(
      ...["transfer", "reconciliation"].map((kind) => ({
        id: kind,
        owner_id: "a",
        account_id: "bank-a",
        amount: 100000,
        occurred_on: "2026-11-12",
        kind,
        reference_id: kind,
        reason: null,
      })),
    );
    expect(cashReport(s, "a", "2026-11", 6, asOf).at(-1)?.incoming).toBe(0);
    expect(cashReport(s, "a", "2026-11", 6, asOf).at(-2)?.incoming).toBe(0);
  });
  it("acertos e estornos preservam movimentos nas datas, sem apagar o débito original", () => {
    const s = demoState();
    s.payments.push({
      id: "pay",
      obligation_id: "statement-a",
      account_id: "bank-a",
      amount: 10000,
      paid_on: "2026-11-10",
      payer_id: "a",
      key: "pay",
      reversed_on: "2026-11-12",
    });
    s.account_movements.push(
      {
        id: "reversal",
        owner_id: "a",
        account_id: "bank-a",
        amount: 10000,
        occurred_on: "2026-11-12",
        kind: "reversal",
        reference_id: "pay",
        reason: "Correção fictícia",
      },
      {
        id: "pix",
        owner_id: "a",
        account_id: "bank-a",
        amount: 40000,
        occurred_on: "2026-11-12",
        kind: "settlement",
        reference_id: "pix",
        reason: null,
      },
    );
    expect(cashReport(s, "a", "2026-11", 6, asOf).at(-1)).toMatchObject({
      incoming: 50000,
      outgoing: 25000,
      net: 25000,
    });
  });
  it("fonte privada da Casa não revela carteira ou conta de outro membro", () => {
    const s = demoState();
    s.accounts.push({
      id: "private-b",
      owner_id: "b",
      name: "Nome privado",
      kind: "VR",
      opening: 999000,
      cutoff: "2026-11-01",
    });
    s.entries.push({
      ...s.entries[0],
      id: "house-b",
      owner_id: "b",
      consumer_id: "b",
      splits: [{ account_id: "private-b", amount: 40000 }],
    });
    const r = consumptionReport(
      s,
      "a",
      "house",
      "2026-11",
      6,
      { ...noConsumptionFilters, personId: "b" },
      asOf,
    );
    expect(r.total).toBe(40000);
    expect(r.sources).toEqual([
      { key: "private", label: "Fonte privada de outro membro", amount: 40000 },
    ]);
    expect(
      consumptionReport(
        s,
        "a",
        "house",
        "2026-11",
        6,
        { ...noConsumptionFilters, source: "account:private-b" },
        asOf,
      ).total,
    ).toBe(0);
    expect(cashReport(s, "a", "2026-11", 6, asOf).at(-1)?.outgoing).toBe(15000);
  });
  it("metas de outros membros são privadas mesmo se presentes no estado de demonstração", () => {
    const s = demoState();
    s.goals.push({ owner_id: "b", month: "2026-11", amount: 999000 });
    const rows = contributionReport(s, "a", "house", "2026-11", asOf);
    expect(rows.find((r) => r.id === "a")).toMatchObject({
      actual: 40000,
      goal: 60000,
    });
    expect(rows.find((r) => r.id === "b")?.goal).toBeNull();
    expect(
      contributionReport(s, "a", "personal", "2026-11", asOf),
    ).toHaveLength(1);
    s.entries.push({
      ...s.entries[0],
      id: "future-house",
      occurred_on: "2026-12-05",
    });
    expect(
      contributionReport(s, "a", "house", "2026-12", asOf).find(
        (r) => r.id === "a",
      )?.actual,
    ).toBe(0);
  });
  it("dívidas antigas e sem data ficam separadas e renegociação não duplica exigível", () => {
    const s = demoState();
    s.obligations = [
      {
        ...s.obligations[0],
        id: "old",
        confirmed: 0,
        due_on: "2026-10-20",
        replaced_by: "new",
      },
      { ...s.obligations[0], id: "undated", confirmed: 0, due_on: null },
      { ...s.obligations[0], id: "new", confirmed: 0, due_on: "2026-11-20" },
    ];
    expect(obligationWarnings(s, "a", "personal", "2026-11")).toEqual({
      older: 0,
      undated: 20000,
    });
    expect(
      consumptionReport(
        s,
        "a",
        "personal",
        "2026-11",
        6,
        { ...noConsumptionFilters, category: "Alimentação" },
        asOf,
      ).total,
    ).toBe(40000);
  });
  it("comparação inclui meses sem registros e atravessa ano sem deslocar datas", () => {
    expect(reportMonths("2026-02", 3)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(() => reportMonths("2026-99", 6)).toThrow();
    const rows = consumptionReport(
      demoState(),
      "a",
      "personal",
      "2026-11",
      6,
      noConsumptionFilters,
      asOf,
    ).history;
    expect(rows).toHaveLength(6);
    expect(rows[0].total).toBe(0);
    expect(rows.at(-1)?.total).toBe(75000);
  });
});
