// Lançamentos fixos (repetem todo mês) e limites por categoria.
import type { Lancamento, Tipo } from "./lancamentos";
import type { NovoLancamento } from "./repositorio";
import { diaDoMes, vencimentoDaCompra, type Cartao } from "./cartoes";

export type Recorrente = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number; // centavos
  tipo: Tipo;
  meio: Lancamento["meio"];
  pagamento: Lancamento["pagamento"];
  cartaoId: string | null;
  dia: number;
  desde: string; // AAAA-MM
  ativo: boolean;
  /** Sugerir a média dos últimos 3 meses em vez do valor fixo (ex.: salário com hora extra). */
  usarMedia?: boolean;
};
export type NovoRecorrente = Omit<Recorrente, "id"> & { id?: string };

/** Limite de gasto por mês, por categoria (centavos). */
export type Limites = Record<string, number>;

/** Fixos que ainda não foram lançados no mês. Meses futuros não aparecem. */
export function pendentesDoMes(fixos: Recorrente[], lancadosNoMes: string[], mes: string, mesAtual: string): Recorrente[] {
  if (mes > mesAtual) return [];
  return fixos
    .filter((r) => r.ativo && r.desde <= mes && !lancadosNoMes.includes(r.id))
    .sort((a, b) => a.dia - b.dia);
}

/** Valores já lançados de cada fixo, por mês. */
export type HistoricoFixos = Record<string, { mes: string; valor: number }[]>;

/** Valor a sugerir no mês: o fixo, ou a média dos últimos 3 meses anteriores quando o fixo usa média. */
export function valorSugerido(r: Recorrente, historico: HistoricoFixos, mes: string): { valor: number; media: boolean; meses: number } {
  if (!r.usarMedia) return { valor: r.valor, media: false, meses: 0 };
  const ultimos = (historico[r.id] ?? []).filter((h) => h.mes < mes).sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 3);
  if (!ultimos.length) return { valor: r.valor, media: false, meses: 0 };
  return { valor: Math.round(ultimos.reduce((s, h) => s + h.valor, 0) / ultimos.length), media: true, meses: ultimos.length };
}

/** Saldo inicial + sobras (dinheiro) do mês do saldo inicial até `ate`, inclusive. */
export function saldoAcumulado(lista: Lancamento[], inicial: { mes: string; valor: number } | null, ate: string): number {
  let total = inicial?.valor ?? 0;
  for (const l of lista) {
    const m = l.data.slice(0, 7);
    if (l.meio !== "dinheiro" || m > ate || (inicial && m < inicial.mes)) continue;
    total += l.tipo === "entrada" ? l.valor : -l.valor;
  }
  return total;
}

/** O lançamento de um fixo num mês. No crédito, cai na fatura certa. */
export function lancamentoDoFixo(r: Recorrente, mes: string, cartao?: Cartao, valor = r.valor): NovoLancamento {
  const dia = diaDoMes(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), r.dia);
  const credito = r.pagamento === "credito" && cartao?.diaFechamento && cartao.diaVencimento;
  return {
    data: credito ? vencimentoDaCompra(dia, cartao!.diaFechamento!, cartao!.diaVencimento!) : dia,
    dataCompra: credito ? dia : null,
    descricao: r.descricao, categoria: r.categoria, valor, tipo: r.tipo, meio: r.meio,
    pagamento: r.pagamento ?? null, cartaoId: r.cartaoId, recorrenteId: r.id, recorrenteMes: mes,
  };
}

export type SituacaoLimite = { categoria: string; gasto: number; limite: number; parte: number; estado: "ok" | "perto" | "passou" };

/** Como está cada limite: perto a partir de 80%, passou acima de 100%. */
export function situacaoLimites(limites: Limites, gastos: { categoria: string; valor: number }[]): SituacaoLimite[] {
  return Object.entries(limites)
    .map(([categoria, limite]) => {
      const gasto = gastos.find((g) => g.categoria === categoria)?.valor ?? 0;
      const parte = gasto / limite;
      return { categoria, gasto, limite, parte, estado: parte > 1 ? "passou" : parte >= 0.8 ? "perto" : "ok" } as SituacaoLimite;
    })
    .sort((a, b) => b.parte - a.parte);
}
