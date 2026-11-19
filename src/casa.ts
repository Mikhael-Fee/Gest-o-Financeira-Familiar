import type { Meio } from "./lancamentos";
import { mesDe } from "./lancamentos";
import type { Perfil } from "./tipos";

export type Forma = "enviado" | "pago_direto";

export type Ajuda = {
  id: string;
  data: string;
  quem: string;
  descricao: string;
  valor: number;
  meio: Meio;
  forma: Forma;
  status: "informado" | "confirmado";
  despesaId: string | null;
};

export type Despesa = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  meio: Meio;
  status: "a_pagar" | "paga";
  pagaPor: string | null; // filho que pagou direto do bolso
};

export type Combinado = {
  filho: string;
  dinheiro: number | null; // null = varia todo mês (ex.: freela)
  beneficioNome: string;
  beneficio: number;
};

export type DadosCasa = {
  ajudas: Ajuda[];
  despesas: Despesa[];
  combinados: Combinado[];
  /** Contas de meses anteriores que ainda não foram pagas. */
  atrasadas?: Despesa[];
};

export type AjudaDoFilho = {
  perfil: Perfil;
  combinado: Combinado | null;
  dinheiro: number; // informado + confirmado
  beneficio: number;
  pendentes: number; // quantas ainda aguardam confirmação
  faltaDinheiro: number;
  faltaBeneficio: number;
};

export type ResumoCasa = {
  caixaDinheiro: number;
  caixaBeneficio: number;
  aPagar: number;
  pagoTotal: number;
  totalDespesas: number;
  porFilho: AjudaDoFilho[];
};

/**
 * Caixa da Casa = ajudas confirmadas que ENTRARAM (enviadas) menos despesas pagas PELA CASA.
 * Despesa paga direto por um filho não sai do caixa, e a ajuda ligada a ela não entra:
 * conta só como a ajuda daquele filho.
 */
export function resumirCasa(dados: DadosCasa, perfis: Perfil[], mes: string): ResumoCasa {
  const ajudas = dados.ajudas.filter((a) => mesDe(a.data) === mes);
  const despesas = dados.despesas.filter((d) => mesDe(d.data) === mes);
  let caixaDinheiro = 0;
  let caixaBeneficio = 0;
  for (const a of ajudas) {
    if (a.status !== "confirmado" || a.forma !== "enviado") continue;
    if (a.meio === "dinheiro") caixaDinheiro += a.valor;
    else caixaBeneficio += a.valor;
  }
  // Conta atrasada continua a pagar até alguém marcar como paga.
  let aPagar = (dados.atrasadas ?? []).filter((d) => d.status === "a_pagar" && mesDe(d.data) < mes).reduce((s, d) => s + d.valor, 0);
  let pagoTotal = 0;
  for (const d of despesas) {
    if (d.status === "a_pagar") {
      aPagar += d.valor;
      continue;
    }
    pagoTotal += d.valor;
    if (d.pagaPor) continue;
    if (d.meio === "dinheiro") caixaDinheiro -= d.valor;
    else caixaBeneficio -= d.valor;
  }
  const porFilho = perfis
    .filter((p) => p.papel === "filho")
    .map((perfil) => {
      const minhas = ajudas.filter((a) => a.quem === perfil.id);
      const soma = (m: Meio) => minhas.filter((a) => a.meio === m).reduce((s, a) => s + a.valor, 0);
      const combinado = dados.combinados.find((c) => c.filho === perfil.id) ?? null;
      const dinheiro = soma("dinheiro");
      const beneficio = soma("beneficio");
      return {
        perfil,
        combinado,
        dinheiro,
        beneficio,
        pendentes: minhas.filter((a) => a.status === "informado").length,
        faltaDinheiro: Math.max(0, (combinado?.dinheiro ?? 0) - dinheiro),
        faltaBeneficio: Math.max(0, (combinado?.beneficio ?? 0) - beneficio),
      };
    });
  return { caixaDinheiro, caixaBeneficio, aPagar, pagoTotal, totalDespesas: aPagar + pagoTotal, porFilho };
}
