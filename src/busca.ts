// Busca nos lançamentos: texto (sem diferença de acento ou maiúscula) e filtros.
import type { Lancamento } from "./lancamentos";

export type Filtro = {
  texto: string;
  tipo: "todos" | "entrada" | "saida";
  categoria: string; // "" = todas
  cartaoId: string; // "" = todos, "sem" = sem cartão
};

export const FILTRO_VAZIO: Filtro = { texto: "", tipo: "todos", categoria: "", cartaoId: "" };

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filtrar(lista: Lancamento[], f: Filtro): Lancamento[] {
  const termos = normal(f.texto).split(/\s+/).filter(Boolean);
  return lista
    .filter((l) => {
      if (f.tipo !== "todos" && l.tipo !== f.tipo) return false;
      if (f.categoria && l.categoria !== f.categoria) return false;
      if (f.cartaoId === "sem" ? l.cartaoId : f.cartaoId && l.cartaoId !== f.cartaoId) return false;
      if (!termos.length) return true;
      const alvo = normal(`${l.descricao} ${l.categoria}`);
      return termos.every((t) => alvo.includes(t));
    })
    .sort((a, b) => b.data.localeCompare(a.data));
}

/** Agrupa por mês (mais recente primeiro) com o total de entradas e saídas. */
export function porMes(lista: Lancamento[]) {
  const m = new Map<string, Lancamento[]>();
  for (const l of lista) m.set(l.data.slice(0, 7), [...(m.get(l.data.slice(0, 7)) ?? []), l]);
  return [...m.entries()].map(([mes, itens]) => ({
    mes, itens,
    entrou: itens.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0),
    saiu: itens.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.valor, 0),
  }));
}
