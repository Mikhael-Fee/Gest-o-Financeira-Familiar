import { supabase } from "./supabase";
import type { Lancamento } from "./lancamentos";
import { somarMes } from "./lancamentos";
import type { Cartao } from "./cartoes";

export type NovoLancamento = Omit<Lancamento, "id"> & { id?: string; /** Só ao lançar no cartão de outra pessoa: a compra fica na conta dela. */ dono?: string };

export interface Repositorio {
  listar(mes: string): Promise<Lancamento[]>;
  salvar(l: NovoLancamento): Promise<void>;
  /** Várias parcelas de uma compra, gravadas de uma vez. */
  salvarVarios(lista: NovoLancamento[]): Promise<void>;
  apagar(id: string): Promise<void>;
  /** Apaga todas as parcelas de uma compra. */
  apagarCompra(compraId: string): Promise<void>;
  cartoes(): Promise<Cartao[]>;
  salvarCartao(c: Omit<Cartao, "id"> & { id?: string }): Promise<void>;
  removerCartao(id: string): Promise<void>;
  /** Compras de outras pessoas no seu cartão que ainda não te pagaram (todos os meses). */
  aReceber(): Promise<Lancamento[]>;
  /** Registra que recebeu: cria uma entrada com a soma e marca as compras como pagas. */
  registrarReembolso(ids: string[], data: string, descricao: string): Promise<void>;
  /** Quem comprou no cartão de outra pessoa avisa que já pagou; o dono confirma com registrarReembolso. */
  informarPagamento(ids: string[], data: string): Promise<void>;
  /** Compras suas no cartão de outras pessoas que você ainda não pagou. */
  devo(): Promise<(Lancamento & { dono: string })[]>;
  /** Cartões de outras pessoas que marcaram você como quem usa. */
  cartoesQueUso(): Promise<Cartao[]>;
}

const COLUNAS = "id, data, descricao, categoria, valor_centavos, tipo, meio, pagamento, cartao_id, compra_id, parcela, parcelas, data_compra, de_quem, reembolso_id, pagamento_informado_em";
type Linha = {
  id: string; data: string; descricao: string; categoria: string; valor_centavos: number; tipo: Lancamento["tipo"]; meio: Lancamento["meio"];
  pagamento?: Lancamento["pagamento"]; cartao_id?: string | null; compra_id?: string | null; parcela?: number | null; parcelas?: number | null; data_compra?: string | null; de_quem?: string | null; reembolso_id?: string | null; pagamento_informado_em?: string | null; dono?: string;
};
const daLinha = (r: Linha): Lancamento => ({
  id: r.id, data: r.data, descricao: r.descricao, categoria: r.categoria, valor: r.valor_centavos, tipo: r.tipo, meio: r.meio,
  pagamento: r.pagamento ?? null, cartaoId: r.cartao_id ?? null, compraId: r.compra_id ?? null, parcela: r.parcela ?? null, parcelas: r.parcelas ?? null, dataCompra: r.data_compra ?? null, deQuem: r.de_quem ?? null, reembolsoId: r.reembolso_id ?? null, pagamentoInformadoEm: r.pagamento_informado_em ?? null,
});
const paraLinha = (l: NovoLancamento) => ({
  data: l.data, descricao: l.descricao, categoria: l.categoria, valor_centavos: l.valor, tipo: l.tipo, meio: l.meio,
  pagamento: l.pagamento ?? null, cartao_id: l.cartaoId ?? null, compra_id: l.compraId ?? null, parcela: l.parcela ?? null, parcelas: l.parcelas ?? null, data_compra: l.dataCompra ?? null, de_quem: l.deQuem ?? null,
  ...(l.dono ? { dono: l.dono } : {}),
});

const COLUNAS_CARTAO = "id, banco, apelido, tem_credito, tem_debito, dia_fechamento, dia_vencimento, usado_por, dono";
type LinhaCartao = { id: string; banco: string; apelido: string | null; tem_credito: boolean; tem_debito: boolean; dia_fechamento: number | null; dia_vencimento: number | null; usado_por: string | null; dono: string };
const doCartao = (r: LinhaCartao): Cartao => ({ id: r.id, banco: r.banco, apelido: r.apelido, temCredito: r.tem_credito, temDebito: r.tem_debito, diaFechamento: r.dia_fechamento, diaVencimento: r.dia_vencimento, usadoPor: r.usado_por });

// Filtra pelo dono: com a Etapa 4, o banco também devolve lançamentos que outras pessoas compartilharam.
export const repositorioSupabase = (eu: string): Repositorio => ({
  async listar(mes) {
    const { data, error } = await supabase!
      .from("lancamentos")
      .select(COLUNAS)
      .eq("dono", eu)
      .gte("data", `${mes}-01`)
      .lt("data", `${somarMes(mes, 1)}-01`)
      .order("data", { ascending: false })
      .order("criado_em", { ascending: false });
    if (error) throw new Error("Não foi possível carregar seus lançamentos.");
    return (data as Linha[]).map(daLinha);
  },
  async salvar(l) {
    const { error } = l.id
      ? await supabase!.from("lancamentos").update(paraLinha(l)).eq("id", l.id)
      : await supabase!.from("lancamentos").insert(paraLinha(l));
    if (error) throw new Error("Não foi possível salvar. Confira a internet e tente de novo.");
  },
  async salvarVarios(lista) {
    const { error } = await supabase!.from("lancamentos").insert(lista.map(paraLinha));
    if (error) throw new Error("Não foi possível salvar as parcelas. Tente de novo.");
  },
  async apagar(id) {
    const { error } = await supabase!.from("lancamentos").delete().eq("id", id);
    if (error) throw new Error("Não foi possível apagar. Tente de novo.");
  },
  async apagarCompra(compraId) {
    // O banco só deixa apagar o que é seu ou a sua compra no cartão que você usa.
    const { error } = await supabase!.from("lancamentos").delete().eq("compra_id", compraId);
    if (error) throw new Error("Não foi possível apagar a compra. Tente de novo.");
  },
  async cartoes() {
    const { data, error } = await supabase!.from("cartoes").select(COLUNAS_CARTAO).eq("dono", eu).eq("ativo", true).order("banco");
    if (error) throw new Error("Não foi possível carregar seus cartões.");
    return (data as LinhaCartao[]).map(doCartao);
  },
  async salvarCartao(c) {
    const linha = { banco: c.banco, apelido: c.apelido, tem_credito: c.temCredito, tem_debito: c.temDebito, dia_fechamento: c.temCredito ? c.diaFechamento : null, dia_vencimento: c.temCredito ? c.diaVencimento : null, usado_por: c.usadoPor ?? null };
    const { error } = c.id ? await supabase!.from("cartoes").update(linha).eq("id", c.id) : await supabase!.from("cartoes").insert(linha);
    if (error) throw new Error("Não foi possível salvar o cartão.");
  },
  async removerCartao(id) {
    // Desativa em vez de apagar, para os lançamentos antigos continuarem com o nome do cartão.
    const { error } = await supabase!.from("cartoes").update({ ativo: false }).eq("id", id);
    if (error) throw new Error("Não foi possível remover o cartão.");
  },
  async aReceber() {
    const { data, error } = await supabase!.from("lancamentos").select(COLUNAS).eq("dono", eu).not("de_quem", "is", null).is("reembolso_id", null).order("data");
    if (error) throw new Error("Não foi possível carregar o que você tem a receber.");
    return (data as Linha[]).map(daLinha);
  },
  async registrarReembolso(ids, data, descricao) {
    const { error } = await supabase!.rpc("registrar_reembolso", { p_ids: ids, p_data: data, p_descricao: descricao });
    if (error) throw new Error("Não foi possível registrar o recebimento.");
  },
  async informarPagamento(ids, data) {
    const { error } = await supabase!.rpc("informar_pagamento", { p_ids: ids, p_data: data });
    if (error) throw new Error("Não foi possível avisar o pagamento.");
  },
  async devo() {
    const { data, error } = await supabase!.from("lancamentos").select(`${COLUNAS}, dono`).eq("de_quem", eu).neq("dono", eu).is("reembolso_id", null).order("data");
    if (error) throw new Error("Não foi possível carregar o que você deve.");
    return (data as Linha[]).map((r) => ({ ...daLinha(r), dono: r.dono! }));
  },
  async cartoesQueUso() {
    const { data, error } = await supabase!.from("cartoes").select(COLUNAS_CARTAO).eq("usado_por", eu).neq("dono", eu).eq("ativo", true).order("banco");
    if (error) throw new Error("Não foi possível carregar os cartões que você usa.");
    return (data as LinhaCartao[]).map((r) => ({ ...doCartao(r), dono: r.dono }));
  },
});

export const daLinhaLancamento = daLinha;

// --- Demonstração: dados de exemplo em memória, descartados ao sair.
export function repositorioDemo(
  inicial: Lancamento[],
  cartoesIniciais: Cartao[] = [],
  devoInicial: (Lancamento & { dono: string })[] = [],
  queUso: Cartao[] = [],
): Repositorio {
  let lista = [...inicial];
  let devo = [...devoInicial];
  let cartoes = [...cartoesIniciais];
  let seq = 0;
  const novoId = () => `novo-${++seq}`;
  return {
    async listar(mes) {
      return lista.filter((l) => l.data.startsWith(mes)).sort((a, b) => b.data.localeCompare(a.data));
    },
    async salvar(l) {
      if (l.dono) {
        devo = devo.map((x) => (x.id === l.id ? ({ ...l, dono: l.dono! } as Lancamento & { dono: string }) : x));
        return;
      }
      if (l.id) lista = lista.map((x) => (x.id === l.id ? { ...(l as Lancamento) } : x));
      else lista.push({ ...l, id: novoId() });
    },
    async salvarVarios(itens) {
      for (const l of itens) {
        if (l.dono) devo.push({ ...l, dono: l.dono, id: novoId() });
        else lista.push({ ...l, id: novoId() });
      }
    },
    async apagar(id) {
      lista = lista.filter((l) => l.id !== id);
      devo = devo.filter((l) => l.id !== id);
    },
    async apagarCompra(compraId) {
      lista = lista.filter((l) => l.compraId !== compraId);
      devo = devo.filter((l) => l.compraId !== compraId);
    },
    async cartoes() {
      return [...cartoes];
    },
    async salvarCartao(c) {
      if (c.id) cartoes = cartoes.map((x) => (x.id === c.id ? ({ ...c } as Cartao) : x));
      else cartoes.push({ ...c, id: `cartao-${++seq}` });
    },
    async removerCartao(id) {
      cartoes = cartoes.filter((c) => c.id !== id);
    },
    async aReceber() {
      return lista.filter((l) => l.deQuem && !l.reembolsoId).sort((a, b) => a.data.localeCompare(b.data));
    },
    async registrarReembolso(ids, data, descricao) {
      const itens = lista.filter((l) => ids.includes(l.id) && l.deQuem && !l.reembolsoId);
      if (!itens.length || itens.length !== ids.length) throw new Error("Compras inválidas para reembolso.");
      const id = novoId();
      lista.push({ id, data, descricao, categoria: "Reembolso", valor: itens.reduce((s, l) => s + l.valor, 0), tipo: "entrada", meio: "dinheiro" });
      lista = lista.map((l) => (ids.includes(l.id) ? { ...l, reembolsoId: id } : l));
    },
    async informarPagamento(ids, data) {
      devo = devo.map((l) => (ids.includes(l.id) ? { ...l, pagamentoInformadoEm: data } : l));
    },
    async devo() {
      return [...devo].sort((a, b) => a.data.localeCompare(b.data));
    },
    async cartoesQueUso() {
      return [...queUso];
    },
  };
}
