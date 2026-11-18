import type { Perfil } from "./tipos";
import type { Lancamento } from "./lancamentos";
import { hojeISO, mesDe, somarMes } from "./lancamentos";
import type { DadosCasa } from "./casa";
import type { Cartao } from "./cartoes";
import type { Limites, Recorrente } from "./fixos";

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
    [10, "Notebook", "Compras", 860, "saida", "dinheiro"], // parcela 7/10 no crédito (veja abaixo)
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

/** Compras da Mãe no cartão Itaú do Filho (ela usa e paga a ele). */
function comprasDaMaeNoCartaoDoFilho(mes: string): Lancamento[] {
  const base = { tipo: "saida" as const, meio: "dinheiro" as const, pagamento: "credito" as const, cartaoId: "demo-itau", deQuem: "demo-mae", reembolsoId: null };
  return [
    { ...base, id: "demo-filho-mae-1", data: `${mes}-02`, descricao: "Farmácia", categoria: "Saúde", valor: 15000 },
    { ...base, id: "demo-filho-mae-2", data: `${mes}-02`, descricao: "Sapato", categoria: "Compras", valor: 18990 },
  ];
}

/** Na visão do Filho, a Mãe já avisou que pagou a farmácia. */
function comAvisoDePagamento(l: Lancamento, mes: string): Lancamento {
  return l.descricao === "Farmácia" ? { ...l, pagamentoInformadoEm: `${mes}-05` } : l;
}

/** Lançamentos de exemplo no mês atual, para a demonstração sempre ter o que mostrar. */
export function lancamentosDemo(perfilId: string, hoje = new Date()): Lancamento[] {
  const mes = mesDe(hojeISO(hoje));
  const extras = perfilId === "demo-filho" ? comprasDaMaeNoCartaoDoFilho(mes).map((l) => comAvisoDePagamento(l, mes)) : [];
  return [...extras, ...(EXEMPLOS[perfilId] ?? [])
    .filter(([dia]) => dia <= Math.max(hoje.getDate(), 16))
    .map(([dia, descricao, categoria, valor, tipo, meio], i) => ({
      id: `${perfilId}-${i}`,
      data: `${mes}-${String(dia).padStart(2, "0")}`,
      descricao,
      categoria,
      valor: Math.round(valor * 100),
      tipo,
      meio,
      ...(perfilId === "demo-filho" && FIXOS_LANCADOS[descricao] ? { recorrenteId: FIXOS_LANCADOS[descricao], recorrenteMes: mes } : {}),
      ...(perfilId === "demo-filho" && descricao === "Notebook"
        ? { pagamento: "credito" as const, cartaoId: "demo-nubank", compraId: "demo-compra-notebook", parcela: 7, parcelas: 10, dataCompra: null }
        : {}),
    }))];
}

/**
 * Meses anteriores (valores variando um pouco) e as próximas parcelas do notebook,
 * para o Resumo da demonstração ter histórico e compromissos.
 */
export function historicoDemo(perfilId: string, hoje = new Date()): Lancamento[] {
  const mes = mesDe(hojeISO(hoje));
  const fatores = [0.92, 1.1, 0.85, 1.04, 0.96];
  const saida: Lancamento[] = [];
  (EXEMPLOS[perfilId] ?? []).forEach(([dia, descricao, categoria, valor, tipo, meio], k) => {
    const notebook = perfilId === "demo-filho" && descricao === "Notebook";
    for (let i = 1; i <= 5; i++) {
      const m = somarMes(mes, -i);
      const v = tipo === "saida" && categoria !== "Casa" && !notebook ? valor * fatores[(i + k) % 5] : valor;
      saida.push({
        id: `${perfilId}-h${i}-${k}`, data: `${m}-${String(dia).padStart(2, "0")}`, descricao, categoria, valor: Math.round(v * 100), tipo, meio,
        ...(notebook ? { pagamento: "credito" as const, cartaoId: "demo-nubank", compraId: "demo-compra-notebook", parcela: 7 - i, parcelas: 10, dataCompra: null } : {}),
      });
    }
    if (notebook)
      for (let j = 1; j <= 3; j++)
        saida.push({
          id: `${perfilId}-f${j}`, data: `${somarMes(mes, j)}-10`, descricao, categoria, valor: Math.round(valor * 100), tipo, meio,
          pagamento: "credito", cartaoId: "demo-nubank", compraId: "demo-compra-notebook", parcela: 7 + j, parcelas: 10, dataCompra: null,
        });
  });
  // Hora extra do Filho varia todo mês (o fixo dele sugere a média).
  if (perfilId === "demo-filho") {
    [38000, 45000, 29000, 52000, 41000].forEach((v, k) => {
      const m = somarMes(mes, -(k + 1));
      saida.push({ id: `${perfilId}-extra-${k}`, data: `${m}-20`, descricao: "Hora extra", categoria: "Extra", valor: v, tipo: "entrada", meio: "dinheiro", recorrenteId: "demo-fixo-extra", recorrenteMes: m });
    });
  }
  return saida;
}

/** Saldo que o Filho tinha quando começou a usar o app (5 meses atrás). */
export function saldoInicialDemo(perfilId: string, hoje = new Date()) {
  return perfilId === "demo-filho" ? { mes: somarMes(mesDe(hojeISO(hoje)), -5), valor: 120000 } : null;
}

const FIXOS_LANCADOS: Record<string, string> = { "Salário": "demo-fixo-salario", "Academia": "demo-fixo-academia" };

/** Fixos do Filho: dois já lançados no mês e dois esperando confirmação. */
export function fixosDemo(perfilId: string, hoje = new Date()): Recorrente[] {
  if (perfilId !== "demo-filho") return [];
  const desde = mesDe(hojeISO(hoje));
  const base = { meio: "dinheiro" as const, ativo: true, desde, pagamento: null, cartaoId: null };
  return [
    { ...base, id: "demo-fixo-salario", descricao: "Salário", categoria: "Salário", valor: 320000, tipo: "entrada", dia: 5 },
    { ...base, id: "demo-fixo-extra", descricao: "Hora extra", categoria: "Extra", valor: 40000, tipo: "entrada", dia: 20, usarMedia: true, desde: somarMes(desde, -5) },
    { ...base, id: "demo-fixo-academia", descricao: "Academia", categoria: "Saúde", valor: 9900, tipo: "saida", dia: 12 },
    { ...base, id: "demo-fixo-streaming", descricao: "Streaming", categoria: "Lazer", valor: 5590, tipo: "saida", dia: 15, pagamento: "credito", cartaoId: "demo-nubank" },
    { ...base, id: "demo-fixo-celular", descricao: "Plano do celular", categoria: "Outros", valor: 4990, tipo: "saida", dia: 20 },
  ];
}

export function limitesDemo(perfilId: string): Limites {
  if (perfilId !== "demo-filho") return {};
  return { Compras: 100000, Saúde: 9000, Transporte: 10000, Lazer: 20000 };
}

/** O que a Mãe deve ao Filho na demonstração. */
export function devoDemo(perfilId: string, hoje = new Date()) {
  if (perfilId !== "demo-mae") return [];
  return comprasDaMaeNoCartaoDoFilho(mesDe(hojeISO(hoje))).map((l) => ({ ...l, dono: "demo-filho" }));
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

/** Cartões do Filho que a Mãe usa (ela vê e lança compras neles). */
export function cartoesQueUsoDemo(perfilId: string): Cartao[] {
  if (perfilId !== "demo-mae") return [];
  return cartoesDemo("demo-filho").filter((c) => c.usadoPor === "demo-mae").map((c) => ({ ...c, dono: "demo-filho" }));
}

/** Cartões de exemplo (só o Filho tem, para mostrar a fatura). */
export function cartoesDemo(perfilId: string): Cartao[] {
  if (perfilId !== "demo-filho") return [];
  return [
    { id: "demo-nubank", banco: "Nubank", apelido: null, temCredito: true, temDebito: false, diaFechamento: 3, diaVencimento: 10 },
    { id: "demo-inter", banco: "Inter", apelido: null, temCredito: true, temDebito: true, diaFechamento: 28, diaVencimento: 5 },
    { id: "demo-itau", banco: "Itaú", apelido: "da Mãe", temCredito: true, temDebito: true, diaFechamento: 25, diaVencimento: 2, usadoPor: "demo-mae" },
  ];
}
