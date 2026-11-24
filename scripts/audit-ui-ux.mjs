// Repeatable visual inspection: disposable demonstration only; no authenticated financial data.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const origin = process.env.UI_URL || "http://127.0.0.1:5173";
if (
  ![
    "http://127.0.0.1:5173",
    "https://entre-nos-homologacao.netlify.app",
  ].includes(origin)
)
  throw Error("Origem de teste não autorizada");
const widths = (process.env.UI_WIDTHS || "320,360,390,430,768,1440")
    .split(",")
    .map(Number),
  themes = (process.env.UI_THEMES || "dark,light").split(","),
  sizes = (process.env.UI_TEXT_SIZES || "standard,large").split(",");
const output = resolve(process.env.UI_OUTPUT || ".cache/ui-ux-audit");
await mkdir(output, { recursive: true });
const remote = origin.startsWith("https"),
  proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
  ...(remote && proxy ? { proxy: { server: proxy } } : {}),
});
const results = [],
  failures = [];
try {
  for (const width of widths)
    for (const theme of themes)
      for (const text of sizes) {
        const context = await browser.newContext({
          viewport: { width, height: width >= 1024 ? 1000 : 844 },
          locale: "pt-BR",
          reducedMotion: "reduce",
        });
        await context.addInitScript(
          ({ theme, text }) =>
            globalThis.localStorage.setItem(
              "entre-nos:appearance:v1",
              JSON.stringify({ theme, text }),
            ),
          { theme, text },
        );
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        const prefix = `${theme}-${text}-${width}`;
        async function scan(step) {
          await page.evaluate(() => globalThis.document.fonts.ready);
          await page.evaluate(
            () =>
              new Promise((r) =>
                globalThis.requestAnimationFrame(() =>
                  globalThis.requestAnimationFrame(r),
                ),
              ),
          );
          const layout = await page.evaluate(() => ({
            overflow:
              globalThis.document.documentElement.scrollWidth >
              globalThis.innerWidth + 1,
            scrollHeight: globalThis.document.documentElement.scrollHeight,
            baseFont: globalThis.getComputedStyle(
              globalThis.document.documentElement,
            ).fontSize,
          }));
          const axe = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();
          const violation = axe.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          }));
          const entry = {
            width,
            theme,
            text,
            step,
            ...layout,
            axeViolations: violation.length,
          };
          results.push(entry);
          if (layout.overflow || violation.length)
            failures.push({ ...entry, violations: violation });
          if (
            process.env.UI_CAPTURE === "1" &&
            [390, 1440].includes(width) &&
            text === "standard"
          )
            await page.screenshot({
              path: resolve(output, `${prefix}-${step}.png`),
            });
        }
        async function nav(name) {
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
            await page
              .getByRole("button", { name: "Mais", exact: true })
              .click();
            await page
              .getByRole("dialog", { name: "Mais opções", exact: true })
              .getByRole("link", { name, exact: true })
              .click();
          }
        }
        try {
          await page.goto(origin);
          await scan("login");
          await page
            .getByRole("button", { name: "Explorar demonstração" })
            .click();
          await page.getByLabel("Mês de referência").fill("2026-11");
          await page.evaluate(() => globalThis.scrollTo(0, 0));
          await scan("inicio");
          await page
            .getByRole("button", { name: "Registrar gasto", exact: true })
            .click();
          await scan("gasto");
          await page.getByLabel("Forma de pagamento").selectOption("credit");
          await page.getByText("Mais opções do gasto", { exact: true }).click();
          await scan("gasto-cartao");
          await page
            .getByRole("button", { name: "Fechar formulário", exact: true })
            .click();
          await nav("Casa");
          await scan("casa");
          await nav("Contas e cartões");
          await scan("cartoes");
          await page
            .getByText("Ver faturas, compras e parcelas", { exact: true })
            .first()
            .click();
          await scan("fatura");
          await nav("Empréstimos");
          await scan("emprestimos");
          await page.locator(".plan>summary").first().click();
          await scan("parcelas");
          await nav("Planejamento");
          await scan("planejamento");
          await nav("Movimentações");
          await scan("movimentacoes");
          await nav("Relatórios");
          await scan("relatorios");
          await page.getByText("Filtrar relatórios", { exact: true }).click();
          await scan("filtros");
          await page
            .getByText("Ver dados em tabela · contribuições à Casa", {
              exact: true,
            })
            .click();
          await scan("tabela");
          await nav("Configurações");
          await scan("configuracoes");
          if (width < 900) {
            await page
              .getByRole("button", { name: "Mais", exact: true })
              .click();
            await scan("menu");
            await page.keyboard.press("Escape");
          }
        } catch (e) {
          failures.push({ width, theme, text, error: e.message });
        } finally {
          await context.close();
        }
        console.log(prefix, "checked");
      }
} finally {
  await browser.close();
}
await writeFile(
  resolve(output, "resultado.json"),
  JSON.stringify(
    { origin, checks: results.length, failures, results },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ checks: results.length, failures: failures.length, output }),
);
if (failures.length) process.exitCode = 1;
