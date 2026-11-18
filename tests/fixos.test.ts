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

describe("média e saldo acumulado", () => {
  it("fixo pela média usa os últimos 3 meses antes do mês", async () => {
    const { valorSugerido } = await import("../src/fixos");
    const f = fixo("x", { valor: 40000, usarMedia: true });
    const h = { x: [{ mes: "2026-07", valor: 10000 }, { mes: "2026-08", valor: 30000 }, { mes: "2026-09", valor: 45000 }, { mes: "2026-10", valor: 60000 }, { mes: "2026-11", valor: 1 }] };
    expect(valorSugerido(f, h, "2026-11")).toEqual({ valor: 45000, media: true, meses: 3 });
    expect(valorSugerido(f, {}, "2026-11")).toEqual({ valor: 40000, media: false, meses: 0 });
    expect(valorSugerido({ ...f, usarMedia: false }, h, "2026-11").valor).toBe(40000);
  });
  it("saldo acumulado = saldo inicial + sobras em dinheiro desde o mês dele", async () => {
    const { saldoAcumulado } = await import("../src/fixos");
    const l = (data: string, valor: number, tipo: "entrada" | "saida", meio: "dinheiro" | "beneficio" = "dinheiro") =>
      ({ id: data + valor, data, descricao: "", categoria: "", valor, tipo, meio });
    const lista = [l("2026-08-05", 99999, "entrada"), l("2026-09-05", 300000, "entrada"), l("2026-09-10", 100000, "saida"), l("2026-10-05", 300000, "entrada"), l("2026-10-08", 70000, "saida", "beneficio"), l("2026-11-05", 50000, "saida")];
    expect(saldoAcumulado(lista, { mes: "2026-09", valor: 120000 }, "2026-10")).toBe(120000 + 200000 + 300000);
    expect(saldoAcumulado(lista, null, "2026-11")).toBe(99999 + 200000 + 300000 - 50000);
  });
});
