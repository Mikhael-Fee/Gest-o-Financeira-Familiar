import { supabase } from "./supabase";
import { somarMes, type Meio } from "./lancamentos";
import type { Ajuda, Combinado, DadosCasa, Despesa, Forma } from "./casa";

export type NovaAjuda = { data: string; descricao: string; valor: number; meio: Meio; forma: Forma };
export type NovaDespesa = { id?: string; data: string; descricao: string; valor: number; meio: Meio };

export interface RepositorioCasa {
  carregar(mes: string): Promise<DadosCasa>;
  /** Filho informa a própria ajuda (fica aguardando confirmação). */
  informarAjuda(eu: string, a: NovaAjuda): Promise<void>;
  /** Responsável registra uma entrada já confirmada (a própria ou de alguém). */
  registrarEntrada(quem: string, a: Omit<NovaAjuda, "forma">): Promise<void>;
  confirmarAjuda(id: string): Promise<void>;
  apagarAjuda(a: Ajuda): Promise<void>;
  salvarDespesa(d: NovaDespesa): Promise<void>;
  marcarPaga(id: string): Promise<void>;
  apagarDespesa(id: string): Promise<void>;
  salvarCombinado(c: Combinado): Promise<void>;
}

type LinhaDespesa = { id: string; data: string; descricao: string; valor_centavos: number; meio: Despesa["meio"]; status: Despesa["status"]; paga_por: string | null };
const daDespesa = (r: LinhaDespesa): Despesa => ({ id: r.id, data: r.data, descricao: r.descricao, valor: r.valor_centavos, meio: r.meio, status: r.status, pagaPor: r.paga_por });

const falhou = (msg: string) => (r: { error: unknown }) => {
  if (r.error) throw new Error(msg);
};

export const repositorioCasaSupabase: RepositorioCasa = {
  async carregar(mes) {
    const de = `${mes}-01`;
    const ate = `${somarMes(mes, 1)}-01`;
    const [a, d, c, at] = await Promise.all([
      supabase!.from("casa_ajudas").select("id, data, quem, descricao, valor_centavos, meio, forma, status, despesa_id").gte("data", de).lt("data", ate).order("data", { ascending: false }),
      supabase!.from("casa_despesas").select("id, data, descricao, valor_centavos, meio, status, paga_por").gte("data", de).lt("data", ate).order("data"),
      supabase!.from("combinados").select("filho, dinheiro_centavos, beneficio_nome, beneficio_centavos"),
      supabase!.from("casa_despesas").select("id, data, descricao, valor_centavos, meio, status, paga_por").eq("status", "a_pagar").lt("data", de).order("data"),
    ]);
    if (a.error || d.error || c.error || at.error) throw new Error("Não foi possível carregar a Casa.");
    return {
      ajudas: a.data.map((r) => ({ id: r.id, data: r.data, quem: r.quem, descricao: r.descricao, valor: r.valor_centavos, meio: r.meio, forma: r.forma, status: r.status, despesaId: r.despesa_id })),
      despesas: d.data.map(daDespesa),
      atrasadas: at.data.map(daDespesa),
      combinados: c.data.map((r) => ({ filho: r.filho, dinheiro: r.dinheiro_centavos, beneficioNome: r.beneficio_nome, beneficio: r.beneficio_centavos })),
    };
  },
  async informarAjuda(_eu, a) {
    falhou("Não foi possível informar a ajuda.")(
      await supabase!.rpc("informar_ajuda", { p_data: a.data, p_descricao: a.descricao, p_valor_centavos: a.valor, p_meio: a.meio, p_forma: a.forma }),
    );
  },
  async registrarEntrada(quem, a) {
    falhou("Não foi possível registrar a entrada.")(
      await supabase!.from("casa_ajudas").insert({ quem, data: a.data, descricao: a.descricao, valor_centavos: a.valor, meio: a.meio, forma: "enviado", status: "confirmado" }),
    );
  },
  async confirmarAjuda(id) {
    falhou("Não foi possível confirmar.")(await supabase!.from("casa_ajudas").update({ status: "confirmado" }).eq("id", id));
  },
  async apagarAjuda(a) {
    // Ajuda paga direto: apagar a despesa apaga a ajuda junto.
    const r = a.despesaId
      ? await supabase!.from("casa_despesas").delete().eq("id", a.despesaId)
      : await supabase!.from("casa_ajudas").delete().eq("id", a.id);
    falhou("Não foi possível apagar.")(r);
  },
  async salvarDespesa(d) {
    const linha = { data: d.data, descricao: d.descricao, valor_centavos: d.valor, meio: d.meio };
    falhou("Não foi possível salvar a despesa.")(
      d.id ? await supabase!.from("casa_despesas").update(linha).eq("id", d.id) : await supabase!.from("casa_despesas").insert(linha),
    );
  },
  async marcarPaga(id) {
    falhou("Não foi possível marcar como paga.")(await supabase!.from("casa_despesas").update({ status: "paga" }).eq("id", id));
  },
  async apagarDespesa(id) {
    falhou("Não foi possível apagar a despesa.")(await supabase!.from("casa_despesas").delete().eq("id", id));
  },
  async salvarCombinado(c) {
    falhou("Não foi possível salvar o combinado.")(
      await supabase!.from("combinados").upsert({ filho: c.filho, dinheiro_centavos: c.dinheiro, beneficio_nome: c.beneficioNome, beneficio_centavos: c.beneficio, atualizado_em: new Date().toISOString() }),
    );
  },
};

/** Casa da demonstração: uma só para todas as pessoas, em memória. */
export function repositorioCasaDemo(inicial: DadosCasa): RepositorioCasa {
  const d: DadosCasa = { ajudas: [...inicial.ajudas], despesas: [...inicial.despesas], combinados: [...inicial.combinados] };
  let seq = 0;
  const id = () => `casa-${++seq}`;
  return {
    async carregar(mes) {
      return {
        ajudas: d.ajudas.filter((a) => a.data.startsWith(mes)).sort((a, b) => b.data.localeCompare(a.data)),
        despesas: d.despesas.filter((x) => x.data.startsWith(mes)).sort((a, b) => a.data.localeCompare(b.data)),
        atrasadas: d.despesas.filter((x) => x.status === "a_pagar" && x.data.slice(0, 7) < mes).sort((a, b) => a.data.localeCompare(b.data)),
        combinados: [...d.combinados],
      };
    },
    async informarAjuda(eu, a) {
      let despesaId: string | null = null;
      if (a.forma === "pago_direto") {
        despesaId = id();
        d.despesas.push({ id: despesaId, data: a.data, descricao: a.descricao, valor: a.valor, meio: a.meio, status: "paga", pagaPor: eu });
      }
      d.ajudas.push({ id: id(), quem: eu, status: "informado", despesaId, ...a });
    },
    async registrarEntrada(quem, a) {
      d.ajudas.push({ id: id(), quem, status: "confirmado", forma: "enviado", despesaId: null, ...a });
    },
    async confirmarAjuda(aid) {
      d.ajudas = d.ajudas.map((a) => (a.id === aid ? { ...a, status: "confirmado" } : a));
    },
    async apagarAjuda(a) {
      d.ajudas = d.ajudas.filter((x) => x.id !== a.id);
      if (a.despesaId) d.despesas = d.despesas.filter((x) => x.id !== a.despesaId);
    },
    async salvarDespesa(nova) {
      if (nova.id) d.despesas = d.despesas.map((x) => (x.id === nova.id ? { ...x, ...nova, id: x.id } : x));
      else d.despesas.push({ ...nova, id: id(), status: "a_pagar", pagaPor: null } as Despesa);
    },
    async marcarPaga(did) {
      d.despesas = d.despesas.map((x) => (x.id === did ? { ...x, status: "paga" } : x));
    },
    async apagarDespesa(did) {
      d.despesas = d.despesas.filter((x) => x.id !== did);
      d.ajudas = d.ajudas.filter((a) => a.despesaId !== did);
    },
    async salvarCombinado(c) {
      d.combinados = [...d.combinados.filter((x) => x.filho !== c.filho), c];
    },
  };
}
