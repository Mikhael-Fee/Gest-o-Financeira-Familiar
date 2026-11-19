import { describe, expect, it } from "vitest";
import { datasDoLancamento } from "../src/cartoes";
import { resumirCasa, type DadosCasa } from "../src/casa";
import { repositorioCasaDemo } from "../src/repositorioCasa";
import type { Perfil } from "../src/tipos";

const cartao = { diaFechamento: 3, diaVencimento: 10 };

describe("editar uma compra à vista no crédito", () => {
  it("mantém a compra na fatura certa (não volta para o mês da compra)", () => {
    // Comprou dia 18/11, fatura vence 10/12: continua contando em dezembro.
    expect(datasDoLancamento("2026-11-18", true, cartao)).toEqual({ data: "2026-12-10", dataCompra: "2026-11-18" });
  });
  it("mudar a data da compra muda a fatura", () => {
    expect(datasDoLancamento("2026-11-02", true, cartao)).toEqual({ data: "2026-11-10", dataCompra: "2026-11-02" });
  });
  it("trocar para dinheiro ou débito usa o próprio dia", () => {
    expect(datasDoLancamento("2026-11-18", false, cartao)).toEqual({ data: "2026-11-18", dataCompra: null });
  });
});

describe("Casa: contas atrasadas", () => {
  const perfis: Perfil[] = [{ id: "pai", nome: "Pai", papel: "responsavel" }];
  const conta = (id: string, data: string, status: "a_pagar" | "paga") => ({ id, data, descricao: id, valor: 10000, meio: "dinheiro" as const, status, pagaPor: null });

  it("conta de um mês anterior que não foi paga continua em Contas a pagar", () => {
    const dados: DadosCasa = { ajudas: [], combinados: [], despesas: [conta("luz", "2026-11-10", "a_pagar")], atrasadas: [conta("agua", "2026-10-15", "a_pagar")] };
    const r = resumirCasa(dados, perfis, "2026-11");
    expect(r.aPagar).toBe(20000);
    expect(r.caixaDinheiro).toBe(0);
  });

  it("a demonstração devolve só as atrasadas ainda não pagas", async () => {
    const repo = repositorioCasaDemo({ ajudas: [], combinados: [], despesas: [conta("agua", "2026-10-15", "a_pagar"), conta("gas", "2026-10-20", "paga"), conta("luz", "2026-11-10", "a_pagar")] });
    const d = await repo.carregar("2026-11");
    expect(d.atrasadas?.map((x) => x.id)).toEqual(["agua"]);
    expect(d.despesas.map((x) => x.id)).toEqual(["luz"]);
  });
});
