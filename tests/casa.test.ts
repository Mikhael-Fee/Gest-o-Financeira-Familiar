import { describe, expect, it } from "vitest";
import { resumirCasa } from "../src/casa";
import { casaDemo, PERFIS_DEMO } from "../src/demo";
import { repositorioCasaDemo } from "../src/repositorioCasa";

const hoje = new Date(2026, 10, 18);
const mes = "2026-11";

describe("resumirCasa", () => {
  const r = resumirCasa(casaDemo(hoje), PERFIS_DEMO, mes);

  it("caixa conta só ajudas confirmadas que entraram, menos despesas pagas pela Casa", () => {
    // dinheiro: 500 (filho) + 1500 (pai) - 1400 - 238,40 - 96,20
    expect(r.caixaDinheiro).toBe(50000 + 150000 - 140000 - 23840 - 9620);
    // VR/VA: 600 (filha) + 800 (mãe) - 410 (feira). O mercado pago direto pelo filho não entra nem sai.
    expect(r.caixaBeneficio).toBe(60000 + 80000 - 41000);
  });

  it("separa o que falta pagar", () => {
    expect(r.aPagar).toBe(11990 + 12500);
    expect(r.totalDespesas).toBe(r.aPagar + r.pagoTotal);
  });

  it("ajuda por filho inclui o que pagou direto e o que ainda aguarda confirmação", () => {
    const filho = r.porFilho.find((f) => f.perfil.id === "demo-filho")!;
    expect(filho.dinheiro).toBe(50000);
    expect(filho.beneficio).toBe(70000); // mercado pago direto com VR
    expect(filho.faltaDinheiro).toBe(0);
    expect(filho.faltaBeneficio).toBe(0);
    expect(filho.pendentes).toBe(1);
    const filha = r.porFilho.find((f) => f.perfil.id === "demo-filha")!;
    expect(filha.combinado?.dinheiro).toBeNull(); // freela: varia
    expect(filha.dinheiro).toBe(35000);
  });

  it("só lista filhos em ajuda do mês", () => {
    expect(r.porFilho.map((f) => f.perfil.id)).toEqual(["demo-filho", "demo-filha"]);
  });
});

describe("Casa na demonstração", () => {
  it("pagar direto cria despesa paga pelo filho; apagar a ajuda remove a despesa", async () => {
    const repo = repositorioCasaDemo({ ajudas: [], despesas: [], combinados: [] });
    await repo.informarAjuda("demo-filho", { data: "2026-11-02", descricao: "Mercado", valor: 70000, meio: "beneficio", forma: "pago_direto" });
    let d = await repo.carregar(mes);
    expect(d.despesas).toMatchObject([{ descricao: "Mercado", status: "paga", pagaPor: "demo-filho" }]);
    expect(d.ajudas[0]).toMatchObject({ status: "informado", despesaId: d.despesas[0].id });
    let r = resumirCasa(d, PERFIS_DEMO, mes);
    expect(r.caixaBeneficio).toBe(0);
    await repo.confirmarAjuda(d.ajudas[0].id);
    r = resumirCasa(await repo.carregar(mes), PERFIS_DEMO, mes);
    expect(r.caixaBeneficio).toBe(0); // continua fora do caixa
    await repo.apagarAjuda((await repo.carregar(mes)).ajudas[0]);
    d = await repo.carregar(mes);
    expect(d.ajudas.length + d.despesas.length).toBe(0);
  });

  it("enviar entra no caixa só depois de confirmado; despesa a pagar não sai até ser paga", async () => {
    const repo = repositorioCasaDemo({ ajudas: [], despesas: [], combinados: [] });
    await repo.informarAjuda("demo-filho", { data: "2026-11-06", descricao: "Ajuda", valor: 50000, meio: "dinheiro", forma: "enviado" });
    await repo.salvarDespesa({ data: "2026-11-10", descricao: "Luz", valor: 20000, meio: "dinheiro" });
    let d = await repo.carregar(mes);
    expect(resumirCasa(d, PERFIS_DEMO, mes).caixaDinheiro).toBe(0);
    await repo.confirmarAjuda(d.ajudas[0].id);
    await repo.marcarPaga(d.despesas[0].id);
    d = await repo.carregar(mes);
    expect(resumirCasa(d, PERFIS_DEMO, mes).caixaDinheiro).toBe(30000);
  });
});
