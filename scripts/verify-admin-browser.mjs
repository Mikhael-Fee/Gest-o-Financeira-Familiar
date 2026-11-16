// Real browser check; no intercepted backend, trace, recording or screenshot.
// Password remains in process memory and browser fields until logout/close.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
export async function verifyAdminBrowser({ origin, username, password }) {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  let step = "abrir aplicativo";
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    async function login() {
      await page.getByLabel("Nome de usuário", { exact: true }).fill(username);
      await page.getByLabel("Senha", { exact: true }).fill(password);
      await page
        .getByRole("button", { name: "Entrar com segurança", exact: true })
        .click();
      await page.locator("aside").waitFor({ state: "visible" });
      await page
        .getByRole("heading", { name: `Olá, ${username}.`, exact: true })
        .waitFor({ state: "visible" });
      assert.equal(
        await page
          .getByText("Ambiente de demonstração", { exact: true })
          .count(),
        0,
      );
    }
    step = "login público real";
    await login();
    step = "Meu espaço";
    assert.equal(
      await page
        .locator("main[data-financial-scope]")
        .getAttribute("data-financial-scope"),
      "personal",
    );
    step = "Casa";
    await page
      .locator("aside")
      .getByRole("link", { name: "Casa", exact: true })
      .click();
    assert.equal(new URL(page.url()).pathname, "/casa");
    step = "Configurações e permissão de convite";
    await page
      .locator("aside")
      .getByRole("link", { name: "Configurações", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Criar convite individual", exact: true })
      .waitFor({ state: "visible" });
    await page
      .getByRole("button", { name: "Criar convite individual", exact: true })
      .click();
    await page.locator(".invite-code code").waitFor({ state: "visible" });
    assert.match(
      await page.locator(".invite-code code").innerText(),
      /^[a-f0-9]{64}$/,
    );
    await page
      .locator(".invite-code")
      .getByRole("button", { name: "Ocultar", exact: true })
      .click();
    step = "saída e nova autenticação";
    await page
      .getByRole("button", { name: "Sair e limpar sessão", exact: true })
      .click();
    await login();
    step = "sessão em memória após recarga";
    await page.reload();
    await page
      .getByRole("button", { name: "Entrar com segurança", exact: true })
      .waitFor({ state: "visible" });
    await login();
    await page
      .locator("aside")
      .getByRole("link", { name: "Configurações", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sair e limpar sessão", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Entrar com segurança", exact: true })
      .waitFor({ state: "visible" });
    await context.close();
    return {
      public_login: true,
      personal: true,
      house: true,
      settings: true,
      invite_created: true,
      logout_and_login: true,
      memory_session_reload: true,
      backend_mocked: false,
    };
  } catch {
    throw Error(
      `Verificação real de navegador interrompida na etapa: ${step}. Credenciais e conteúdo privado omitidos.`,
    );
  } finally {
    await browser.close();
  }
}
