import { describe, expect, it } from "vitest";
import { FILTRO_VAZIO, filtrar, porMes } from "../src/busca";
import type { Lancamento } from "../src/lancamentos";

const l = (id: string, data: string, descricao: string, categoria: string, extra: Partial<Lancamento> = {}): Lancamento =>
  ({ id, data, descricao, categoria, valor: 1000, tipo: "saida", meio: "dinheiro", ...extra });
const lista = [
  l("a", "2026-11-05", "Farmácia São João", "Saúde", { cartaoId: "itau", pagamento: "credito" }),
  l("b", "2026-10-02", "Mercado", "Alimentação"),
  l("c", "2026-11-01", "Salário", "Salário", { tipo: "entrada" }),
  l("d", "2026-09-10", "farmacia do bairro", "Saúde"),
];

describe("busca", () => {
  it("texto sem acento nem maiúscula, mais recente primeiro", () => {
    expect(filtrar(lista, { ...FILTRO_VAZIO, texto: "FARMACIA" }).map((x) => x.id)).toEqual(["a", "d"]);
    expect(filtrar(lista, { ...FILTRO_VAZIO, texto: "farmácia joão" }).map((x) => x.id)).toEqual(["a"]);
  });
  it("filtros de tipo, categoria e cartão", () => {
    expect(filtrar(lista, { ...FILTRO_VAZIO, tipo: "entrada" }).map((x) => x.id)).toEqual(["c"]);
    expect(filtrar(lista, { ...FILTRO_VAZIO, categoria: "Saúde" }).map((x) => x.id)).toEqual(["a", "d"]);
    expect(filtrar(lista, { ...FILTRO_VAZIO, cartaoId: "itau" }).map((x) => x.id)).toEqual(["a"]);
    expect(filtrar(lista, { ...FILTRO_VAZIO, cartaoId: "sem", categoria: "Saúde" }).map((x) => x.id)).toEqual(["d"]);
  });
  it("agrupa por mês com totais", () => {
    expect(porMes(filtrar(lista, FILTRO_VAZIO)).map((g) => [g.mes, g.entrou, g.saiu])).toEqual([["2026-11", 1000, 1000], ["2026-10", 0, 1000], ["2026-09", 0, 1000]]);
  });
});
