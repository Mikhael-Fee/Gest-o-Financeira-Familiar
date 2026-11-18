import type { Perfil } from "./tipos";
import type { Lancamento } from "./lancamentos";
import { hojeISO, mesDe } from "./lancamentos";

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
