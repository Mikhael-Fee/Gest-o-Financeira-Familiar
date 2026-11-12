import { test, expect } from "@playwright/test";
async function demo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, Pessoa A." }),
  ).toBeVisible();
  await page.getByLabel("Mês de referência").fill("2026-11");
}
async function go(page: import("@playwright/test").Page, name: string) {
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) await menu.click();
  await page.locator("aside").getByRole("link", { name, exact: true }).click();
}
test("navegação, relatório e segurança de saída", async ({ page }) => {
  await demo(page);
  await go(page, "Relatórios");
  await expect(
    page.getByRole("heading", { name: "Planejamento de 12 meses" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await go(page, "Configurações");
  await page.getByRole("button", { name: "Sair e limpar sessão" }).click();
  await expect(
    page.getByRole("button", { name: "Entrar com segurança" }),
  ).toBeVisible();
});
test("cria despesa com duas fontes e reflete nos saldos sem duplicar", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page
    .getByRole("button", { name: "Despesa Uma compra ou gasto do dia a dia" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Descrição / apelido").fill("Feira de teste");
  await dialog.getByLabel("Valor (R$)", { exact: true }).fill("100,00");
  await dialog.getByLabel("Data efetiva da operação").fill("2026-11-10");
  await dialog.getByLabel("Conta de origem / destino").selectOption("va-a");
  await dialog.getByText("Dividir entre dois meios de pagamento").click();
  await dialog
    .getByLabel("Segundo meio", { exact: true })
    .selectOption("bank-a");
  await dialog.getByLabel("Valor pago no segundo meio (R$)").fill("40,00");
  await dialog.getByLabel("Esta despesa é da Casa").check();
  await dialog.getByRole("button", { name: "Salvar com segurança" }).click();
  await expect(page.getByRole("status")).toContainText("Salvo");
  await expect(page.getByText("Feira de teste")).toBeVisible();
});
test("empréstimo antigo mantém histórico desconhecido e não gera caixa", async ({
  page,
}) => {
  await demo(page);
  await go(page, "Planejamento");
  await page.getByRole("button", { name: "Cadastrar empréstimo" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Descrição / apelido").fill("Contrato de teste");
  await dialog.getByLabel("Valor de cada parcela (R$)").fill("200");
  await dialog.getByLabel("Data do PRIMEIRO vencimento").fill("2026-03-20");
  await dialog.getByLabel("Quantidade TOTAL de parcelas").fill("10");
  await dialog.getByLabel("Número da última parcela").fill("8");
  await dialog.getByLabel("Data efetiva desse pagamento").fill("2026-10-20");
  await dialog.getByRole("button", { name: "Salvar com segurança" }).click();
  await page.getByText("Contrato de teste", { exact: true }).click();
  await expect(
    page
      .getByText("Parcelas anteriores permanecem a conferir.", { exact: false })
      .last(),
  ).toBeVisible();
  await expect(
    page.getByText("Nenhum pagamento registrado nesta sessão."),
  ).toBeVisible();
});
test("teclado e layout não excedem a tela", async ({ page }) => {
  await demo(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/financas-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("acessibilidade WCAG AA nas telas principais e formulário", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await demo(page);
  let results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page
    .getByRole("button", { name: "Despesa Uma compra ou gasto do dia a dia" })
    .click();
  results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});
test("corrige valores inválidos sem perder o formulário", async ({ page }) => {
  await demo(page);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page
    .getByRole("button", { name: "Despesa Uma compra ou gasto do dia a dia" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Descrição / apelido").fill("Teste de saldo");
  await dialog.getByLabel("Valor (R$)", { exact: true }).fill("0");
  await dialog.getByRole("button", { name: "Salvar com segurança" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Descrição / apelido")).toHaveValue(
    "Teste de saldo",
  );
});
test("categoria própria aparece no formulário de despesa", async ({ page }) => {
  await demo(page);
  await go(page, "Configurações");
  await page.getByRole("button", { name: "Criar categoria" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Descrição / apelido").fill("Feira do bairro");
  await dialog.getByRole("button", { name: "Salvar com segurança" }).click();
  await expect(page.getByRole("status")).toContainText("Salvo");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page
    .getByRole("button", { name: "Despesa Uma compra ou gasto do dia a dia" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByLabel("Categoria", { exact: true })
      .getByRole("option", { name: "Feira do bairro" }),
  ).toBeAttached();
});
test("confirmar Pix reduz acerto mas não quita fatura", async ({ page }) => {
  await demo(page);
  await go(page, "Casa");
  await page
    .getByRole("button", { name: "Confirmar recebimento", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Data efetiva da operação").fill("2026-11-12");
  await dialog.getByLabel("Conta de origem / destino").selectOption("bank-a");
  await dialog.getByRole("button", { name: "Salvar com segurança" }).click();
  await expect(page.getByRole("status")).toContainText("Salvo");
  await expect(
    page.locator(".settlement").getByText("R$ 250,00", { exact: true }),
  ).toBeVisible();
  await go(page, "Contas e cartões");
  await expect(
    page.locator(".statement-grid").getByText(/Em aberto:.*1.000,00/),
  ).toBeVisible();
  await expect(
    page.locator(".statement-grid").getByText(/Pago ao banco:.*0,00/),
  ).toBeVisible();
});
