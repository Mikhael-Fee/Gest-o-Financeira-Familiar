import { supabase } from "./supabase";
import type { Lancamento } from "./lancamentos";
import { somarMes } from "./lancamentos";
import type { Cartao } from "./cartoes";

export type NovoLancamento = Omit<Lancamento, "id"> & { id?: string };

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
}

const COLUNAS = "id, data, descricao, categoria, valor_centavos, tipo, meio, pagamento, cartao_id, compra_id, parcela, parcelas, data_compra";
type Linha = {
  id: string; data: string; descricao: string; categoria: string; valor_centavos: number; tipo: Lancamento["tipo"]; meio: Lancamento["meio"];
  pagamento?: Lancamento["pagamento"]; cartao_id?: string | null; compra_id?: string | null; parcela?: number | null; parcelas?: number | null; data_compra?: string | null;
};
const daLinha = (r: Linha): Lancamento => ({
  id: r.id, data: r.data, descricao: r.descricao, categoria: r.categoria, valor: r.valor_centavos, tipo: r.tipo, meio: r.meio,
  pagamento: r.pagamento ?? null, cartaoId: r.cartao_id ?? null, compraId: r.compra_id ?? null, parcela: r.parcela ?? null, parcelas: r.parcelas ?? null, dataCompra: r.data_compra ?? null,
});
const paraLinha = (l: NovoLancamento) => ({
  data: l.data, descricao: l.descricao, categoria: l.categoria, valor_centavos: l.valor, tipo: l.tipo, meio: l.meio,
  pagamento: l.pagamento ?? null, cartao_id: l.cartaoId ?? null, compra_id: l.compraId ?? null, parcela: l.parcela ?? null, parcelas: l.parcelas ?? null, data_compra: l.dataCompra ?? null,
});

type LinhaCartao = { id: string; banco: string; apelido: string | null; tem_credito: boolean; tem_debito: boolean; dia_fechamento: number | null; dia_vencimento: number | null };
const doCartao = (r: LinhaCartao): Cartao => ({ id: r.id, banco: r.banco, apelido: r.apelido, temCredito: r.tem_credito, temDebito: r.tem_debito, diaFechamento: r.dia_fechamento, diaVencimento: r.dia_vencimento });

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
    const { error } = await supabase!.from("lancamentos").delete().eq("compra_id", compraId).eq("dono", eu);
    if (error) throw new Error("Não foi possível apagar a compra. Tente de novo.");
  },
  async cartoes() {
    const { data, error } = await supabase!.from("cartoes").select("id, banco, apelido, tem_credito, tem_debito, dia_fechamento, dia_vencimento").eq("ativo", true).order("banco");
    if (error) throw new Error("Não foi possível carregar seus cartões.");
    return (data as LinhaCartao[]).map(doCartao);
  },
  async salvarCartao(c) {
    const linha = { banco: c.banco, apelido: c.apelido, tem_credito: c.temCredito, tem_debito: c.temDebito, dia_fechamento: c.temCredito ? c.diaFechamento : null, dia_vencimento: c.temCredito ? c.diaVencimento : null };
    const { error } = c.id ? await supabase!.from("cartoes").update(linha).eq("id", c.id) : await supabase!.from("cartoes").insert(linha);
    if (error) throw new Error("Não foi possível salvar o cartão.");
  },
  async removerCartao(id) {
    // Desativa em vez de apagar, para os lançamentos antigos continuarem com o nome do cartão.
    const { error } = await supabase!.from("cartoes").update({ ativo: false }).eq("id", id);
    if (error) throw new Error("Não foi possível remover o cartão.");
  },
});

export const daLinhaLancamento = daLinha;

// --- Demonstração: dados de exemplo em memória, descartados ao sair.
export function repositorioDemo(inicial: Lancamento[], cartoesIniciais: Cartao[] = []): Repositorio {
  let lista = [...inicial];
  let cartoes = [...cartoesIniciais];
  let seq = 0;
  const novoId = () => `novo-${++seq}`;
  return {
    async listar(mes) {
      return lista.filter((l) => l.data.startsWith(mes)).sort((a, b) => b.data.localeCompare(a.data));
    },
    async salvar(l) {
      if (l.id) lista = lista.map((x) => (x.id === l.id ? { ...(l as Lancamento) } : x));
      else lista.push({ ...l, id: novoId() });
    },
    async salvarVarios(itens) {
      for (const l of itens) lista.push({ ...l, id: novoId() });
    },
    async apagar(id) {
      lista = lista.filter((l) => l.id !== id);
    },
    async apagarCompra(compraId) {
      lista = lista.filter((l) => l.compraId !== compraId);
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
  };
}
