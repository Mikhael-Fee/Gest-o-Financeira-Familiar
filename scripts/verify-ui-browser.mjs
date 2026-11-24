// Explicit operator check, never setup/CI. Uses only the existing fictional audit family.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { readFile, writeFile, realpath } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { navigateBrowser } from "./browser-navigation.mjs";

export async function verifyUiBrowser({ origin, fixturePath, evidencePath }) {
  if (origin !== "https://entre-nos-homologacao.netlify.app")
    throw Error("Origem fora da homologação autorizada");
  const root = await realpath(new URL("..", import.meta.url));
  for (const path of [fixturePath, evidencePath]) {
    if (!relative(root, await realpath(dirname(path))).startsWith(".."))
      throw Error("Credenciais e evidências devem ficar fora do checkout");
  }
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const member = fixture.members[0];
  if (!/^audit_[a-f0-9]{8}_0$/.test(member.username))
    throw Error(
      "Esta verificação aceita somente a identidade fictícia de auditoria",
    );
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  const label = `Validação UI fictícia ${crypto.randomUUID().slice(0, 8)}`;
  let step = "login público";
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "pt-BR",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(origin);
    await page
      .getByLabel("Nome de usuário", { exact: true })
      .fill(member.username);
    await page.getByLabel("Senha", { exact: true }).fill(member.password);
    await page
      .getByRole("button", { name: "Entrar com segurança", exact: true })
      .click();
    await page
      .getByRole("region", { name: "Resumo do meu dinheiro" })
      .waitFor();
    const month = await page
      .getByLabel("Mês de referência", { exact: true })
      .inputValue();
    const date = new Date().toISOString().slice(0, 10);
    async function selectSource(field, suffix) {
      const select = page.getByLabel(field, { exact: true });
      const value = await select
        .getByRole("option")
        .filter({ hasText: label + suffix })
        .getAttribute("value");
      assert.ok(value, "Fonte fictícia disponível no formulário");
      await select.selectOption(value);
    }
    async function chooser(name) {
      if (new URL(page.url()).pathname === "/")
        await page
          .getByRole("button", { name: "Mais registros", exact: true })
          .click();
      else
        await page
          .getByRole("button", { name: "Adicionar", exact: true })
          .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name, exact: false })
        .click();
    }
    async function save(payment = false) {
      await page
        .getByRole("dialog")
        .getByRole("button", {
          name: payment ? "Confirmar pagamento" : "Salvar com segurança",
          exact: true,
        })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    async function expense(description, amount, house = false, credit = false) {
      await navigateBrowser(page, "Início");
      await page
        .getByRole("button", { name: "Registrar gasto", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Valor (R$)", { exact: true }).fill(amount);
      await dialog.getByLabel("Descrição / apelido").fill(description);
      await dialog
        .getByLabel("Forma de pagamento")
        .selectOption(credit ? "credit" : "pix");
      await selectSource(
        credit ? "Cartão utilizado" : "Conta utilizada",
        credit ? " cartão" : " conta",
      );
      await dialog
        .getByLabel("Esta despesa é da Casa", { exact: true })
        .setChecked(house);
      await save();
    }
    step = "saldo inicial fictício";
    await chooser("Conta ou benefício Saldo inicial");
    await page.getByLabel("Descrição / apelido").fill(label + " conta");
    await page.getByLabel("Saldo inicial (R$)").fill("100");
    await save();
    step = "receita fictícia";
    await page
      .getByRole("button", { name: "Registrar entrada", exact: true })
      .click();
    await page.getByLabel("Descrição / apelido").fill(label + " entrada");
    await page.getByLabel("Valor (R$)", { exact: true }).fill("50");
    await page.getByLabel("Tipo de receita").selectOption("extra");
    await selectSource("Conta de origem / destino", " conta");
    await save();
    step = "compra fictícia";
    await expense(label + " compra", "10");
    step = "cartão e compra sem débito bancário";
    await chooser("Cartão de crédito Fechamento");
    await page.getByLabel("Descrição / apelido").fill(label + " cartão");
    await page.getByLabel("Dia de fechamento").fill("5");
    await page.getByLabel("Dia de vencimento").fill("25");
    await save();
    await expense(label + " crédito", "20", false, true);
    await navigateBrowser(page, "Contas e cartões");
    const card = page.locator(".card-detail").filter({
      has: page.getByRole("heading", {
        name: label + " cartão",
        exact: false,
      }),
    });
    await card
      .getByText("Ver faturas, compras e parcelas", { exact: true })
      .click();
    await card
      .getByText("Compras e parcelas desta fatura", { exact: true })
      .first()
      .click();
    assert.ok((await card.innerText()).includes(label + " crédito"));
    step = "empréstimo e pagamento de obrigação existente";
    await navigateBrowser(page, "Empréstimos");
    await page
      .getByRole("button", { name: "Cadastrar empréstimo", exact: true })
      .click();
    await page.getByLabel("Descrição / apelido").fill(label + " empréstimo");
    await page.getByLabel("Valor de cada parcela (R$)").fill("10");
    await page
      .getByLabel("Data do PRIMEIRO vencimento", { exact: true })
      .fill(date);
    await page.getByLabel("Quantidade TOTAL de parcelas").fill("3");
    await save();
    const loan = page
      .locator(".plan")
      .filter({ hasText: label + " empréstimo" });
    await loan.locator("summary").click();
    assert.equal(await loan.locator(".installments > div").count(), 3);
    await loan
      .getByRole("button", { name: "Pagar", exact: true })
      .first()
      .click();
    await page.getByLabel("Valor (R$)", { exact: true }).fill("10");
    await selectSource("Conta de origem / destino", " conta");
    await save(true);
    step = "contribuição real fictícia da Casa";
    await expense(label + " Casa", "5", true);
    await navigateBrowser(page, "Casa");
    assert.ok(
      (await page.locator("main").innerText()).includes(label + " Casa"),
    );
    step = "histórico e correção sem apagar auditoria";
    await navigateBrowser(page, "Início");
    await navigateBrowser(page, "Movimentações");
    await page
      .getByLabel("Buscar descrição ou categoria")
      .fill(label + " compra");
    const row = page
      .locator(".entry-row")
      .filter({ hasText: label + " compra" });
    await row.waitFor();
    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "Anular", exact: true }).click();
    await row.waitFor({ state: "hidden" });
    step = "saldo após receita, despesa, pagamento, Casa e correção";
    await navigateBrowser(page, "Contas e cartões");
    const account = page
      .locator(".account-card")
      .filter({ hasText: label + " conta" });
    assert.ok(
      (await account.innerText())
        .replaceAll("\u00a0", " ")
        .includes("R$ 135,00"),
    );
    step = "tema claro e texto maior na sessão real";
    await navigateBrowser(page, "Configurações");
    await page.getByLabel("Tema do aplicativo").selectOption("light");
    await page.getByLabel("Tamanho do texto").selectOption("large");
    await navigateBrowser(page, "Início");
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.equal(axe.violations.length, 0);
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth + 1,
      ),
    );
    step = "saída e sessão descartada";
    await navigateBrowser(page, "Configurações");
    await page
      .getByRole("button", { name: "Sair e limpar sessão", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Entrar com segurança", exact: true })
      .waitFor();
    await page.reload();
    assert.equal(
      await page
        .getByRole("region", { name: "Resumo do meu dinheiro" })
        .count(),
      0,
    );
    const evidence = {
      origin,
      month,
      viewport: { width: 390, height: 844 },
      fictionalOnly: true,
      backendMocked: false,
      login: true,
      expense: true,
      income: true,
      payExisting: true,
      invoice: true,
      loanCalendar: true,
      houseContribution: true,
      history: true,
      correction: true,
      logout: true,
      bankExpectedCents: 13500,
      bankVerified: true,
      axeViolations: 0,
      reflow: true,
    };
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), {
      mode: 0o600,
    });
    await context.close();
    return evidence;
  } catch (error) {
    await writeFile(
      evidencePath + ".error.private.txt",
      String(error.stack || error),
      { mode: 0o600 },
    );
    throw Error(
      `Verificação UI interrompida em: ${step}. Diagnóstico privado, sem credenciais no relatório.`,
      { cause: error },
    );
  } finally {
    await browser.close();
  }
}
