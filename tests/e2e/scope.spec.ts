import { test, expect, type Page } from "@playwright/test";
async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, Pessoa A." }),
  ).toBeVisible();
  await page.getByLabel("Mês de referência").fill("2026-11");
}
async function go(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) await menu.click();
  await page.locator("aside").getByRole("link", { name, exact: true }).click();
}
test("Início da Casa não apresenta saldos ou benefícios pessoais", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Casa", exact: true }).click();
  await expect(page.getByText("Saldo em contas", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", {
      name: "Alimentação, bem cuidada",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByText("Entradas do mês", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".metrics")).toContainText("Consumo da Casa");
  await expect(page.locator(".metrics")).toContainText("400,00");
  await expect(page.locator("#main-content")).not.toContainText(
    "Empréstimo demonstrativo",
  );
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
});
test("navegação identifica Casa e contas pessoais de forma coerente", async ({
  page,
}) => {
  await demo(page);
  await go(page, "Casa");
  await expect(
    page.getByRole("button", { name: "Casa", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await go(page, "Contas e cartões");
  await expect(
    page.getByRole("button", { name: "Meu espaço", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("Inter · conta principal", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Casa", exact: true }).click();
  await expect(page).toHaveURL(/\/casa$/);
  await go(page, "Configurações");
  await expect(
    page.getByRole("button", { name: "Meu espaço", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("planejamento da Casa mantém contratos pessoais no Meu espaço", async ({
  page,
}) => {
  await demo(page);
  await go(page, "Planejamento");
  await expect(
    page.getByText("Empréstimo demonstrativo", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Casa", exact: true }).click();
  await expect(
    page.getByText("Empréstimo demonstrativo", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cadastrar empréstimo", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Meu espaço", exact: true }).click();
  await expect(
    page.getByText("Empréstimo demonstrativo", { exact: true }),
  ).toBeVisible();
});
test("adicionar na Casa oferece ações compartilhadas e marca a despesa", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Casa", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: /Salário ou entrada extra/ }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Despesa Uma compra ou gasto do dia a dia" })
    .click();
  await expect(
    dialog.getByLabel("Esta despesa é da Casa", { exact: true }),
  ).toBeChecked();
  await dialog.getByRole("button", { name: "Fechar formulário" }).click();
  await page.getByRole("button", { name: "Meu espaço", exact: true }).click();
  await expect(page.locator(".house-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: /Salário ou entrada extra/ }),
  ).toBeVisible();
});
test("troca de visão limpa busca e nova sessão começa no Meu espaço", async ({
  page,
}) => {
  await demo(page);
  await go(page, "Movimentações");
  await page
    .getByLabel("Buscar descrição ou categoria")
    .fill("busca-sem-resultados");
  await page.getByRole("button", { name: "Casa", exact: true }).click();
  await expect(page.getByLabel("Buscar descrição ou categoria")).toHaveValue(
    "",
  );
  await expect(
    page.getByText("Mercado da semana", { exact: true }),
  ).toBeVisible();
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) await menu.click();
  await page.locator("aside .profile").click();
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await expect(
    page.getByRole("button", { name: "Meu espaço", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
