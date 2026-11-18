import { describe, expect, it } from "vitest";
import { compromissos, gastosPorCategoria, maioresGastos, sobraPorMes } from "../src/resumo";
import type { Lancamento } from "../src/lancamentos";

let n = 0;
const l = (data: string, categoria: string, valor: number, extra: Partial<Lancamento> = {}): Lancamento => ({
  id: `l${++n}`, data, descricao: categoria, categoria, valor, tipo: "saida", meio: "dinheiro", ...extra,
});
const lista: Lancamento[] = [
  l("2026-11-05", "Salário", 300000, { tipo: "entrada" }),
  l("2026-11-06", "Alimentação", 20000),
  l("2026-11-07", "Alimentação", 5000),
  l("2026-11-08", "Transporte", 10000),
  l("2026-11-09", "Alimentação", 9000, { meio: "beneficio" }),
  l("2026-11-10", "Saúde", 15000, { pagamento: "credito", deQuem: "mae" }),
  l("2026-10-06", "Alimentação", 30000),
  l("2026-10-05", "Salário", 300000, { tipo: "entrada" }),
  l("2026-12-10", "Compras", 8600, { pagamento: "credito", parcela: 8, parcelas: 10 }),
  l("2027-01-10", "Compras", 8600, { pagamento: "credito", parcela: 9, parcelas: 10 }),
];

describe("resumo", () => {
  it("soma por categoria só o dinheiro da própria pessoa e compara com o mês anterior", () => {
    expect(gastosPorCategoria(lista, "2026-11")).toEqual([
      { categoria: "Alimentação", valor: 25000, anterior: 30000 },
      { categoria: "Transporte", valor: 10000, anterior: 0 },
    ]);
  });
  it("maiores gastos ignoram VR e compras de outros", () => {
    expect(maioresGastos(lista, "2026-11").map((x) => x.valor)).toEqual([20000, 10000, 5000]);
  });
  it("sobra dos últimos meses", () => {
    expect(sobraPorMes(lista, "2026-11", 3)).toEqual([
      { mes: "2026-09", valor: 0 },
      { mes: "2026-10", valor: 270000 },
      { mes: "2026-11", valor: 300000 - 35000 - 15000 },
    ]);
  });
  it("compromissos dos próximos meses vêm das parcelas já lançadas", () => {
    expect(compromissos(lista, "2026-11", 3).map((c) => c.valor)).toEqual([8600, 8600, 0]);
  });
});
