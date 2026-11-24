// Real browser verification on the existing homologation, using only operator-created fictional accounts.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { navigateBrowser } from "./browser-navigation.mjs";
export async function verifyFinancialBrowser({
  origin,
  fixturePath,
  evidencePath,
  members = [1, 2, 3],
}) {
  if (origin !== "https://entre-nos-homologacao.netlify.app")
    throw Error("Site fora da homologação autorizada");
  const f = JSON.parse(await readFile(fixturePath, "utf8"));
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  const evidence = [];
  let step = "abrir navegador";
  try {
    for (const [member, viewport] of [
      [1, { width: 1366, height: 900 }],
      [2, { width: 393, height: 851 }],
      [3, { width: 393, height: 851 }],
    ]) {
      if (!members.includes(member)) continue;
      step = `login fictício ${member}`;
      const context = await browser.newContext({ viewport }),
        page = await context.newPage();
      page.setDefaultTimeout(30000);
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await page
        .getByLabel("Nome de usuário", { exact: true })
        .fill(f.members[member].username);
      await page
        .getByLabel("Senha", { exact: true })
        .fill(f.members[member].password);
      await page
        .getByRole("button", { name: "Entrar com segurança", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: `Olá, ${f.members[member].username}.`,
          exact: true,
        })
        .waitFor({ state: "visible" });
      await page.getByLabel("Mês de referência").fill("2026-11");
      step = `valores e privacidade do membro ${member}`;
      const metric = async (label, amount) => {
        const t = await page
          .getByText(label, { exact: true })
          .locator("..")
          .innerText();
        assert.ok(
          t.replaceAll("\u00a0", " ").includes(amount),
          `${label}: resultado divergente`,
        );
      };
      const nav = (name) => navigateBrowser(page, name);
      if (member === 1) {
        await nav("Relatórios");
        await page
          .getByRole("heading", { name: "Seus relatórios", exact: true })
          .waitFor();
        await metric("Meus gastos estritamente pessoais", "650,00");
        await metric("Consumo da Casa atribuído a mim", "3.500,00");
        await metric("Total de consumo atribuído a mim", "4.150,00");
        await metric("Total financeiro assumido", "3.150,00");
        await nav("Casa");
        const settlement = page.locator(".settlement").filter({
          has: page.getByRole("heading", {
            name: `Auditoria ${f.run} direct`,
            exact: true,
          }),
        });
        assert.ok(
          (await settlement.innerText())
            .replaceAll("\u00a0", " ")
            .includes("R$ 0,00"),
        );
        assert.ok((await settlement.innerText()).includes("500,00"));
      } else if (member === 2) {
        await nav("Casa");
        assert.equal(
          await page
            .getByText("Conta exclusivamente fictícia 1", { exact: true })
            .count(),
          0,
        );
        assert.equal(
          await page
            .getByText(`Auditoria ${f.run} personal`, { exact: true })
            .count(),
          0,
        );
        assert.equal(await page.locator(".settlement").count(), 0);
        await nav("Relatórios");
        await page
          .getByRole("group", { name: "Visão financeira" })
          .getByRole("button", { name: "Casa", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Relatórios da Casa", exact: true })
          .waitFor();
        await page
          .getByRole("region", { name: "Contribuições à Casa" })
          .getByText("Ver dados em tabela · contribuições à Casa", {
            exact: true,
          })
          .click();
        assert.ok(
          (await page.locator("body").innerText()).includes("2.500,00"),
        );
      } else {
        await page
          .getByText("Entender minha estimativa e conferir saldos", {
            exact: true,
          })
          .click();
        await metric("Disponível estimado sem receitas futuras", "700,00");
        assert.ok(
          (
            await page
              .getByText("Acertos a receber de familiares", { exact: true })
              .locator("..")
              .innerText()
          ).includes("500,00"),
        );
        assert.ok(
          (await page.locator("body").innerText()).includes(
            "Informação incompleta",
          ),
        );
      }
      step = `acessibilidade do membro ${member}`;
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      if (accessibility.violations.length)
        await writeFile(
          evidencePath + ".axe-failure.json",
          JSON.stringify(
            accessibility.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                summary: n.failureSummary,
              })),
            })),
          ),
          { mode: 0o600 },
        );
      assert.equal(
        accessibility.violations.length,
        0,
        "Acessibilidade do fluxo auditado",
      );
      assert.ok(
        await page.evaluate(
          () =>
            globalThis.document.documentElement.scrollWidth <=
            globalThis.innerWidth,
        ),
      );
      step = `encerrar sessão do membro ${member}`;
      await nav("Configurações");
      await page.getByRole("button", { name: "Sair e limpar sessão" }).click();
      await page.getByLabel("Nome de usuário", { exact: true }).waitFor();
      await page.reload();
      assert.equal(await page.locator(".settlement").count(), 0);
      evidence.push({
        member,
        viewport,
        authenticated: true,
        valuesVerified: true,
        privacy: true,
        axeViolations: 0,
        logoutClearsData: true,
      });
      await context.close();
    }
    step = "demonstração pública";
    const context = await browser.newContext({
        viewport: { width: 393, height: 851 },
      }),
      page = await context.newPage();
    await page.goto(origin);
    await page.getByRole("button", { name: "Explorar demonstração" }).click();
    await page
      .getByText("Dados fictícios · Explore à vontade.", { exact: false })
      .waitFor();
    evidence.push({ demo: true });
    await context.close();
    await writeFile(evidencePath, JSON.stringify(evidence), { mode: 0o600 });
    return evidence;
  } catch (error) {
    throw Error(`${step}: ${error.message}`, { cause: error });
  } finally {
    await browser.close();
  }
}
