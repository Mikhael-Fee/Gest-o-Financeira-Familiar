import { expect, type Page } from "@playwright/test";
export async function navigateUI(page: Page, name: string) {
  if (await page.locator("aside").isVisible())
    await page
      .locator("aside")
      .getByRole("link", { name, exact: true })
      .click();
  else if (["Início", "Casa", "Movimentações"].includes(name)) {
    await page
      .locator(".bottom-nav")
      .getByRole("link", {
        name: name === "Movimentações" ? "Movimentos" : name,
        exact: true,
      })
      .click();
  } else {
    await page.getByRole("button", { name: "Mais", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Mais opções", exact: true })
      .getByRole("link", { name, exact: true })
      .click();
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    name === "Início" ? /^Olá,/ : name,
  );
}
export async function openRecords(page: Page) {
  if (new URL(page.url()).pathname === "/")
    await page
      .getByRole("button", { name: "Mais registros", exact: true })
      .click();
  else
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
}
export async function openExpense(page: Page) {
  const direct = page.getByRole("button", {
    name: "Registrar gasto",
    exact: true,
  });
  if (await direct.isVisible()) await direct.click();
  else {
    await openRecords(page);
    await page
      .getByRole("button", { name: "Despesa Uma compra ou gasto do dia a dia" })
      .click();
  }
}
export async function openReportFilters(page: Page) {
  const toggle = page.getByText("Filtrar relatórios", { exact: true });
  await toggle.waitFor({ state: "visible" });
  if ((await toggle.locator("..").getAttribute("open")) === null)
    await toggle.click();
  await expect(
    page.getByLabel("Janela de comparação", { exact: true }),
  ).toBeVisible();
}
