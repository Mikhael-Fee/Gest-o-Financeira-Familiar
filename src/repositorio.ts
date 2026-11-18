import { supabase } from "./supabase";
import type { Lancamento } from "./lancamentos";
import { somarMes } from "./lancamentos";

export type NovoLancamento = Omit<Lancamento, "id"> & { id?: string };

export interface Repositorio {
  listar(mes: string): Promise<Lancamento[]>;
  salvar(l: NovoLancamento): Promise<void>;
  apagar(id: string): Promise<void>;
}

// --- Supabase: o banco só devolve os lançamentos da própria pessoa (RLS).
type Linha = { id: string; data: string; descricao: string; categoria: string; valor_centavos: number; tipo: Lancamento["tipo"]; meio: Lancamento["meio"] };
const daLinha = (r: Linha): Lancamento => ({ id: r.id, data: r.data, descricao: r.descricao, categoria: r.categoria, valor: r.valor_centavos, tipo: r.tipo, meio: r.meio });

// Filtra pelo dono: com a Etapa 4, o banco também devolve lançamentos que outras pessoas compartilharam.
export const repositorioSupabase = (eu: string): Repositorio => ({
  async listar(mes) {
    const { data, error } = await supabase!
      .from("lancamentos")
      .select("id, data, descricao, categoria, valor_centavos, tipo, meio")
      .eq("dono", eu)
      .gte("data", `${mes}-01`)
      .lt("data", `${somarMes(mes, 1)}-01`)
      .order("data", { ascending: false })
      .order("criado_em", { ascending: false });
    if (error) throw new Error("Não foi possível carregar seus lançamentos.");
    return (data as Linha[]).map(daLinha);
  },
  async salvar(l) {
    const linha = { data: l.data, descricao: l.descricao, categoria: l.categoria, valor_centavos: l.valor, tipo: l.tipo, meio: l.meio };
    const { error } = l.id
      ? await supabase!.from("lancamentos").update(linha).eq("id", l.id)
      : await supabase!.from("lancamentos").insert(linha);
    if (error) throw new Error("Não foi possível salvar. Confira a internet e tente de novo.");
  },
  async apagar(id) {
    const { error } = await supabase!.from("lancamentos").delete().eq("id", id);
    if (error) throw new Error("Não foi possível apagar. Tente de novo.");
  },
});

export const daLinhaLancamento = daLinha;

// --- Demonstração: dados de exemplo em memória, descartados ao sair.
export function repositorioDemo(inicial: Lancamento[]): Repositorio {
  let lista = [...inicial];
  let seq = 0;
  return {
    async listar(mes) {
      return lista
        .filter((l) => l.data.startsWith(mes))
        .sort((a, b) => b.data.localeCompare(a.data));
    },
    async salvar(l) {
      if (l.id) lista = lista.map((x) => (x.id === l.id ? { ...(l as Lancamento) } : x));
      else lista.push({ ...l, id: `novo-${++seq}` });
    },
    async apagar(id) {
      lista = lista.filter((l) => l.id !== id);
    },
  };
}
