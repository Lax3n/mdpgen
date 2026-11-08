import { addVirtualAuthenticator, expect, STRONG, test, waitForClosed, waitForSubmit } from '../fixtures.js';

test.use({ autoTouchId: true });

test.describe('Touch ID automatique', () => {
  test('cliquer dans le champ suffit : Touch ID est demandé, le formulaire rempli et validé', async ({ context, base }) => {
    const page = await context.newPage();
    const pagesBefore = context.pages().length;
    await page.goto(`${base}/signup.html`);
    await page.fill('#email', 'a@b.fr');
    const confirmPromise = context.waitForEvent('page');
    await page.locator('#password').focus();
    const confirm = await confirmPromise;
    await expect(page.locator('mdpgen-bubble')).toBeVisible();
    await expect(page.locator('mdpgen-bubble [data-action="touchid"]')).toBeDisabled();
    await addVirtualAuthenticator(confirm);
    await waitForSubmit(page, confirm);
    await waitForClosed(context, confirm, pagesBefore);
    const password = (await page.locator('#password').textContent()) ?? '';
    expect(password).toMatch(STRONG);
    await expect(page.locator('#confirm')).toHaveText(password);
  });

  test('formulaire incomplet : Touch ID remplit sans envoyer', async ({ context, base }) => {
    const page = await context.newPage();
    const pagesBefore = context.pages().length;
    await page.goto(`${base}/signup.html`);
    const confirmPromise = context.waitForEvent('page');
    await page.locator('#password').focus();
    const confirm = await confirmPromise;
    await expect(confirm.locator('#what')).toContainText(/Remplir un mot de passe robuste sur 127\.0\.0\.1:\d+\.$|Fill a strong password on 127\.0\.0\.1:\d+\.$/);
    await addVirtualAuthenticator(confirm);
    const closed = confirm.isClosed() ? Promise.resolve() : confirm.waitForEvent('close', { timeout: 4_000 }).then(() => undefined);
    if ((await closed.then(() => 'closed' as const, () => 'late' as const)) === 'late') await confirm.reload();
    await waitForClosed(context, confirm, pagesBefore);
    expect(page.url()).toContain('signup.html');
    expect(await page.inputValue('#password')).toMatch(STRONG);
    expect(await page.inputValue('#confirm')).toBe(await page.inputValue('#password'));
  });

  test('annuler rend la main : la bulle reste utilisable et ne redemande pas', async ({ context, base }) => {
    const page = await context.newPage();
    const pagesBefore = context.pages().length;
    await page.goto(`${base}/signup.html`);
    const confirmPromise = context.waitForEvent('page');
    await page.locator('#password').focus();
    const confirm = await confirmPromise;
    const before = await page.inputValue('#password');
    expect(before).toMatch(STRONG);

    // Doigt non reconnu puis « Annuler ».
    await addVirtualAuthenticator(confirm, false);
    const retry = confirm.locator('#retry');
    if (!(await retry.isVisible({ timeout: 4_000 }).catch(() => false))) await confirm.reload();
    await expect(retry).toBeVisible({ timeout: 10_000 });
    await confirm.locator('#cancel').click();
    await waitForClosed(context, confirm, pagesBefore);

    // La bulle est toujours là, le bouton Touch ID à nouveau actif, le champ inchangé.
    await expect(page.locator('mdpgen-bubble')).toBeVisible();
    await expect(page.locator('mdpgen-bubble [data-action="touchid"]')).toBeEnabled();
    expect(await page.inputValue('#password')).toBe(before);

    // Un nouveau focus sur le même champ ne rouvre pas de fenêtre.
    await page.locator('#email').focus();
    await page.locator('#password').focus();
    await page.waitForTimeout(800);
    expect(context.pages().length).toBe(pagesBefore);

    // Le bouton, lui, redemande ; pendant la demande il est désactivé, donc pas de seconde fenêtre.
    const again = context.waitForEvent('page');
    await page.locator('mdpgen-bubble [data-action="touchid"]').click();
    const confirm2 = await again;
    await expect(page.locator('mdpgen-bubble [data-action="touchid"]')).toBeDisabled();
    // Sans authentificateur, la demande WebAuthn resterait pendante et sa modale bloquerait les clics : on la fait échouer.
    await addVirtualAuthenticator(confirm2, false);
    expect(context.pages().length).toBe(pagesBefore + 1);
    const retry2 = confirm2.locator('#retry');
    if (!(await retry2.isVisible({ timeout: 4_000 }).catch(() => false))) await confirm2.reload();
    await expect(retry2).toBeVisible({ timeout: 10_000 });
    await confirm2.locator('#cancel').click();
    await waitForClosed(context, confirm2, pagesBefore);
  });
});
