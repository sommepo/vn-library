// Browser-test helpers: save/load through the reader's Saves panel (Q.Save/Q.Load were removed).
const row = (page, slot) => page.locator('.slot').filter({hasText: new RegExp(`^${slot} ·`)});
export async function saveToSlot(page, slot = 'slot 1') {
  await page.locator('#savesButton').click(); await row(page, slot).waitFor();
  await row(page, slot).getByRole('button', {name: 'Save', exact: true}).click();
  await row(page, slot).getByRole('button', {name: 'Load', exact: true}).waitFor();
  await page.locator('#closePanel').click();
}
export async function loadSlot(page, slot = 'slot 1') {
  await page.locator('#savesButton').click(); await row(page, slot).waitFor();
  await row(page, slot).getByRole('button', {name: 'Load', exact: true}).click();
  await page.waitForFunction(() => !document.querySelector('#panel').open);
}
