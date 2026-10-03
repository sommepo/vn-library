// Browser-test helpers: the reader opens on Home; tests that need a system's
// menu enter it from there. Game cards start collapsed.
export async function enterLibrary(page, system = 'ps2') {
  await page.locator('.home-view').waitFor();
  await page.locator(`.home-item[data-system="${system}"]`).click();
  await page.locator('.platform-navigation').waitFor();
}
export async function gameCard(page, title) {
  const card = page.locator('.game-card').filter({hasText: title}), details = card.locator('details.console-title').first();
  if (!(await details.evaluate(e => e.open))) await card.locator('summary').first().click();
  return card;
}
