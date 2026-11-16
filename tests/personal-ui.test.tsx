import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PersonalPlanning from "../src/components/PersonalPlanning";
import { emptyState, type Entry } from "../src/domain/finance";
import { applyPersonal, personalEmpty } from "../src/domain/personal";
afterEach(cleanup);
function Harness() {
  const [state, setState] = useState(() => ({
    ...emptyState(),
    ...personalEmpty(),
    accounts: [
      {
        id: "bank",
        owner_id: "a",
        name: "Conta própria",
        kind: "bank" as const,
        opening: 100000,
        cutoff: "2026-01-01",
      },
    ],
    entries: [
      {
        id: "e",
        owner_id: "a",
        family_id: "f",
        description: "Compra",
        kind: "expense",
        amount: 12500,
        occurred_on: "2026-11-01",
        category: "Alimentação",
        house: false,
        consumer_id: "a",
        responsible_id: null,
        card_id: "card",
        splits: [],
        version: 1,
        voided: false,
      } as Entry,
    ],
  }));
  return (
    <PersonalPlanning
      state={state}
      ownerId="a"
      month="2026-11"
      busy={false}
      onCommand={async (type, payload) => {
        const result = applyPersonal(state, { type, payload }, { id: "a" });
        if (result) setState(result);
        return true;
      }}
    />
  );
}
describe("Planejamento pessoal conectado", () => {
  it("salva orçamento, mostra ultrapassagem e edita somente o mês escolhido", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Novo orçamento" }));
    fireEvent.change(screen.getByLabelText("Valor planejado (R$)"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar orçamento" }));
    await waitFor(() =>
      expect(
        screen.getByText("ultrapassado · aviso em 80%"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/^R\$\s125,00$/)).toBeInTheDocument();
    expect(screen.getByText(/^-R\$\s25,00$/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Editar orçamento de Alimentação" }),
    );
    fireEvent.change(screen.getByLabelText("Valor planejado (R$)"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar orçamento" }));
    await waitFor(() =>
      expect(
        screen.getByText("dentro do planejado · aviso em 80%"),
      ).toBeInTheDocument(),
    );
  });
  it("cria meta privada e registra reserva sem transformar aporte em movimentação bancária", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Nova meta pessoal" }));
    fireEvent.change(screen.getByLabelText("Nome da meta"), {
      target: { value: "Reserva de teste" },
    });
    fireEvent.change(screen.getByLabelText("Valor desejado (R$)"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText("Valor já separado (R$)"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Conta vinculada (opcional)"), {
      target: { value: "bank" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar meta" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Reserva de teste · Reserva de emergência",
        }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar aporte ou retirada" }),
    );
    fireEvent.change(screen.getByLabelText("Valor da reserva (R$)"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText("Motivo do registro"), {
      target: { value: "Dinheiro separado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar reserva" }));
    await waitFor(() =>
      expect(screen.getByText(/^R\$\s150,00$/)).toBeInTheDocument(),
    );
    const details = screen
      .getByText("Histórico da reserva Reserva de teste")
      .closest("details")!;
    expect(within(details).getByText(/Dinheiro separado/)).toBeInTheDocument();
  });
});
