import { Buffer } from "node:buffer";
import { URLSearchParams } from "node:url";
// Real browser check; no intercepted backend, trace, recording or screenshot.
// Password remains in process memory and browser fields until logout/close.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
export async function verifyAdminBrowser({
  origin,
  username,
  password,
  withFinancialData = false,
}) {
  if (origin !== "https://entre-nos-homologacao.netlify.app")
    throw Error("Origem fora da homologação autorizada.");
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
    if (withFinancialData) {
      step = "lançamento fictício no site público";
      await page
        .getByRole("button", { name: "Registrar gasto", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      const description = `Verificação fictícia de navegador ${crypto.randomUUID().slice(0, 8)}`;
      await dialog.getByLabel("Descrição / apelido").fill(description);
      await dialog.getByLabel("Valor (R$)", { exact: true }).fill("1,23");
      await dialog
        .getByLabel("Conta utilizada")
        .selectOption({ label: "Conta exclusivamente fictícia A" });
      await dialog
        .getByRole("button", { name: "Salvar com segurança" })
        .click();
      await dialog.waitFor({ state: "hidden" });
      await page
        .locator("aside")
        .getByRole("link", { name: "Movimentações", exact: true })
        .click();
      await page.getByLabel("Buscar descrição ou categoria").fill(description);
      const row = page.locator(".entry-row").filter({ hasText: description });
      await row.waitFor({ state: "visible" });
      page.once("dialog", (dialog) => void dialog.accept());
      await row.getByRole("button", { name: "Anular", exact: true }).click();
      await row.waitFor({ state: "hidden" });
      await page
        .locator("aside")
        .getByRole("link", { name: "Planejamento", exact: true })
        .click();
      await page
        .getByRole("heading", { name: /^Orçamento pessoal/ })
        .waitFor({ state: "visible" });
      await page
        .locator("aside")
        .getByRole("link", { name: "Início", exact: true })
        .click();
    }
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

export async function verifyActivationBrowser({
  origin,
  username,
  password,
  publicKey,
  fixturePath,
}) {
  if (origin !== "https://entre-nos-homologacao.netlify.app")
    throw Error("Origem fora da homologação autorizada.");
  const backend = "https://ovoqhnoaigjzihhpdukn.supabase.co";
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const member = fixture.members[2];
  if (!member?.joined) throw Error("Membro fictício de ativação indisponível.");
  async function auth(action, body, session) {
    const response = await fetch(backend + "/functions/v1/identity", {
      method: "POST",
      headers: {
        apikey: publicKey,
        Origin: origin,
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ action, ...body }),
    });
    return { status: response.status, data: await response.json() };
  }
  const admin = await auth("login", { username, password });
  assert.equal(admin.status, 200);
  const profiles = await fetch(backend + "/rest/v1/profiles?select=id,role", {
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${admin.data.session.access_token}`,
    },
  }).then((r) => r.json());
  const memberSession = await auth("login", {
    username: member.username,
    password: member.password,
  });
  assert.equal(memberSession.status, 200);
  const payload = JSON.parse(
    Buffer.from(
      memberSession.data.session.access_token.split(".")[1],
      "base64url",
    ).toString(),
  );
  const recovery = await auth(
    "create_invite",
    { reset_id: payload.sub },
    admin.data.session,
  );
  assert.equal(recovery.status, 200);
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  const oldPassword = member.password;
  const newPassword = `ActivationAa9_${crypto.randomUUID()}`;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(
      origin +
        "/#" +
        new URLSearchParams({
          activate: recovery.data.token,
          username: member.username,
        }),
    );
    await page.getByLabel("Nome de usuário", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, "");
    await page.getByLabel("Senha", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.locator("aside").waitFor({ state: "visible" });
    member.password = newPassword;
    await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
    assert.equal(
      (
        await auth("login", {
          username: member.username,
          password: oldPassword,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await auth("reset", {
          username: member.username,
          password: newPassword,
          token: recovery.data.token,
        })
      ).status,
      400,
    );
    assert.ok(profiles.some((p) => p.role === "admin"));
    await page
      .locator("aside")
      .getByRole("link", { name: "Configurações", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sair e limpar sessão", exact: true })
      .click();
    return {
      real_activation_browser: true,
      fragment_removed: true,
      reuse_denied: true,
    };
  } finally {
    await browser.close();
  }
}
