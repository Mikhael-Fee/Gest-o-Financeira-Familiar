// Valores sempre em centavos (inteiros) para não errar contas com vírgula.

/** "1.234,56" | "1234.56" | "50" -> 123456 | 123456 | 5000. Retorna null se inválido. */
export function lerValor(texto: string): number | null {
  let t = texto.replace(/[R$\s]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const centavos = Math.round(Number(t) * 100);
  return centavos > 0 ? centavos : null;
}

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const reais = (centavos: number) => fmt.format(centavos / 100);
