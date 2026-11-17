// Browser integration with explicitly synthetic Auth/PostgREST responses.
// Every request to the test backend is intercepted; no remote account is used.
import { test, expect, type Page } from "@playwright/test";
import { emptyState, type Entry } from "../../src/domain/finance";
const userId = "00000000-0000-4000-8000-000000000001";
const memberId = "00000000-0000-4000-8000-000000000002";
async function backend(page: Page, accepted: boolean) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString("base64url");
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const token =
    header +
    "." +
    payload +
    "." +
    Buffer.from("synthetic-signature-not-a-real-credential").toString(
      "base64url",
    );
  const snapshot = emptyState();
  snapshot.profiles = [
    {
      id: userId,
      family_id: "synthetic",
      name: "Pessoa A",
      role: "admin",
      active: true,
    },
    {
      id: memberId,
      family_id: "synthetic",
      name: "Pessoa B",
      role: "member",
      active: true,
    },
  ];
  snapshot.accounts = [
    {
      id: "test-bank",
      owner_id: userId,
      name: "Conta sintética",
      kind: "bank",
      opening: 100000,
      cutoff: "2026-11-01",
    },
    {
      id: "test-va",
      owner_id: userId,
      name: "VA sintético",
      kind: "VA",
      opening: 50000,
      cutoff: "2026-11-01",
    },
  ];
  snapshot.cards = [
    {
      id: "test-card",
      owner_id: userId,
      name: "Cartão sintético",
      closing: 5,
      due: 15,
      authorized: [memberId],
    },
  ];
  const purchase: Entry = {
    id: "synthetic-1",
    owner_id: userId,
    family_id: "synthetic",
    description: "Consumo exclusivamente sintético",
    kind: "expense",
    amount: 40000,
    occurred_on: "2026-11-05",
    category: "Alimentação",
    house: true,
    consumer_id: userId,
    responsible_id: null,
    card_id: null,
    splits: [
      { account_id: "test-bank", amount: 15000 },
      { account_id: "test-va", amount: 25000 },
    ],
    version: 1,
    voided: false,
  };
  snapshot.entries = [
    purchase,
    {
      ...purchase,
      id: "synthetic-2",
      house: false,
      amount: 35000,
      category: "Outros",
      card_id: "test-card",
      splits: [],
    },
    {
      ...purchase,
      id: "synthetic-3",
      house: false,
      owner_id: memberId,
      consumer_id: memberId,
      amount: 65000,
      card_id: "test-card",
      splits: [],
    },
  ];
  const observed = {
    profileIds: [] as string[],
    snapshots: 0,
    unexpected: [] as string[],
  };
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "authorization,apikey,content-type,x-client-info",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "content-type": "application/json",
  };
  await page.route("http://127.0.0.1:54320/**", async (route) => {
    const url = new URL(route.request().url());
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: cors, body: JSON.stringify(body) });
    if (route.request().method() === "OPTIONS") return reply({});
    if (url.pathname === "/functions/v1/identity")
      return accepted
        ? reply({
            session: {
              access_token: token,
              refresh_token: "synthetic-refresh-for-browser-test",
            },
          })
        : reply({ error: "Acesso recusado" }, 400);
    if (url.pathname === "/auth/v1/user")
      return reply({
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: "member@example.test",
        created_at: "2026-11-01T12:00:00Z",
      });
    if (url.pathname === "/rest/v1/profiles") {
      observed.profileIds.push(url.searchParams.get("id") ?? "");
      // Family RLS allows both profiles: singular selection without ID must fail.
      if (url.searchParams.get("id") !== "eq." + userId)
        return reply(
          { code: "PGRST116", message: "The result contains 2 rows" },
          406,
        );
      return reply({ id: userId, family_id: "demo", name: "Pessoa A" });
    }
    if (url.pathname === "/rest/v1/rpc/load_finances") {
      observed.snapshots++;
      return reply(snapshot);
    }
    if (url.pathname === "/auth/v1/logout") return reply({});
    observed.unexpected.push(url.pathname);
    return reply({ error: "Unexpected synthetic backend request" }, 500);
  });
  return observed;
}
async function openReports(page: Page) {
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator("aside")
    .getByRole("link", { name: "Relatórios", exact: true })
    .click();
}
test("login seleciona o próprio perfil com vários membros e gráficos usam o snapshot autenticado", async ({
  page,
}) => {
  const observed = await backend(page, true);
  await page.goto("/");
  await page
    .getByLabel("Nome de usuário", { exact: true })
    .fill("usuario_sintetico");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("SomenteTesteAa9_sintetico");
  await page.getByRole("button", { name: "Entrar com segurança" }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, Pessoa A." }),
  ).toBeVisible();
  await page.getByLabel("Mês de referência").fill("2026-11");
  await openReports(page);
  await expect(
    page
      .getByRole("region", { name: "Consumo por categoria", exact: true })
      .locator(".chart-selection"),
  ).toContainText("750,00");
  expect(observed.profileIds).toEqual(["eq." + userId]);
  expect(observed.snapshots).toBe(1);
  expect(observed.unexpected).toEqual([]);
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  // Session policy is memory-only: reload must require login, without demo fallback.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Entrar com segurança" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Olá, Pessoa A." }),
  ).toHaveCount(0);
});
test("login recusado não carrega dados nem troca silenciosamente para demonstração", async ({
  page,
}) => {
  const observed = await backend(page, false);
  await page.goto("/");
  await page
    .getByLabel("Nome de usuário", { exact: true })
    .fill("usuario_sintetico");
  await page.getByLabel("Senha", { exact: true }).fill("InvalidaAa9_sintetica");
  await page.getByRole("button", { name: "Entrar com segurança" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível entrar",
  );
  expect(observed.snapshots).toBe(0);
  expect(observed.profileIds).toEqual([]);
  expect(observed.unexpected).toEqual([]);
  await expect(page.locator(".reports-page")).toHaveCount(0);
});
