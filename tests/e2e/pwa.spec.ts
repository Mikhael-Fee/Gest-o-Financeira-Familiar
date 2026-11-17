import { test, expect } from "@playwright/test";
test("PWA carrega shell offline e nunca armazena dados autenticados", async ({
  page,
  context,
}) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Explorar demonstração" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector(
      "link[rel=manifest]",
    ) as HTMLLinkElement;
    return (await fetch(link.href)).json();
  });
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual([
    "192x192",
    "512x512",
  ]);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Explorar demonstração" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("sem conexão");
  const urls = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map((req) => req.url),
        ),
      )
    ).flat();
  });
  expect(urls.length).toBeGreaterThan(3);
  expect(urls.some((url) => /supabase|\/auth\/|\/rest\//.test(url))).toBe(
    false,
  );
  await context.setOffline(false);
});
