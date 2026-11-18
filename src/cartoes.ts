// Regras de cartão: em que fatura cai uma compra e como espalhar parcelas.

export type Cartao = {
  id: string;
  banco: string;
  apelido: string | null;
  temCredito: boolean;
  temDebito: boolean;
  diaFechamento: number | null;
  diaVencimento: number | null;
};

export const BANCOS = ["Nubank", "Inter", "Itaú", "Bradesco", "Caixa", "Banco do Brasil", "Santander", "Mercado Pago", "C6", "PicPay"];

export const nomeCartao = (c: Pick<Cartao, "banco" | "apelido">) => (c.apelido ? `${c.banco} · ${c.apelido}` : c.banco);

const diasNoMes = (ano: number, mes1a12: number) => new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();

/** Data AAAA-MM-DD do dia `dia` no mês (ano, mês 1–12), ajustando para o último dia se o mês for curto. */
export function diaDoMes(ano: number, mes: number, dia: number): string {
  const a = ano + Math.floor((mes - 1) / 12);
  const m = ((((mes - 1) % 12) + 12) % 12) + 1;
  const d = Math.min(dia, diasNoMes(a, m));
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Vencimento da fatura em que cai uma compra.
 * Compra antes do dia de fechamento entra na fatura que fecha neste mês;
 * no dia do fechamento ou depois, entra na do mês seguinte.
 * O vencimento é no mês do fechamento se o dia de vencimento for maior que o de fechamento,
 * senão no mês seguinte (ex.: fecha dia 28, vence dia 5).
 */
export function vencimentoDaCompra(dataCompra: string, diaFechamento: number, diaVencimento: number): string {
  const [ano, mes, dia] = dataCompra.split("-").map(Number);
  const fechamentoEsteMes = Math.min(diaFechamento, diasNoMes(ano, mes));
  const mesFechamento = dia < fechamentoEsteMes ? mes : mes + 1;
  const mesVencimento = diaVencimento > diaFechamento ? mesFechamento : mesFechamento + 1;
  return diaDoMes(ano, mesVencimento, diaVencimento);
}

/** Vencimento da fatura `n` meses depois de outro vencimento. */
export function vencimentoMaisMeses(vencimento: string, n: number, diaVencimento: number): string {
  const [ano, mes] = vencimento.split("-").map(Number);
  return diaDoMes(ano, mes + n, diaVencimento);
}

export type Parcela = { parcela: number; parcelas: number; data: string };

/**
 * Datas das parcelas a lançar.
 * - Compra nova: da 1ª até a última, a partir do vencimento em que a compra cai.
 * - Parcelamento em andamento: da parcela atual até a última, a partir da fatura informada.
 *   As parcelas anteriores não são criadas (já foram pagas e não sabemos quando).
 */
export function gerarParcelas(primeiroVencimento: string, diaVencimento: number, parcelaAtual: number, parcelas: number): Parcela[] {
  const lista: Parcela[] = [];
  for (let p = parcelaAtual; p <= parcelas; p++) {
    lista.push({ parcela: p, parcelas, data: vencimentoMaisMeses(primeiroVencimento, p - parcelaAtual, diaVencimento) });
  }
  return lista;
}
