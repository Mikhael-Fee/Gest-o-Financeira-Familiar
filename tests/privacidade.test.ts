import { describe, expect, it } from "vitest";
import { repositorioPrivacidadeDemo } from "../src/privacidade";
import { lancamentosDemo } from "../src/demo";

const hoje = new Date(2026, 10, 18);

describe("privacidade na demonstração", () => {
  const repo = () => repositorioPrivacidadeDemo({ "demo-filha": "situacao" }, (p) => lancamentosDemo(p, hoje));

  it("começa privado para quem não escolheu", async () => {
    const v = await repo().ver("demo-filho", "2026-11");
    expect(v).toEqual({ nivel: "nada", resumo: null, lancamentos: null });
  });

  it("situação mostra só os totais", async () => {
    const v = await repo().ver("demo-filha", "2026-11");
    expect(v.resumo).toEqual({ entrou: 245000, saiu: 47000, beneficioRecebido: 60000, beneficioGasto: 60000 });
    expect(v.lancamentos).toBeNull();
  });

  it("tudo mostra também os lançamentos, e voltar para nada esconde", async () => {
    const r = repo();
    await r.salvarNivel("demo-filho", "tudo");
    expect((await r.ver("demo-filho", "2026-11")).lancamentos?.length).toBe(11);
    await r.salvarNivel("demo-filho", "nada");
    expect((await r.ver("demo-filho", "2026-11")).resumo).toBeNull();
  });
});
