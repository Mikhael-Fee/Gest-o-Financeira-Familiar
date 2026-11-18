import { supabase } from "./supabase";
import type { Lancamento } from "./lancamentos";
import { somarMes } from "./lancamentos";
import type { Cartao } from "./cartoes";
import type { HistoricoFixos, Limites, NovoRecorrente, Recorrente } from "./fixos";

export type NovoLancamento = Omit<Lancamento, "id"> & { id?: string; /** Só ao lançar no cartão de outra pessoa: a compra fica na conta dela. */ dono?: string };

export interface Repositorio {
  listar(mes: string): Promise<Lancamento[]>;
  /** Lançamentos de vários meses (do primeiro ao último, inclusive), para o Resumo. */
  listarIntervalo(deMes: string, ateMes: string): Promise<Lancamento[]>;
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
  /** Lançamentos fixos ativos. */
  recorrentes(): Promise<Recorrente[]>;
  /** Cria ou altera um fixo; devolve o id. */
  salvarRecorrente(r: NovoRecorrente): Promise<string>;
  /** Para de repetir (os lançamentos já feitos ficam). */
  pararRecorrente(id: string): Promise<void>;
  /** Ids dos fixos já lançados no mês (pelo mês do fixo, não pela data da fatura). */
  fixosLancados(mes: string): Promise<string[]>;
  limites(): Promise<Limites>;
  /** valor null tira o limite da categoria. */
  salvarLimite(categoria: string, valor: number | null): Promise<void>;
  /** Valores já lançados de cada fixo (para a média). */
  historicoFixos(): Promise<HistoricoFixos>;
  saldoInicial(): Promise<{ mes: string; valor: number } | null>;
  /** null apaga o saldo inicial. */
  salvarSaldoInicial(s: { mes: string; valor: number } | null): Promise<void>;
}

const COLUNAS = "id, data, descricao, categoria, valor_centavos, tipo, meio, pagamento, cartao_id, compra_id, parcela, parcelas, data_compra, de_quem, reembolso_id, pagamento_informado_em, recorrente_id, recorrente_mes";
type Linha = {
  id: string; data: string; descricao: string; categoria: string; valor_centavos: number; tipo: Lancamento["tipo"]; meio: Lancamento["meio"];
  pagamento?: Lancamento["pagamento"]; cartao_id?: string | null; compra_id?: string | null; parcela?: number | null; parcelas?: number | null; data_compra?: string | null; de_quem?: string | null; reembolso_id?: string | null; pagamento_informado_em?: string | null; recorrente_id?: string | null; recorrente_mes?: string | null; dono?: string;
};
const daLinha = (r: Linha): Lancamento => ({
  id: r.id, data: r.data, descricao: r.descricao, categoria: r.categoria, valor: r.valor_centavos, tipo: r.tipo, meio: r.meio,
  pagamento: r.pagamento ?? null, cartaoId: r.cartao_id ?? null, compraId: r.compra_id ?? null, parcela: r.parcela ?? null, parcelas: r.parcelas ?? null, dataCompra: r.data_compra ?? null, deQuem: r.de_quem ?? null, reembolsoId: r.reembolso_id ?? null, pagamentoInformadoEm: r.pagamento_informado_em ?? null, recorrenteId: r.recorrente_id ?? null, recorrenteMes: r.recorrente_mes ?? null,
});
const paraLinha = (l: NovoLancamento) => ({
  data: l.data, descricao: l.descricao, categoria: l.categoria, valor_centavos: l.valor, tipo: l.tipo, meio: l.meio,
  pagamento: l.pagamento ?? null, cartao_id: l.cartaoId ?? null, compra_id: l.compraId ?? null, parcela: l.parcela ?? null, parcelas: l.parcelas ?? null, data_compra: l.dataCompra ?? null, de_quem: l.deQuem ?? null,
  recorrente_id: l.recorrenteId ?? null, recorrente_mes: l.recorrenteMes ?? null,
  ...(l.dono ? { dono: l.dono } : {}),
});

type LinhaFixo = { id: string; descricao: string; categoria: string; valor_centavos: number; tipo: Recorrente["tipo"]; meio: Recorrente["meio"]; pagamento: Recorrente["pagamento"]; cartao_id: string | null; dia: number; desde: string; ativo: boolean; usar_media: boolean };
const doFixo = (r: LinhaFixo): Recorrente => ({ id: r.id, descricao: r.descricao, categoria: r.categoria, valor: r.valor_centavos, tipo: r.tipo, meio: r.meio, pagamento: r.pagamento ?? null, cartaoId: r.cartao_id, dia: r.dia, desde: r.desde, ativo: r.ativo, usarMedia: r.usar_media });

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
  async listarIntervalo(deMes, ateMes) {
    const { data, error } = await supabase!
      .from("lancamentos")
      .select(COLUNAS)
      .eq("dono", eu)
      .gte("data", `${deMes}-01`)
      .lt("data", `${somarMes(ateMes, 1)}-01`)
      .order("data");
    if (error) throw new Error("Não foi possível carregar o resumo.");
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
  async recorrentes() {
    const { data, error } = await supabase!.from("recorrentes").select("id, descricao, categoria, valor_centavos, tipo, meio, pagamento, cartao_id, dia, desde, ativo, usar_media").eq("dono", eu).eq("ativo", true).order("dia");
    if (error) throw new Error("Não foi possível carregar os lançamentos fixos.");
    return (data as LinhaFixo[]).map(doFixo);
  },
  async salvarRecorrente(r) {
    const linha = { descricao: r.descricao, categoria: r.categoria, valor_centavos: r.valor, tipo: r.tipo, meio: r.meio, pagamento: r.pagamento ?? null, cartao_id: r.pagamento ? r.cartaoId : null, dia: r.dia, desde: r.desde, ativo: r.ativo, usar_media: r.usarMedia ?? false };
    const { data, error } = r.id
      ? await supabase!.from("recorrentes").update(linha).eq("id", r.id).select("id").single()
      : await supabase!.from("recorrentes").insert(linha).select("id").single();
    if (error) throw new Error("Não foi possível salvar o lançamento fixo.");
    return (data as { id: string }).id;
  },
  async pararRecorrente(id) {
    const { error } = await supabase!.from("recorrentes").update({ ativo: false }).eq("id", id);
    if (error) throw new Error("Não foi possível parar o lançamento fixo.");
  },
  async fixosLancados(mes) {
    const { data, error } = await supabase!.from("lancamentos").select("recorrente_id").eq("dono", eu).eq("recorrente_mes", mes).not("recorrente_id", "is", null);
    if (error) throw new Error("Não foi possível conferir os lançamentos fixos.");
    return (data as { recorrente_id: string }[]).map((r) => r.recorrente_id);
  },
  async limites() {
    const { data, error } = await supabase!.from("limites").select("categoria, valor_centavos").eq("dono", eu);
    if (error) throw new Error("Não foi possível carregar os limites.");
    return Object.fromEntries((data as { categoria: string; valor_centavos: number }[]).map((r) => [r.categoria, r.valor_centavos]));
  },
  async salvarLimite(categoria, valor) {
    const { error } = valor === null
      ? await supabase!.from("limites").delete().eq("dono", eu).eq("categoria", categoria)
      : await supabase!.from("limites").upsert({ categoria, valor_centavos: valor }, { onConflict: "dono,categoria" });
    if (error) throw new Error("Não foi possível salvar o limite.");
  },
  async historicoFixos() {
    const { data, error } = await supabase!.from("lancamentos").select("recorrente_id, recorrente_mes, valor_centavos").eq("dono", eu).not("recorrente_id", "is", null).order("recorrente_mes", { ascending: false }).limit(500);
    if (error) throw new Error("Não foi possível carregar o histórico dos fixos.");
    const h: HistoricoFixos = {};
    for (const r of data as { recorrente_id: string; recorrente_mes: string; valor_centavos: number }[]) (h[r.recorrente_id] ??= []).push({ mes: r.recorrente_mes, valor: r.valor_centavos });
    return h;
  },
  async saldoInicial() {
    const { data, error } = await supabase!.from("saldos_iniciais").select("mes, valor_centavos").eq("dono", eu).maybeSingle();
    if (error) throw new Error("Não foi possível carregar o saldo inicial.");
    return data ? { mes: (data as { mes: string }).mes, valor: (data as { valor_centavos: number }).valor_centavos } : null;
  },
  async salvarSaldoInicial(s) {
    const { error } = s === null
      ? await supabase!.from("saldos_iniciais").delete().eq("dono", eu)
      : await supabase!.from("saldos_iniciais").upsert({ mes: s.mes, valor_centavos: s.valor }, { onConflict: "dono" });
    if (error) throw new Error("Não foi possível salvar o saldo inicial.");
  },
});

export const daLinhaLancamento = daLinha;

// --- Demonstração: dados de exemplo em memória, descartados ao sair.
export function repositorioDemo(
  inicial: Lancamento[],
  cartoesIniciais: Cartao[] = [],
  devoInicial: (Lancamento & { dono: string })[] = [],
  queUso: Cartao[] = [],
  fixosIniciais: Recorrente[] = [],
  limitesIniciais: Limites = {},
  saldoIni: { mes: string; valor: number } | null = null,
): Repositorio {
  let saldo = saldoIni;
  let fixos = [...fixosIniciais];
  let limites = { ...limitesIniciais };
  let lista = [...inicial];
  let devo = [...devoInicial];
  let cartoes = [...cartoesIniciais];
  let seq = 0;
  const novoId = () => `novo-${++seq}`;
  return {
    async listar(mes) {
      return lista.filter((l) => l.data.startsWith(mes)).sort((a, b) => b.data.localeCompare(a.data));
    },
    async listarIntervalo(deMes, ateMes) {
      return lista.filter((l) => l.data.slice(0, 7) >= deMes && l.data.slice(0, 7) <= ateMes).sort((a, b) => a.data.localeCompare(b.data));
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
    async recorrentes() {
      return fixos.filter((f) => f.ativo).sort((a, b) => a.dia - b.dia);
    },
    async salvarRecorrente(r) {
      if (r.id) {
        fixos = fixos.map((f) => (f.id === r.id ? ({ ...r } as Recorrente) : f));
        return r.id;
      }
      const id = `fixo-${++seq}`;
      fixos.push({ ...r, id });
      return id;
    },
    async pararRecorrente(id) {
      fixos = fixos.map((f) => (f.id === id ? { ...f, ativo: false } : f));
    },
    async fixosLancados(mes) {
      return lista.filter((l) => l.recorrenteId && l.recorrenteMes === mes).map((l) => l.recorrenteId!);
    },
    async limites() {
      return { ...limites };
    },
    async salvarLimite(categoria, valor) {
      if (valor === null) delete limites[categoria];
      else limites[categoria] = valor;
    },
    async historicoFixos() {
      const h: HistoricoFixos = {};
      for (const l of lista) if (l.recorrenteId && l.recorrenteMes) (h[l.recorrenteId] ??= []).push({ mes: l.recorrenteMes, valor: l.valor });
      return h;
    },
    async saldoInicial() {
      return saldo;
    },
    async salvarSaldoInicial(s) {
      saldo = s;
    },
  };
}
