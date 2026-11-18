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
