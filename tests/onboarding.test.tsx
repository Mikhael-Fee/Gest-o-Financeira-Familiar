import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Onboarding } from "../src/components/Onboarding";

afterEach(cleanup);

describe("guia de primeiros passos", () => {
  it("permite pular todas as etapas sem criar registros nem depender da Casa", () => {
    const onAction = vi.fn();
    const onNavigate = vi.fn();
    render(
      <Onboarding initiallyOpen onAction={onAction} onNavigate={onNavigate} />,
    );
    expect(
      screen.getByRole("heading", { name: "Seu acesso é individual" }),
    ).toBeVisible();
    for (let step = 1; step < 9; step++) {
      expect(screen.getByText(`Etapa ${step} de 9`)).toBeVisible();
      fireEvent.click(
        screen.getByRole("button", { name: "Pular por enquanto" }),
      );
    }
    expect(screen.getByText(/Meu espaço funciona sozinho/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Concluir guia" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Você percorreu o guia",
    );
    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reabrir guia de primeiros passos" }),
    );
    expect(screen.getByText("Etapa 1 de 9")).toBeVisible();
  });

  it("abre os formulários existentes por escolha explícita e mantém a orientação", () => {
    const onAction = vi.fn();
    render(<Onboarding initiallyOpen onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar conta" }));
    expect(onAction).toHaveBeenLastCalledWith("account");
    expect(screen.getByText("Etapa 2 de 9")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Configurar referência de salário" }),
    );
    expect(onAction).toHaveBeenLastCalledWith("salary");
    expect(screen.getByText(/não adiciona dinheiro ao saldo/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar cartão" }));
    expect(onAction).toHaveBeenLastCalledWith("card");
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Cadastrar empréstimo existente" }),
    );
    expect(onAction).toHaveBeenLastCalledWith("loan");
    expect(screen.getByText(/não quita automaticamente/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar VA ou VR" }));
    expect(onAction).toHaveBeenLastCalledWith("account");
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar categoria" }));
    expect(onAction).toHaveBeenLastCalledWith("category");
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Cadastrar conta recorrente" }),
    );
    expect(onAction).toHaveBeenLastCalledWith("recurrence");
  });

  it("fecha, reabre e volta pelo guia sem abrir formulários automaticamente", () => {
    const onAction = vi.fn();
    render(<Onboarding onAction={onAction} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Guia de primeiros passos" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("Etapa 1 de 9")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Fechar guia de primeiros passos" }),
    );
    expect(
      screen.queryByRole("region", { name: "Primeiros passos no Entre Nós" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Guia de primeiros passos" }),
    );
    expect(screen.getByText("Etapa 1 de 9")).toBeVisible();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("navega à Casa somente a pedido e informa o limite de privacidade", () => {
    const onNavigate = vi.fn();
    render(
      <Onboarding initiallyOpen onAction={vi.fn()} onNavigate={onNavigate} />,
    );
    for (let step = 1; step < 9; step++)
      fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    expect(
      screen.getByText(/não mostra automaticamente seus salários/),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Conhecer a Casa" }));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("/casa");
  });
});
