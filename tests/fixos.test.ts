import { describe, expect, it } from "vitest";
import { lancamentoDoFixo, pendentesDoMes, situacaoLimites, type Recorrente } from "../src/fixos";
import type { Cartao } from "../src/cartoes";

const fixo = (id: string, extra: Partial<Recorrente> = {}): Recorrente => ({
  id, descricao: id, categoria: "Outros", valor: 1000, tipo: "saida", meio: "dinheiro", pagamento: null, cartaoId: null, dia: 10, desde: "2026-11", ativo: true, ...extra,
});
const nubank: Cartao = { id: "nu", banco: "Nubank", apelido: null, temCredito: true, temDebito: false, diaFechamento: 3, diaVencimento: 10 };

describe("lançamentos fixos", () => {
  it("pendentes: ativos, desde o mês de início, ainda não lançados, nunca no futuro", () => {
    const fixos = [fixo("a", { dia: 20 }), fixo("b", { dia: 5 }), fixo("c", { ativo: false }), fixo("d", { desde: "2026-12" })];
    expect(pendentesDoMes(fixos, ["a"], "2026-11", "2026-11").map((f) => f.id)).toEqual(["b"]);
    expect(pendentesDoMes(fixos, [], "2026-12", "2026-11")).toEqual([]);
    expect(pendentesDoMes(fixos, [], "2026-10", "2026-11")).toEqual([]);
  });
  it("no dinheiro, cai no dia do mês (ajustando meses curtos)", () => {
    const l = lancamentoDoFixo(fixo("a", { dia: 31 }), "2027-02");
    expect(l.data).toBe("2027-02-28");
    expect(l.recorrenteMes).toBe("2027-02");
  });
  it("no crédito, cai na fatura certa e guarda o dia da compra", () => {
    const l = lancamentoDoFixo(fixo("s", { dia: 15, pagamento: "credito", cartaoId: "nu" }), "2026-11", nubank);
    expect(l).toMatchObject({ data: "2026-12-10", dataCompra: "2026-11-15", pagamento: "credito", cartaoId: "nu", recorrenteId: "s" });
  });
});

describe("limites", () => {
  it("ok abaixo de 80%, perto a partir de 80%, passou acima de 100%", () => {
    const s = situacaoLimites({ A: 10000, B: 10000, C: 10000, D: 5000 }, [{ categoria: "A", valor: 5000 }, { categoria: "B", valor: 8000 }, { categoria: "C", valor: 12000 }]);
    expect(s.map((x) => [x.categoria, x.estado])).toEqual([["C", "passou"], ["B", "perto"], ["A", "ok"], ["D", "ok"]]);
  });
});
