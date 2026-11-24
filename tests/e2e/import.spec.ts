import { navigateUI, openExpense } from "./helpers";
import { expect, test, type Page } from "@playwright/test";
async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, Pessoa A." }),
  ).toBeVisible();
  await page.getByLabel("Mês de referência").fill("2026-11");
}
async function go(page: Page, name: string) {
  await navigateUI(page,name);
}
const csv =
  "Data;Descrição;Valor;Documento\n10/11/2026;Compra importada fictícia;-20,50;demo-bank-import-1\n11/11/2026;Extra importado fictício;50,00;demo-bank-import-2";
async function upload(page: Page, text = csv) {
  await page
    .getByLabel("Arquivo de extrato")
    .setInputFiles({
      name: "ficticio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(text),
    });
  await expect(
    page.getByRole("table", { name: /Prévia do extrato/ }),
  ).toBeVisible();
}
test("importação com prévia e reimportação sem duplicar movimentos", async ({
  page,
}) => {
  await demo(page);
  await go(page, "Movimentações");
  await upload(page);
  await expect(
    page.getByRole("button", { name: "Confirmar importação de 2 movimentos" }),
  ).toBeDisabled();
  await page.getByLabel(/Conferi datas, valores e classificações/).check();
  await page
    .getByRole("button", { name: "Confirmar importação de 2 movimentos" })
    .click();
  await expect(
    page.getByText(
      "Extrato importado. Reimportar as mesmas linhas não movimenta o saldo novamente.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Compra importada fictícia", { exact: true }),
  ).toHaveCount(1);
  await upload(page);
  await expect(
    page.getByRole("button", { name: "Confirmar importação de 0 movimentos" }),
  ).toBeDisabled();
  await expect(page.getByText("Já importado: será ignorado")).toHaveCount(2);
});
test("Pix exige classificação explícita e pagamento vinculado não duplica consumo", async ({
  page,
}) => {
  await demo(page);
  await go(page, "Movimentações");
  await upload(
    page,
    "Data;Descrição;Valor;Documento\n10/11/2026;Pix fictício;-10,00;demo-pix-1",
  );
  await expect(page.getByLabel("Classificação linha 1")).toHaveValue("ignore");
  await expect(
    page.getByRole("button", { name: "Confirmar importação de 0 movimentos" }),
  ).toBeDisabled();
  await page.getByLabel("Classificação linha 1").selectOption("transfer");
  await page.getByLabel(/Conferi datas, valores e classificações/).check();
  await page
    .getByRole("button", { name: "Confirmar importação de 1 movimentos" })
    .click();
  await expect(
    page.getByText(
      "Extrato importado. Reimportar as mesmas linhas não movimenta o saldo novamente.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Pix fictício", { exact: true })).toHaveCount(0);
  await page.getByText("Histórico e correção de importações").click();
  await expect(page.getByText(/Pix fictício.*transfer/)).toBeVisible();
});
test("etiqueta usada pode ser renomeada com histórico preservado", async ({
  page,
}) => {
  await demo(page);
  await openExpense(page);
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Descrição / apelido")
    .fill("Compra com etiqueta fictícia");
  await dialog.getByLabel("Valor (R$)", { exact: true }).fill("10,00");
  await dialog.getByLabel("Data da compra").fill("2026-11-10");
  await dialog.getByLabel("Conta utilizada").selectOption("bank-a");
  await dialog.getByText("Mais opções do gasto",{exact:true}).click();
  await dialog.getByLabel("Tags separadas por vírgulas").fill("Viagem teste");
  await dialog.getByRole("button", { name: "Salvar com segurança" }).click();
  await go(page, "Configurações");
  const panel = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Minhas etiquetas", exact: true }),
    })
    .last();
  await panel
    .getByRole("button", { name: "Editar etiqueta", exact: true })
    .click();
  await panel.getByLabel("Nome da etiqueta").fill("Férias teste");
  await panel.getByRole("button", { name: "Salvar etiqueta" }).click();
  await expect(panel.getByText(/Férias teste.*1 lançamentos/)).toBeVisible();
  await go(page, "Movimentações");
  await page.getByLabel("Buscar descrição ou categoria").fill("Férias teste");
  await expect(
    page.getByText("Compra com etiqueta fictícia", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Buscar descrição ou categoria").fill("Viagem teste");
  await expect(
    page.getByText("Compra com etiqueta fictícia", { exact: true }),
  ).toHaveCount(0);
});
test("guia permite pular informações e reabrir sem criar dados", async ({
  page,
}) => {
  await demo(page);
  await go(page, "Configurações");
  await page
    .getByRole("button", { name: "Guia de primeiros passos", exact: true })
    .click();
  for (let i = 1; i < 9; i++) {
    await expect(
      page.getByText(`Etapa ${i} de 9`, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Pular por enquanto", exact: true })
      .click();
  }
  await expect(page.getByText(/Meu espaço funciona sozinho/)).toBeVisible();
  await page
    .getByRole("button", { name: "Concluir guia", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Reabrir guia de primeiros passos",
      exact: true,
    })
    .click();
  await expect(page.getByText("Etapa 1 de 9", { exact: true })).toBeVisible();
});
