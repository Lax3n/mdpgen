/// <reference types="chrome" />
import { expect, STRONG, test } from '../fixtures.js';

test.describe('popup', () => {
  test('génère, masque, révèle, et mémorise la longueur', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('#password')).toHaveText('•'.repeat(20));
    await expect(popup.locator('#bits')).toContainText(/\d+ bits/);
    await popup.locator('#reveal').click();
    const first = (await popup.locator('#password').textContent()) ?? '';
    expect(first).toMatch(STRONG);

    await popup.locator('#regenerate').click();
    await expect(popup.locator('#password')).not.toHaveText(first);

    await popup.locator('#length').fill('32');
    await popup.locator('#length').dispatchEvent('change');
    await expect(popup.locator('#password')).toHaveText('•'.repeat(32));
    await expect(popup.locator('#lengthValue')).toHaveText('32');

    await popup.reload();
    await expect(popup.locator('#password')).toHaveText('•'.repeat(32));
    await expect(popup.locator('#insert')).toBeDisabled();
    await expect(popup.locator('#last')).toBeHidden();
  });

  test('insère dans l’onglet actif d’une autre fenêtre', async ({ context, base, extensionId }) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const pagePromise = context.waitForEvent('page');
    await worker.evaluate((url) => chrome.windows.create({ url, focused: false }), `${base}/signup.html`);
    const page = await pagePromise;
    await page.waitForLoadState();
    await page.locator('#email').focus();

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('#insert')).toBeEnabled();
    await popup.locator('#reveal').click();
    const password = (await popup.locator('#password').textContent()) ?? '';
    await popup.locator('#insert').click();
    await expect(popup.locator('#status')).toContainText('127.0.0.1');
    expect(await page.inputValue('#password')).toBe(password);
    expect(await page.inputValue('#confirm')).toBe(password);
  });
});
