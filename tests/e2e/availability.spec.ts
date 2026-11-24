import { navigateUI } from "./helpers";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function open(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.getByLabel("Mês de referência").fill("2026-11");
  await navigateUI(page, "Relatórios");
  await expect(
    page.getByRole("heading", { name: "Seus relatórios", exact: true }),
  ).toBeVisible();
}
test("disponível mantém caixa separado de previsão, permite confirmar e isola Casa", async ({
  page,
}) => {
  await open(page);
  const panel = page.getByRole("region", {
    name: "Dinheiro disponível estimado",
  });
  await expect(
    panel.getByRole("heading", { name: "Quanto posso gastar?" }),
  ).toBeVisible();
  await panel.getByLabel("Horizonte do disponível").selectOption("90");
  const bank = panel
    .getByText("Saldo bancário registrado", { exact: true })
    .locator("..");
  const initial = await bank.innerText();
  await panel
    .getByRole("button", { name: "Planejar recebimento", exact: true })
    .click();
  await panel
    .getByLabel("Descrição do recebimento")
    .fill("Extra fictício verificável");
  await panel.getByLabel("Valor previsto (R$)").fill("125,00");
  await panel.getByLabel("Data prevista da entrada").fill("2026-11-15");
  await panel.getByLabel("Mês de referência da entrada").fill("2026-11");
  await panel
    .getByLabel("Conta do recebimento ou reserva")
    .selectOption("bank-a");
  await panel.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(panel.locator("form")).toHaveCount(0);
  expect(await bank.innerText()).toBe(initial);
  await panel
    .getByText("Recebimentos futuros e histórico de confirmação", {
      exact: true,
    })
    .click();
  await expect(
    panel.getByText("Extra fictício verificável", { exact: false }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Confirmar recebimento", exact: true })
    .click();
  await panel.getByLabel("Valor recebido (R$)").fill("130,00");
  await panel.getByLabel("Data efetiva da entrada").fill("2026-11-15");
  await panel
    .getByLabel("Conta do recebimento ou reserva")
    .selectOption("bank-a");
  await panel.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(panel.locator("form")).toHaveCount(0);
  expect(await bank.innerText()).not.toBe(initial);
  await expect(
    panel.getByText("Recebido e vinculado ao caixa", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Visão financeira" })
    .getByRole("button", { name: "Casa", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
});
test("previsão salarial oferece três cenários, preserva data/competência e acessibilidade", async ({
  page,
}) => {
  await open(page);
  const panel = page.locator(".salary-panel");
  await panel.getByRole("button", { name: "Ajustar previsão do mês" }).click();
  await panel.getByLabel("Método da previsão mensal").selectOption("history");
  await expect(
    panel.getByText("Um bônus isolado não define o salário habitual.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(panel.getByLabel("Previsão deste mês (R$)")).toHaveAttribute(
    "readonly",
    "",
  );
  await panel.getByLabel("Método da previsão mensal").selectOption("manual");
  await panel.getByLabel("Previsão deste mês (R$)").fill("2800");
  await panel.getByLabel("Data prevista do salário").fill("2026-12-05");
  await panel.getByRole("button", { name: "Salvar previsão" }).click();
  await panel.getByRole("button", { name: "Ajustar previsão do mês" }).click();
  await expect(panel.getByLabel("Data prevista do salário")).toHaveValue(
    "2026-12-05",
  );
  const results = await new AxeBuilder({ page })
    .include(".salary-panel")
    .analyze();
  expect(results.violations).toEqual([]);
});
