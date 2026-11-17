import { test, expect, type Page } from "@playwright/test";
async function go(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) await menu.click();
  await page.locator("aside").getByRole("link", { name, exact: true }).click();
}
async function planning(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.getByLabel("Mês de referência").fill("2026-11");
  await go(page, "Planejamento");
  await expect(
    page.getByRole("heading", { name: "Orçamento pessoal · 2026-11" }),
  ).toBeVisible();
}
test("orçamento pessoal compara consumo sem Casa e copia preservando o mês", async ({
  page,
}) => {
  await planning(page);
  await page.getByRole("button", { name: "Novo orçamento" }).click();
  await page
    .getByLabel("Categoria do orçamento")
    .selectOption("Compras pessoais");
  await page.getByLabel("Valor planejado (R$)").fill("300");
  await page
    .getByRole("button", { name: "Salvar orçamento", exact: true })
    .click();
  const budget = page.getByRole("region", {
    name: "Orçamento pessoal · 2026-11",
  });
  await expect(budget).toContainText("R$ 350,00");
  await expect(budget).toContainText("ultrapassado");
  await expect(budget).toContainText("-R$ 50,00");
  await page.getByLabel("Mês de referência").fill("2026-12");
  await page.getByRole("button", { name: "Copiar mês anterior" }).click();
  await expect(
    page.getByRole("region", { name: "Orçamento pessoal · 2026-12" }),
  ).toContainText("R$ 300,00");
  await page.getByRole("button", { name: "Casa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Orçamento pessoal/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Economia e reserva pessoal" }),
  ).toHaveCount(0);
});
test("meta registra aporte retirada e estorno sem alterar saldo bancário", async ({
  page,
}) => {
  await planning(page);
  await page.getByRole("button", { name: "Nova meta pessoal" }).click();
  await page.getByLabel("Nome da meta").fill("Reserva fictícia");
  await page.getByLabel("Valor desejado (R$)").fill("2000");
  await page.getByLabel("Valor já separado (R$)").fill("100");
  await page.getByLabel("Conta vinculada (opcional)").selectOption("bank-a");
  await page.getByRole("button", { name: "Salvar meta", exact: true }).click();
  const goals = page.getByRole("region", {
    name: "Economia e reserva pessoal",
  });
  await expect(goals).toContainText("R$ 100,00");
  await page
    .getByRole("button", { name: "Registrar aporte ou retirada" })
    .click();
  await page.getByLabel("Valor da reserva (R$)").fill("50");
  await page
    .getByLabel("Motivo do registro")
    .fill("Dinheiro separado para teste");
  await page
    .getByRole("button", { name: "Salvar reserva", exact: true })
    .click();
  await expect(goals).toContainText("R$ 150,00");
  await page
    .getByRole("button", { name: "Registrar aporte ou retirada" })
    .click();
  await page.getByLabel("Operação na reserva").selectOption("withdrawal");
  await page.getByLabel("Valor da reserva (R$)").fill("20");
  await page.getByLabel("Motivo do registro").fill("Retirada fictícia");
  await page
    .getByRole("button", { name: "Salvar reserva", exact: true })
    .click();
  await expect(goals).toContainText("R$ 130,00");
  await page
    .getByRole("button", { name: "Registrar aporte ou retirada" })
    .click();
  await page.getByLabel("Operação na reserva").selectOption("reverse");
  await page.getByLabel("Registro a estornar").selectOption({
    label: (
      await page
        .getByLabel("Registro a estornar")
        .locator("option")
        .allTextContents()
    ).find((x) => x.includes("Retirada fictícia"))!,
  });
  await page.getByLabel("Motivo do registro").fill("Estorno de teste");
  await page
    .getByRole("button", { name: "Salvar reserva", exact: true })
    .click();
  await expect(goals).toContainText("R$ 150,00");
  await go(page, "Contas e cartões");
  const account = page
    .locator("article")
    .filter({ has: page.getByText("Inter · conta principal", { exact: true }) })
    .first();
  await expect(account).toContainText("3.050,00");
});
test("planejamento pessoal mantém acessibilidade e largura mobile", async ({
  page,
}) => {
  await planning(page);
  await page.getByRole("button", { name: "Nova meta pessoal" }).click();
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
