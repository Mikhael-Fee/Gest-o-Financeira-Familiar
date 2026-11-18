export type Tipo = "entrada" | "saida";
export type Meio = "dinheiro" | "beneficio";

export type Lancamento = {
  id: string;
  data: string; // AAAA-MM-DD
  descricao: string;
  categoria: string;
  valor: number; // centavos, sempre positivo
  tipo: Tipo;
  meio: Meio;
  pagamento?: Pagamento | null; // só para saída em dinheiro paga com cartão
  cartaoId?: string | null;
  compraId?: string | null; // agrupa as parcelas de uma mesma compra
  parcela?: number | null;
  parcelas?: number | null;
  dataCompra?: string | null;
  deQuem?: string | null; // compra feita por outra pessoa da família no seu cartão
  reembolsoId?: string | null; // preenchido quando você recebeu de volta
  pagamentoInformadoEm?: string | null; // quem comprou avisou que já pagou
  recorrenteId?: string | null; // veio de um lançamento fixo
  recorrenteMes?: string | null; // de qual mês do fixo (AAAA-MM)
};

export type Pagamento = "debito" | "credito";

export const CATEGORIAS: Record<Tipo, string[]> = {
  entrada: ["Salário", "Freela", "Benefício", "Extra", "Reembolso", "Empréstimo", "Outros"],
  saida: ["Alimentação", "Casa", "Transporte", "Cartão", "Saúde", "Lazer", "Educação", "Compras", "Empréstimo", "Igreja", "Outros"],
};

/** "2026-11" a partir de uma data AAAA-MM-DD. */
export const mesDe = (data: string) => data.slice(0, 7);

export function somarMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function nomeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const n = NOMES_MES[m - 1];
  return `${n[0].toUpperCase()}${n.slice(1)} de ${a}`;
}

export const hojeISO = (agora = new Date()) =>
  `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

export type Resumo = {
  noCredito: number; // parte do "saiu" que vem de faturas de cartão
  entrou: number;
  saiu: number;
  sobra: number;
  beneficioRecebido: number;
  beneficioGasto: number;
  beneficioSobra: number;
};

/** Resumo de um mês. Dinheiro e benefício (VR/VA) nunca se misturam. */
export function resumir(lista: Lancamento[], mes: string): Resumo {
  const r = { entrou: 0, saiu: 0, beneficioRecebido: 0, beneficioGasto: 0, noCredito: 0 };
  for (const l of lista) {
    if (mesDe(l.data) !== mes) continue;
    if (l.pagamento === "credito") r.noCredito += l.valor;
    if (l.meio === "dinheiro") l.tipo === "entrada" ? (r.entrou += l.valor) : (r.saiu += l.valor);
    else l.tipo === "entrada" ? (r.beneficioRecebido += l.valor) : (r.beneficioGasto += l.valor);
  }
  return { ...r, sobra: r.entrou - r.saiu, beneficioSobra: r.beneficioRecebido - r.beneficioGasto };
}

/** Divide um total em n parcelas iguais; os centavos que sobram vão para a 1ª parcela. */
export function dividirTotal(total: number, n: number): number[] {
  const partes = Math.max(1, Math.floor(n));
  const cada = Math.floor(total / partes);
  return Array.from({ length: partes }, (_, i) => (i === 0 ? total - cada * (partes - 1) : cada));
}
