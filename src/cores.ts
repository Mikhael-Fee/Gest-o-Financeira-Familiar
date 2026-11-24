// Cor fixa por categoria e por banco: a cor segue a coisa, nunca a posição na lista.
import type { CSSProperties } from "react";

const POR_CATEGORIA: Record<string, string> = {
  Alimentação: "laranja", Casa: "azul", Transporte: "amarelo", Saúde: "magenta",
  Lazer: "violeta", Educação: "agua", Compras: "verde", Cartão: "vermelho",
};
const POR_BANCO: Record<string, string> = {
  Bradesco: "vermelho", Nubank: "violeta", Caixa: "azul", Itaú: "laranja", Inter: "amarelo",
  "Mercado Pago": "agua", "Banco do Brasil": "amarelo", Santander: "vermelho", PicPay: "verde", C6: "cinza",
};

export const corCategoria = (c: string) => `var(--c-${POR_CATEGORIA[c] ?? "cinza"})`;
export const corBanco = (b: string) => `var(--c-${POR_BANCO[b] ?? "cinza"})`;
/** style={...} para um elemento usar a cor em --cor. */
export const comCor = (cor: string) => ({ "--cor": cor }) as CSSProperties;

// Ícone (emoji) por categoria: um desenho fácil de reconhecer no lugar de duas letras.
const ICONE_CATEGORIA: Record<string, string> = {
  Salário: "💰", Freela: "💻", Benefício: "🎫", Extra: "⭐", Reembolso: "↩️", Empréstimo: "🤝",
  Alimentação: "🍽️", Casa: "🏠", Transporte: "🚗", Cartão: "💳", Saúde: "💊", Lazer: "🎉",
  Educação: "📚", Compras: "🛍️", Igreja: "⛪", Outros: "📦",
};
export const iconeCategoria = (c: string) => ICONE_CATEGORIA[c] ?? "📦";

// Despesas da Casa não têm categoria: o ícone vem do nome (Luz, Água, Internet...).
const ICONE_DESPESA: [RegExp, string][] = [
  [/aluguel|condom/i, "🏠"], [/luz|energia|enel|light|cemig|copel/i, "💡"], [/[áa]gua|sabesp|saneamento/i, "💧"],
  [/internet|wi-?fi|fibra/i, "🌐"], [/g[áa]s|botij/i, "🔥"], [/mercado|feira|padaria|a[çc]ougue|sacol/i, "🛒"],
  [/farm[áa]cia|rem[ée]dio/i, "💊"], [/celular|telefone/i, "📱"], [/iptu|imposto|taxa/i, "📄"], [/tv|streaming|netflix/i, "📺"],
];
export const iconeDespesaCasa = (descricao: string) => ICONE_DESPESA.find(([r]) => r.test(descricao))?.[1] ?? "🏠";
