import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { navigateUI, openExpense } from "./helpers";
async function demo(page: Page) {
  await page.clock.setFixedTime(new Date("2026-11-17T12:00:00Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await expect(
    page.getByRole("region", { name: "Resumo do meu dinheiro" }),
  ).toBeVisible();
}
async function save(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar com segurança", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
const money = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator("..");
test("tema e texto maior funcionam nas telas e no formulário, sem guardar finanças", async ({
  page,
}) => {
  await demo(page);
  await navigateUI(page, "Configurações");
  await page.getByLabel("Tema do aplicativo").selectOption("light");
  await page.getByLabel("Tamanho do texto").selectOption("large");
  await navigateUI(page, "Início");
  await expect(money(page, "Saldo registrado")).toContainText("3.050,00");
  await openExpense(page);
  expect(
    await page
      .getByLabel("Descrição / apelido")
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(18);
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  await page
    .getByRole("button", { name: "Fechar formulário", exact: true })
    .click();
  await navigateUI(page, "Configurações");
  await page.getByRole("button", { name: "Sair e limpar sessão" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Entrar com segurança" }),
  ).toBeVisible();
  expect(
    await page
      .locator("html")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(243, 246, 250)");
  expect(
    await page
      .getByLabel("Nome de usuário")
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(18);
  const stored = await page.evaluate(() => ({ ...localStorage }));
  expect(Object.keys(stored)).toEqual(["entre-nos:appearance:v1"]);
  expect(JSON.stringify(stored)).not.toMatch(/Inter|Pessoa|token|3\.050/);
});
test("preferência do sistema acompanha claro e escuro, mantendo escuro como início", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  expect(
    await page
      .locator("html")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(23, 33, 43)");
  await page.getByText("Ajustar aparência e texto", { exact: true }).click();
  await page.getByLabel("Tema do aplicativo").selectOption("system");
  await expect
    .poll(() =>
      page.locator("html").evaluate((e) => getComputedStyle(e).backgroundColor),
    )
    .toBe("rgb(243, 246, 250)");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() =>
      page.locator("html").evaluate((e) => getComputedStyle(e).backgroundColor),
    )
    .toBe("rgb(23, 33, 43)");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
});
test("compra no cartão é progressiva e não debita banco; VA só oferece alimentação", async ({
  page,
}) => {
  await demo(page);
  await openExpense(page);
  const d = page.getByRole("dialog");
  await d.getByLabel("Valor (R$)", { exact: true }).fill("600");
  await d.getByLabel("Descrição / apelido").fill("Compra parcelada fictícia");
  await d.getByLabel("Forma de pagamento").selectOption("credit");
  await expect(d.getByLabel("Conta utilizada")).toHaveCount(0);
  await expect(d.getByLabel("Cartão utilizado")).toBeVisible();
  await expect(
    d.getByLabel("Quantidade de parcelas no cartão", { exact: false }),
  ).not.toBeVisible();
  await d.getByText("Mais opções do gasto", { exact: true }).click();
  await d
    .getByLabel("Quantidade de parcelas no cartão", { exact: false })
    .fill("3");
  await save(page);
  await expect(money(page, "Saldo registrado")).toContainText("3.050,00");
  await openExpense(page);
  await d.getByLabel("Forma de pagamento").selectOption("VA");
  await expect(
    d.getByLabel("Categoria", { exact: true }).getByRole("option"),
  ).toHaveCount(1);
  await expect(d.getByLabel("Categoria", { exact: true })).toHaveValue(
    "Alimentação",
  );
  await expect(d.getByLabel("Conta utilizada")).toHaveValue("va-a");
  await expect(d.getByLabel("Cartão utilizado")).toHaveCount(0);
});
test("pagamento parcial mostra a conta, preserva o consumo e desconta o restante uma única vez", async ({
  page,
}) => {
  await demo(page);
  await page
    .getByRole("button", { name: /Pagar Empréstimo demonstrativo/ })
    .first()
    .click();
  const d = page.getByRole("dialog");
  await expect(d.locator(".payment-context")).toContainText("200,00");
  await d.getByLabel("Valor (R$)", { exact: true }).fill("50");
  await d
    .getByRole("button", { name: "Confirmar pagamento", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  await expect(money(page, "Saldo registrado")).toContainText("3.000,00");
  await expect(page.locator(".home-available")).toContainText("450,00");
  await page
    .getByText("Resumo do mês e minha contribuição à Casa", { exact: true })
    .click();
  await expect(money(page, "Consumo do mês")).toContainText("750,00");
  await navigateUI(page, "Empréstimos");
  await page.locator(".plan>summary").first().click();
  await expect(
    page.locator(".installments>div").filter({ hasText: "9/10" }),
  ).toContainText("150,00");
  await expect(
    page.locator(".installments>div").filter({ hasText: "9/10" }),
  ).toContainText("2026-11-20");
});
test("jornada de gasto, entrada, Casa, histórico e correção mantém valores coerentes", async ({
  page,
}) => {
  await demo(page);
  await openExpense(page);
  const d = page.getByRole("dialog");
  await d.getByLabel("Valor (R$)", { exact: true }).fill("50");
  await d
    .getByLabel("Descrição / apelido")
    .fill("Gasto fictício para corrigir");
  await save(page);
  await page
    .getByRole("button", { name: "Registrar entrada", exact: true })
    .click();
  await d.getByLabel("Descrição / apelido").fill("Extra fictício recebido");
  await d.getByLabel("Valor (R$)", { exact: true }).fill("100");
  await d.getByLabel("Tipo de receita").selectOption("extra");
  await save(page);
  await expect(money(page, "Saldo registrado")).toContainText("3.100,00");
  await openExpense(page);
  await d.getByLabel("Valor (R$)", { exact: true }).fill("100");
  await d.getByLabel("Descrição / apelido").fill("Casa com VA fictício");
  await d.getByLabel("Forma de pagamento").selectOption("VA");
  await d.getByLabel("Esta despesa é da Casa").check();
  await save(page);
  await navigateUI(page, "Casa");
  await expect(
    page.getByRole("region", { name: "Resumo da Casa" }),
  ).toContainText("500,00");
  await navigateUI(page, "Início");
  await navigateUI(page, "Movimentações");
  await page
    .getByLabel("Buscar descrição ou categoria")
    .fill("Gasto fictício para corrigir");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Anular", exact: true }).click();
  await expect(
    page.getByText("Gasto fictício para corrigir", { exact: true }),
  ).toHaveCount(0);
  await navigateUI(page, "Início");
  await expect(money(page, "Saldo registrado")).toContainText("3.150,00");
  await navigateUI(page, "Configurações");
  await page.getByRole("button", { name: "Sair e limpar sessão" }).click();
  await expect(
    page.getByRole("button", { name: "Entrar com segurança" }),
  ).toBeVisible();
});
test("menu prende e devolve o foco; ampliação 200% e paisagem mantêm campos operáveis", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 430 });
  await demo(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Mais", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Mais opções", exact: true });
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await menu.evaluate((d) => d.contains(document.activeElement))).toBe(
      true,
    );
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Mais", exact: true }),
  ).toBeFocused();
  await openExpense(page);
  await page.getByLabel("Descrição / apelido").fill("Texto ampliado fictício");
  await page.getByLabel("Valor (R$)", { exact: true }).fill("10");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar com segurança", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(2);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
});
