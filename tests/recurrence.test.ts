import { describe, expect, it } from "vitest";
import {
  cadences,
  recurrenceDate,
  purchaseSummary,
  variableEstimate,
  applyRecurrenceCommand,
} from "../src/domain/recurrence";
import { demoState, demoIdentity } from "../src/data/store";

describe("calendário de recorrências", () => {
  it("preserva âncora de mês, ano bissexto e intervalos maiores", () => {
    expect(recurrenceDate("2028-01-31", 1)).toBe("2028-02-29");
    expect(recurrenceDate("2028-01-31", 2)).toBe("2028-03-31");
    expect(recurrenceDate("2027-01-31", 1, "months", 2)).toBe("2027-03-31");
    expect(recurrenceDate("2028-02-29", 1, "months", 12)).toBe("2029-02-28");
    expect(cadences.map((c) => c.name)).toHaveLength(7);
  });
  it("semanal e quinzenal usam dias civis e cruzam meses sem repetir vencimento", () => {
    expect(recurrenceDate("2026-12-28", 1, "days", 7)).toBe("2027-01-04");
    expect(recurrenceDate("2026-02-20", 1, "days", 15)).toBe("2026-03-07");
    expect(() => recurrenceDate("2026-01-01", 1, "days", 0)).toThrow();
  });
  it("demonstração amplia calendário de forma determinística sem duplicar", () => {
    const command = {
      key: "r1",
      type: "recurrence_v2",
      payload: {
        id: "rec1",
        description: "Seguro",
        amount: 10000,
        date: "2027-01-31",
        interval_unit: "months",
        interval_count: 2,
        count: 4,
      },
    };
    const s = applyRecurrenceCommand(demoState(), command, demoIdentity)!;
    const next = applyRecurrenceCommand(
      s,
      {
        key: "r2",
        type: "generate_v2",
        payload: { id: "rec1", version: 1, count: 7 },
      },
      demoIdentity,
    )!;
    const again = applyRecurrenceCommand(
      next,
      {
        key: "r3",
        type: "generate_v2",
        payload: { id: "rec1", version: 1, count: 7 },
      },
      demoIdentity,
    )!;
    expect(
      again.obligations.filter((o) => o.recurrence_id === "rec1"),
    ).toHaveLength(7);
    expect(again.obligations.find((o) => o.id === "rec1:6")?.due_on).toBe(
      "2028-01-31",
    );
  });
  it("estima conta variável pela mediana recente e ignora valores não conferidos", () => {
    const s = applyRecurrenceCommand(
      demoState(),
      {
        key: "r",
        type: "recurrence_v2",
        payload: {
          id: "r",
          description: "Energia",
          amount: 20000,
          date: "2026-01-01",
          variable: true,
          count: 5,
        },
      },
      demoIdentity,
    )!;
    [10000, 11000, 90000].forEach((amount, i) => {
      const o = s.obligations.find((o) => o.id === `r:${i}`)!;
      o.amount = amount;
      o.unknown = false;
    });
    expect(variableEstimate(s, "r", "2026-06-01", 20000)).toBe(11000);
  });
  it("soma prestações diferentes sem inferir taxa ou preço desconhecido", () => {
    expect(purchaseSummary([13000, 13000, 14000], 30000)).toEqual({
      total: 40000,
      original: 30000,
      difference: 10000,
    });
    expect(purchaseSummary([13000])).toEqual({
      total: 13000,
      original: null,
      difference: null,
    });
    expect(() => purchaseSummary([0])).toThrow();
  });
});
