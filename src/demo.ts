import type { Perfil } from "./tipos";
import type { Lancamento } from "./lancamentos";
import { hojeISO, mesDe } from "./lancamentos";
import type { DadosCasa } from "./casa";

// Pessoas fictícias para a demonstração. O repositório é público:
// nomes reais ficam só no banco de dados.
export const PERFIS_DEMO: Perfil[] = [
  { id: "demo-mae", nome: "Mãe", papel: "responsavel" },
  { id: "demo-pai", nome: "Pai", papel: "responsavel" },
  { id: "demo-filho", nome: "Filho", papel: "filho" },
  { id: "demo-filha", nome: "Filha", papel: "filho" },
];


type Exemplo = [dia: number, descricao: string, categoria: string, reais: number, tipo: Lancamento["tipo"], meio: Lancamento["meio"]];

const EXEMPLOS: Record<string, Exemplo[]> = {
  "demo-filho": [
    [5, "Salário", "Salário", 3200, "entrada", "dinheiro"],
    [5, "VR do mês", "Benefício", 700, "entrada", "beneficio"],
    [5, "VA do mês", "Benefício", 400, "entrada", "beneficio"],
    [6, "Ajuda fixa para a Casa", "Casa", 500, "saida", "dinheiro"],
    [6, "VR enviado para a Casa", "Casa", 700, "saida", "beneficio"],
    [8, "Fatura do cartão", "Cartão", 860, "saida", "dinheiro"],
    [9, "Almoço no trabalho", "Alimentação", 38, "saida", "beneficio"],
    [12, "Academia", "Saúde", 99, "saida", "dinheiro"],
    [15, "Uber", "Transporte", 74.5, "saida", "dinheiro"],
  ],
  "demo-filha": [
    [3, "Projeto de identidade visual", "Freela", 1800, "entrada", "dinheiro"],
    [5, "VA do mês", "Benefício", 600, "entrada", "beneficio"],
    [6, "VA enviado para a Casa", "Casa", 600, "saida", "beneficio"],
    [14, "Ajuste de site", "Freela", 650, "entrada", "dinheiro"],
    [15, "Ajuda para a Casa", "Casa", 350, "saida", "dinheiro"],
    [16, "Curso online", "Educação", 120, "saida", "dinheiro"],
  ],
  "demo-mae": [
    [1, "Salário", "Salário", 2900, "entrada", "dinheiro"],
    [10, "Farmácia", "Saúde", 85, "saida", "dinheiro"],
  ],
  "demo-pai": [
    [1, "Aposentadoria", "Outros", 2600, "entrada", "dinheiro"],
    [9, "Combustível", "Transporte", 220, "saida", "dinheiro"],
  ],
};

/** Lançamentos de exemplo no mês atual, para a demonstração sempre ter o que mostrar. */
export function lancamentosDemo(perfilId: string, hoje = new Date()): Lancamento[] {
  const mes = mesDe(hojeISO(hoje));
  return (EXEMPLOS[perfilId] ?? [])
    .filter(([dia]) => dia <= Math.max(hoje.getDate(), 16))
    .map(([dia, descricao, categoria, valor, tipo, meio], i) => ({
      id: `${perfilId}-${i}`,
      data: `${mes}-${String(dia).padStart(2, "0")}`,
      descricao,
      categoria,
      valor: Math.round(valor * 100),
      tipo,
      meio,
    }));
}


/** Casa de exemplo no mês atual. */
export function casaDemo(hoje = new Date()): DadosCasa {
  const mes = mesDe(hojeISO(hoje));
  const dia = (n: number) => `${mes}-${String(n).padStart(2, "0")}`;
  const c = (r: number) => Math.round(r * 100);
  return {
    combinados: [
      { filho: "demo-filho", dinheiro: c(500), beneficioNome: "VR", beneficio: c(700) },
      { filho: "demo-filha", dinheiro: null, beneficioNome: "VA", beneficio: c(600) },
    ],
    ajudas: [
      { id: "a1", data: dia(6), quem: "demo-filho", descricao: "Ajuda fixa", valor: c(500), meio: "dinheiro", forma: "enviado", status: "confirmado", despesaId: null },
      { id: "a2", data: dia(2), quem: "demo-filho", descricao: "Mercado do mês", valor: c(700), meio: "beneficio", forma: "pago_direto", status: "informado", despesaId: "d6" },
      { id: "a3", data: dia(6), quem: "demo-filha", descricao: "VA do mês", valor: c(600), meio: "beneficio", forma: "enviado", status: "confirmado", despesaId: null },
      { id: "a4", data: dia(15), quem: "demo-filha", descricao: "Ajuda do freela", valor: c(350), meio: "dinheiro", forma: "enviado", status: "informado", despesaId: null },
      { id: "a5", data: dia(1), quem: "demo-mae", descricao: "VA da Mãe", valor: c(800), meio: "beneficio", forma: "enviado", status: "confirmado", despesaId: null },
      { id: "a6", data: dia(1), quem: "demo-pai", descricao: "Aposentadoria (parte da Casa)", valor: c(1500), meio: "dinheiro", forma: "enviado", status: "confirmado", despesaId: null },
    ],
    despesas: [
      { id: "d1", data: dia(5), descricao: "Aluguel", valor: c(1400), meio: "dinheiro", status: "paga", pagaPor: null },
      { id: "d2", data: dia(12), descricao: "Luz", valor: c(238.4), meio: "dinheiro", status: "paga", pagaPor: null },
      { id: "d3", data: dia(15), descricao: "Água", valor: c(96.2), meio: "dinheiro", status: "paga", pagaPor: null },
      { id: "d4", data: dia(20), descricao: "Internet", valor: c(119.9), meio: "dinheiro", status: "a_pagar", pagaPor: null },
      { id: "d5", data: dia(22), descricao: "Gás", valor: c(125), meio: "dinheiro", status: "a_pagar", pagaPor: null },
      { id: "d6", data: dia(2), descricao: "Mercado do mês", valor: c(700), meio: "beneficio", status: "paga", pagaPor: "demo-filho" },
      { id: "d7", data: dia(9), descricao: "Feira e padaria", valor: c(410), meio: "beneficio", status: "paga", pagaPor: null },
    ],
  };
}
