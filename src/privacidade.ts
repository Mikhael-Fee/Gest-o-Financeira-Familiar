import { supabase } from "./supabase";
import { somarMes, type Lancamento } from "./lancamentos";
import { daLinhaLancamento } from "./repositorio";

export type Nivel = "nada" | "situacao" | "tudo";

export const NIVEIS: [Nivel, string, string][] = [
  ["nada", "Nada", "Suas finanças ficam só com você."],
  ["situacao", "Só a situação do mês", "A família vê quanto entrou, saiu e sobrou, sem os lançamentos."],
  ["tudo", "Situação e lançamentos", "A família vê os totais e cada lançamento. Só você altera."],
];

export type ResumoPessoa = { entrou: number; saiu: number; beneficioRecebido: number; beneficioGasto: number };
export type VisaoPessoa = { nivel: Nivel; resumo: ResumoPessoa | null; lancamentos: Lancamento[] | null };

export interface RepositorioPrivacidade {
  niveis(): Promise<Record<string, Nivel>>;
  salvarNivel(eu: string, nivel: Nivel): Promise<void>;
  ver(pessoa: string, mes: string): Promise<VisaoPessoa>;
}

export const repositorioPrivacidadeSupabase: RepositorioPrivacidade = {
  async niveis() {
    const { data, error } = await supabase!.from("privacidade").select("dono, nivel");
    if (error) throw new Error("Não foi possível carregar a privacidade.");
    return Object.fromEntries(data.map((r) => [r.dono, r.nivel as Nivel]));
  },
  async salvarNivel(eu, nivel) {
    const { error } = await supabase!.from("privacidade").upsert({ dono: eu, nivel, atualizado_em: new Date().toISOString() });
    if (error) throw new Error("Não foi possível salvar sua escolha.");
  },
  async ver(pessoa, mes) {
    const nivel = (await this.niveis())[pessoa] ?? "nada";
    if (nivel === "nada") return { nivel, resumo: null, lancamentos: null };
    const r = await supabase!.rpc("resumo_do_mes", { pessoa, mes: `${mes}-01` });
    if (r.error) throw new Error("Não foi possível carregar.");
    const linha = r.data?.[0] ?? { entrou: 0, saiu: 0, beneficio_recebido: 0, beneficio_gasto: 0 };
    const resumo = { entrou: Number(linha.entrou), saiu: Number(linha.saiu), beneficioRecebido: Number(linha.beneficio_recebido), beneficioGasto: Number(linha.beneficio_gasto) };
    if (nivel !== "tudo") return { nivel, resumo, lancamentos: null };
    const l = await supabase!
      .from("lancamentos")
      .select("id, data, descricao, categoria, valor_centavos, tipo, meio")
      .eq("dono", pessoa)
      .gte("data", `${mes}-01`)
      .lt("data", `${somarMes(mes, 1)}-01`)
      .order("data", { ascending: false });
    if (l.error) throw new Error("Não foi possível carregar os lançamentos.");
    return { nivel, resumo, lancamentos: l.data.map(daLinhaLancamento) };
  },
};

/** Demonstração: usa os exemplos de cada pessoa. */
export function repositorioPrivacidadeDemo(inicial: Record<string, Nivel>, lancamentosDe: (pessoa: string) => Lancamento[]): RepositorioPrivacidade {
  const niveis = { ...inicial };
  return {
    async niveis() {
      return { ...niveis };
    },
    async salvarNivel(eu, nivel) {
      niveis[eu] = nivel;
    },
    async ver(pessoa, mes) {
      const nivel = niveis[pessoa] ?? "nada";
      if (nivel === "nada") return { nivel, resumo: null, lancamentos: null };
      const lista = lancamentosDe(pessoa).filter((l) => l.data.startsWith(mes));
      const soma = (tipo: string, meio: string) => lista.filter((l) => l.tipo === tipo && l.meio === meio).reduce((s, l) => s + l.valor, 0);
      const resumo = { entrou: soma("entrada", "dinheiro"), saiu: soma("saida", "dinheiro"), beneficioRecebido: soma("entrada", "beneficio"), beneficioGasto: soma("saida", "beneficio") };
      return { nivel, resumo, lancamentos: nivel === "tudo" ? lista.sort((a, b) => b.data.localeCompare(a.data)) : null };
    },
  };
}
