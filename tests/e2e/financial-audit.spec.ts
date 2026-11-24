import { navigateUI } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  await navigateUI(page,name);
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

test("tabela financeira expandida permanece acessível e navegável em tela estreita", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.getByLabel("Mês de referência").fill("2026-11");
  await nav(page, "Relatórios");
  const section = page.getByRole("region", { name: "Contribuições à Casa" });
  await section
    .getByText("Ver dados em tabela · contribuições à Casa", { exact: true })
    .click();
  await expect(section.getByRole("table")).toBeVisible();
  await section
    .getByText("Ver dados em tabela · contribuições à Casa", { exact: true })
    .press("Tab");
  await expect(
    section.getByRole("region", {
      name: "Dados de contribuições à Casa",
      exact: true,
    }),
  ).toBeFocused();
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});
