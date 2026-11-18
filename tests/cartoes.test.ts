import { describe, expect, it } from "vitest";
import { diaDoMes, gerarParcelas, vencimentoDaCompra } from "../src/cartoes";

describe("vencimentoDaCompra", () => {
  it("fecha dia 3, vence dia 10: compra antes do fechamento cai na fatura deste mês", () => {
    expect(vencimentoDaCompra("2026-11-02", 3, 10)).toBe("2026-11-10");
  });
  it("no dia do fechamento ou depois, vai para a próxima fatura", () => {
    expect(vencimentoDaCompra("2026-11-03", 3, 10)).toBe("2026-12-10");
    expect(vencimentoDaCompra("2026-11-18", 3, 10)).toBe("2026-12-10");
  });
  it("fecha dia 28, vence dia 5 do mês seguinte", () => {
    expect(vencimentoDaCompra("2026-11-18", 28, 5)).toBe("2026-12-05");
    expect(vencimentoDaCompra("2026-11-29", 28, 5)).toBe("2027-01-05");
  });
  it("vira o ano e ajusta meses curtos", () => {
    expect(vencimentoDaCompra("2026-12-20", 10, 17)).toBe("2027-01-17");
    // fecha dia 30 e vence dia 25: em fevereiro o fechamento vira dia 28
    expect(vencimentoDaCompra("2027-02-27", 30, 25)).toBe("2027-03-25");
    expect(vencimentoDaCompra("2027-02-28", 30, 25)).toBe("2027-04-25");
    expect(diaDoMes(2028, 2, 31)).toBe("2028-02-29");
  });
});

describe("gerarParcelas", () => {
  it("compra nova em 3x: uma parcela por fatura", () => {
    expect(gerarParcelas("2026-12-10", 10, 1, 3)).toEqual([
      { parcela: 1, parcelas: 3, data: "2026-12-10" },
      { parcela: 2, parcelas: 3, data: "2027-01-10" },
      { parcela: 3, parcelas: 3, data: "2027-02-10" },
    ]);
  });
  it("parcelamento em andamento 7 de 10: cria só da 7 à 10", () => {
    const p = gerarParcelas("2026-11-10", 10, 7, 10);
    expect(p.map((x) => `${x.parcela}/${x.parcelas} ${x.data}`)).toEqual([
      "7/10 2026-11-10", "8/10 2026-12-10", "9/10 2027-01-10", "10/10 2027-02-10",
    ]);
  });
  it("à vista no crédito é 1 de 1", () => {
    expect(gerarParcelas("2026-12-05", 5, 1, 1)).toHaveLength(1);
  });
});
