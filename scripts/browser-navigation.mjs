// Shared navigation for explicitly invoked checks against the existing homologation.
export async function navigateBrowser(page, name) {
  if (await page.locator("aside").isVisible()) {
    await page
      .locator("aside")
      .getByRole("link", { name, exact: true })
      .click();
  } else if (["Início", "Casa", "Movimentações"].includes(name)) {
    await page
      .locator(".bottom-nav")
      .getByRole("link", {
        name: name === "Movimentações" ? "Movimentos" : name,
        exact: true,
      })
      .click();
  } else {
    await page.getByRole("button", { name: "Mais", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Mais opções", exact: true })
      .getByRole("link", { name, exact: true })
      .click();
  }
  await page
    .locator("main h1")
    .filter({ hasText: name === "Início" ? /^Olá,/ : name })
    .waitFor();
}
