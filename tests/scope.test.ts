import { expect, it } from "vitest";
import { demoState } from "../src/data/store";
import { scopedPaymentHistory } from "../src/domain/reports";
import type { Payment } from "../src/domain/finance";
function fixture() {
  const s = demoState();
  s.obligations.push({
    ...s.obligations[0],
    id: "house-bill",
    house: true,
    confirmed: 0,
    due_on: "2026-11-10",
  });
  const payment: Payment = {
    id: "private-a",
    obligation_id: "statement-a",
    account_id: "bank-a",
    amount: 10000,
    paid_on: "2026-11-10",
    payer_id: "a",
    key: "private-a",
  };
  s.payments = [
    payment,
    {
      ...payment,
      id: "house-b",
      obligation_id: "house-bill",
      payer_id: "b",
      key: "house-b",
    },
    { ...payment, id: "house-a", obligation_id: "house-bill", key: "house-a" },
    {
      ...payment,
      id: "prior",
      obligation_id: "house-bill",
      key: "prior",
      paid_on: "2026-10-10",
    },
  ];
  return s;
}
it("fluxo pessoal mostra os desembolsos do próprio pagador no mês, sem atribuir os de outro membro", () => {
  expect(
    scopedPaymentHistory(fixture(), "a", "personal", "2026-11").map(
      (p) => p.id,
    ),
  ).toEqual(["private-a", "house-a"]);
  expect(
    scopedPaymentHistory(fixture(), "b", "personal", "2026-11").map(
      (p) => p.id,
    ),
  ).toEqual(["house-b"]);
});
it("fluxo da Casa aceita múltiplos pagadores sem mostrar pagamento privado ou de outro mês", () => {
  expect(
    scopedPaymentHistory(fixture(), "a", "house", "2026-11").map((p) => p.id),
  ).toEqual(["house-b", "house-a"]);
});
it("fluxo compartilhado não usa uma obrigação de outra família nem dados sem perfil do usuário", () => {
  const s = fixture();
  s.obligations.find((o) => o.id === "house-bill")!.family_id = "unrelated";
  expect(scopedPaymentHistory(s, "a", "house", "2026-11")).toEqual([]);
  expect(scopedPaymentHistory(s, "unknown", "house", "2026-11")).toEqual([]);
});
