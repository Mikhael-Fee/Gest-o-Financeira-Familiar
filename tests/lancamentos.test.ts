import { describe, expect, it } from "vitest";
import { lerValor, reais } from "../src/dinheiro";
import { nomeMes, resumir, somarMes, type Lancamento } from "../src/lancamentos";
import { lancamentosDemo } from "../src/demo";
import { repositorioDemo } from "../src/repositorio";

const l = (data: string, valor: number, tipo: Lancamento["tipo"], meio: Lancamento["meio"] = "dinheiro"): Lancamento =>
  ({ id: data + valor + tipo + meio, data, descricao: "x", categoria: "Outros", valor, tipo, meio });

describe("lerValor", () => {
  it("entende o jeito brasileiro de escrever dinheiro", () => {
    expect(lerValor("150")).toBe(15000);
    expect(lerValor("150,5")).toBe(15050);
    expect(lerValor("1.234,56")).toBe(123456);
    expect(lerValor("R$ 74,50")).toBe(7450);
    expect(lerValor("1.000")).toBe(100000);
    expect(lerValor("10.5")).toBe(1050);
  });
  it("recusa vazio, zero, negativo e texto", () => {
    for (const v of ["", "0", "0,00", "-5", "abc", "1,234", "1,2,3"]) expect(lerValor(v)).toBeNull();
  });
  it("formata em reais", () => {
    expect(reais(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
});

describe("meses", () => {
  it("avança e volta virando o ano", () => {
    expect(somarMes("2026-12", 1)).toBe("2027-01");
    expect(somarMes("2026-01", -1)).toBe("2025-12");
    expect(nomeMes("2026-11")).toBe("Novembro de 2026");
  });
});

describe("resumir", () => {
  const lista = [
    l("2026-11-05", 320000, "entrada"),
    l("2026-11-06", 50000, "saida"),
    l("2026-11-05", 70000, "entrada", "beneficio"),
    l("2026-11-06", 70000, "saida", "beneficio"),
    l("2026-11-09", 3800, "saida", "beneficio"),
    l("2026-10-30", 99900, "saida"), // outro mês
  ];
  it("separa dinheiro de VR/VA e ignora outros meses", () => {
    expect(resumir(lista, "2026-11")).toEqual({
      entrou: 320000, saiu: 50000, sobra: 270000, noCredito: 0,
      beneficioRecebido: 70000, beneficioGasto: 73800, beneficioSobra: -3800,
    });
  });
  it("mês vazio dá zero", () => {
    expect(resumir(lista, "2027-01").sobra).toBe(0);
  });
});

describe("demonstração", () => {
  it("gera exemplos no mês atual e permite criar, editar e apagar", async () => {
    const hoje = new Date(2026, 10, 18);
    const repo = repositorioDemo(lancamentosDemo("demo-filho", hoje));
    expect((await repo.listar("2026-11")).length).toBe(11);
    await repo.salvar({ data: "2026-11-18", descricao: "Mercado", categoria: "Alimentação", valor: 5000, tipo: "saida", meio: "dinheiro" });
    const depois = await repo.listar("2026-11");
    expect(depois.length).toBe(12);
    const novo = depois.find((x) => x.descricao === "Mercado")!;
    await repo.salvar({ ...novo, valor: 6000 });
    expect((await repo.listar("2026-11")).find((x) => x.id === novo.id)!.valor).toBe(6000);
    await repo.apagar(novo.id);
    expect((await repo.listar("2026-11")).length).toBe(11);
  });
});

describe("compra no cartão de outra pessoa (demonstração)", () => {
  it("a Mãe lança no cartão do Filho e vê em Você deve, não nos lançamentos dela", async () => {
    const hoje = new Date(2026, 10, 18);
    const { devoDemo, cartoesQueUsoDemo } = await import("../src/demo");
    const repo = repositorioDemo([], [], devoDemo("demo-mae", hoje), cartoesQueUsoDemo("demo-mae"));
    const [itau] = await repo.cartoesQueUso();
    expect(itau.dono).toBe("demo-filho");
    await repo.salvarVarios([{ data: "2026-12-02", descricao: "Mercado", categoria: "Compras", valor: 9000, tipo: "saida", meio: "dinheiro", pagamento: "credito", cartaoId: itau.id, deQuem: "demo-mae", dono: "demo-filho" }]);
    expect((await repo.devo()).map((l) => l.descricao)).toContain("Mercado");
    expect(await repo.listar("2026-12")).toHaveLength(0);
  });
});
