import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) await menu.click();
  await page.locator("aside").getByRole("link", { name, exact: true }).click();
}
test("relatórios explicam orçamento estrito, consumo atribuído e dinheiro destinado à Casa", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.getByLabel("Mês de referência").fill("2026-11");
  await nav(page, "Relatórios");
  const metric = (label: string) =>
    page.getByText(label, { exact: true }).locator("..");
  await expect(metric("Meus gastos estritamente pessoais")).toContainText(
    "350,00",
  );
  await expect(metric("Consumo da Casa atribuído a mim")).toContainText(
    "400,00",
  );
  await expect(metric("Total de consumo atribuído a mim")).toContainText(
    "750,00",
  );
  await expect(metric("Total financeiro assumido")).toContainText("750,00");
  await expect(
    page.getByRole("region", { name: "Contribuições à Casa" }),
  ).toContainText("adiantamento, sem contribuição definitiva");
  await expect(
    page.getByRole("region", { name: "Dinheiro disponível estimado" }),
  ).toContainText("Acertos a receber de familiares");
  await nav(page, "Planejamento");
  await expect(
    page.getByText("Somente seu consumo pessoal, na data da compra.", {
      exact: false,
    }),
  ).toBeVisible();
});
