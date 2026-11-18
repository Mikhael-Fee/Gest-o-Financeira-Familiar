// Contas da aba Resumo: tudo calculado a partir dos lançamentos da própria pessoa.
import { mesDe, resumir, somarMes, type Lancamento } from "./lancamentos";

/** Saídas em dinheiro (inclui cartão) que são da pessoa: compras de outros no seu cartão ficam de fora. */
const gastoProprio = (l: Lancamento) => l.tipo === "saida" && l.meio === "dinheiro" && !l.deQuem;

export type Fatia = { categoria: string; valor: number; anterior: number };

/** Gastos do mês por categoria, do maior para o menor, com o valor do mês anterior para comparar. */
export function gastosPorCategoria(lista: Lancamento[], mes: string): Fatia[] {
  const antes = somarMes(mes, -1);
  const m = new Map<string, Fatia>();
  for (const l of lista) {
    if (!gastoProprio(l)) continue;
    const ms = mesDe(l.data);
    if (ms !== mes && ms !== antes) continue;
    const f = m.get(l.categoria) ?? { categoria: l.categoria, valor: 0, anterior: 0 };
    if (ms === mes) f.valor += l.valor;
    else f.anterior += l.valor;
    m.set(l.categoria, f);
  }
  return [...m.values()].filter((f) => f.valor > 0).sort((a, b) => b.valor - a.valor);
}

export function maioresGastos(lista: Lancamento[], mes: string, n = 5): Lancamento[] {
  return lista.filter((l) => gastoProprio(l) && mesDe(l.data) === mes).sort((a, b) => b.valor - a.valor).slice(0, n);
}

export type Ponto = { mes: string; valor: number };

/** Sobra em dinheiro dos últimos `n` meses, terminando em `mes`. */
export function sobraPorMes(lista: Lancamento[], mes: string, n = 6): Ponto[] {
  return Array.from({ length: n }, (_, i) => {
    const m = somarMes(mes, i - n + 1);
    return { mes: m, valor: resumir(lista, m).sobra };
  });
}

export type Compromisso = { mes: string; valor: number; itens: Lancamento[] };

/** Faturas já marcadas nos próximos `n` meses (parcelas lançadas no crédito), depois de `mes`. */
export function compromissos(lista: Lancamento[], mes: string, n = 6): Compromisso[] {
  return Array.from({ length: n }, (_, i) => {
    const m = somarMes(mes, i + 1);
    const itens = lista.filter((l) => l.pagamento === "credito" && l.tipo === "saida" && mesDe(l.data) === m);
    return { mes: m, valor: itens.reduce((s, l) => s + l.valor, 0), itens };
  });
}

/** Faturas de um cartão mês a mês (compras no crédito pela data da fatura). */
export function faturasDoCartao(lista: Lancamento[], cartaoId: string, deMes: string, n: number): Ponto[] {
  return Array.from({ length: n }, (_, i) => {
    const m = somarMes(deMes, i);
    const valor = lista
      .filter((l) => l.cartaoId === cartaoId && l.pagamento === "credito" && l.tipo === "saida" && mesDe(l.data) === m)
      .reduce((s, l) => s + l.valor, 0);
    return { mes: m, valor };
  });
}

export type Parcelamento = {
  compraId: string; descricao: string; valorParcela: number; parcelas: number;
  proxima: number; restantes: number; totalRestante: number; ultimaFatura: string; deQuem: string | null;
};

/** Compras parceladas no cartão que ainda têm parcelas a partir de `mes`. */
export function parcelamentosAbertos(lista: Lancamento[], cartaoId: string, mes: string): Parcelamento[] {
  const grupos = new Map<string, Lancamento[]>();
  for (const l of lista) {
    if (l.cartaoId !== cartaoId || !l.compraId || (l.parcelas ?? 1) < 2 || mesDe(l.data) < mes) continue;
    grupos.set(l.compraId, [...(grupos.get(l.compraId) ?? []), l]);
  }
  return [...grupos.entries()]
    .map(([compraId, ls]) => {
      const ord = [...ls].sort((a, b) => a.data.localeCompare(b.data));
      return {
        compraId, descricao: ord[0].descricao, valorParcela: ord[0].valor, parcelas: ord[0].parcelas!,
        proxima: ord[0].parcela!, restantes: ord.length, totalRestante: ord.reduce((s, l) => s + l.valor, 0),
        ultimaFatura: ord[ord.length - 1].data, deQuem: ord[0].deQuem ?? null,
      };
    })
    .sort((a, b) => b.totalRestante - a.totalRestante);
}
