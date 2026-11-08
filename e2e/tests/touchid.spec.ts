import type { BrowserContext, Page } from '@playwright/test';
import {
  addVirtualAuthenticator,
  copyCredentials,
  expect,
  STRONG,
  test,
  waitForClosed,
  waitForSubmit,
  type VirtualAuthenticator,
} from '../fixtures.js';

interface ConfirmOptions {
  verified?: boolean;
  /** Authentificateur qui détient déjà la clé de MDP Gen (Touch ID partagé entre les pages). */
  source?: VirtualAuthenticator;
}

/** Ouvre la fenêtre Touch ID depuis la bulle et y branche l'authentificateur virtuel. */
async function openConfirmation(page: Page, options: ConfirmOptions = {}): Promise<Page> {
  const confirmPromise = page.context().waitForEvent('page');
  await page.locator('mdpgen-bubble [data-action="touchid"]').click();
  const confirm = await confirmPromise;
  const authenticator = await addVirtualAuthenticator(confirm, options.verified ?? true);
  if (options.source) await copyCredentials(options.source, authenticator);
  return confirm;
}

/** Active Touch ID depuis la page d'options ; l'authentificateur de cette page détient la clé. */
async function enrollFromOptions(context: BrowserContext, extensionId: string): Promise<VirtualAuthenticator> {
  const options = await context.newPage();
  const authenticator = await addVirtualAuthenticator(options);
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('#touchIdStatus')).toContainText(/pas encore activé|not enabled/);
  await options.locator('#touchIdEnroll').click();
  await expect(options.locator('#touchIdResult')).toHaveText(/activé|enabled/);
  await expect(options.locator('#touchIdStatus')).toContainText(/activé le|enabled on/);
  await options.locator('#touchIdTest').click();
  await expect(options.locator('#touchIdResult')).toHaveText(/vérifié|verified/);
  return authenticator;
}

test.describe('Touch ID', () => {
  test('clé déjà créée : remplit, valide, et garde le mot de passe en mémoire de session', async ({ context, base, extensionId }) => {
    const source = await enrollFromOptions(context, extensionId);
    const page = await context.newPage();
    const pagesBefore = context.pages().length;
    await page.goto(`${base}/signup.html`);
    await page.fill('#email', 'a@b.fr');
    await page.locator('#password').focus();
    await expect(page.locator('mdpgen-bubble')).toBeVisible();

    const confirm = await openConfirmation(page, { source });
    await waitForSubmit(page, confirm);
    await waitForClosed(context, confirm, pagesBefore);
    const password = (await page.locator('#password').textContent()) ?? '';
    expect(password).toMatch(STRONG);
    await expect(page.locator('#confirm')).toHaveText(password);

    // Le dernier mot de passe est consultable derrière Touch ID.
    const popup = await context.newPage();
    const popupAuthenticator = await addVirtualAuthenticator(popup);
    await copyCredentials(source, popupAuthenticator);
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('#last')).toBeVisible();
    await expect(popup.locator('#lastMeta')).toContainText('127.0.0.1');
    await popup.locator('#lastReveal').click();
    await expect(popup.locator('#lastValue')).toHaveText(password);
    await popup.locator('#lastForget').click();
    await expect(popup.locator('#last')).toBeHidden();
    await popup.close();

    // Deuxième passage sur un autre formulaire.
    const again = await context.newPage();
    await again.goto(`${base}/signup.html`);
    await again.fill('#email', 'c@d.fr');
    await again.locator('#password').focus();
    await expect(again.locator('mdpgen-bubble')).toBeVisible();
    const confirm2 = await openConfirmation(again, { source });
    await waitForSubmit(again, confirm2);
    await waitForClosed(context, confirm2, pagesBefore + 1);
    const second = (await again.locator('#password').textContent()) ?? '';
    expect(second).toMatch(STRONG);
    expect(second).not.toBe(password);
  });

  test('première utilisation : la clé se crée dans la fenêtre, formulaire incomplet rempli mais pas envoyé', async ({ context, base }) => {
    const page = await context.newPage();
    const pagesBefore = context.pages().length;
    await page.goto(`${base}/signup.html`);
    await page.locator('#password').focus();
    await expect(page.locator('mdpgen-bubble')).toBeVisible();
    const confirm = await openConfirmation(page);
    const closed = confirm.isClosed() ? Promise.resolve() : confirm.waitForEvent('close', { timeout: 4_000 }).then(() => undefined);
    const outcome = await closed.then(() => 'closed' as const, () => 'late' as const);
    if (outcome === 'late') await confirm.reload();
    await waitForClosed(context, confirm, pagesBefore);
    expect(page.url()).toContain('signup.html');
    expect(await page.inputValue('#password')).toMatch(STRONG);
    expect(await page.inputValue('#confirm')).toBe(await page.inputValue('#password'));
    await expect(page.locator('mdpgen-bubble')).toBeHidden();
  });

  test('un refus Touch ID laisse réessayer ou annuler, sans toucher au formulaire', async ({ context, base }) => {
    const page = await context.newPage();
    const pagesBefore = context.pages().length;
    await page.goto(`${base}/signup.html`);
    await page.locator('#password').focus();
    await expect(page.locator('mdpgen-bubble')).toBeVisible();
    const before = await page.inputValue('#password');

    // Authentificateur présent mais vérification refusée : doigt non reconnu, puis « Annuler ».
    const confirm = await openConfirmation(page, { verified: false });
    const retry = confirm.locator('#retry');
    if (!(await retry.isVisible({ timeout: 4_000 }).catch(() => false))) await confirm.reload();
    await expect(retry).toBeVisible({ timeout: 10_000 });
    await expect(confirm.locator('#status')).toContainText(/Annulé|Cancelled/);
    await confirm.locator('#cancel').click();
    await waitForClosed(context, confirm, pagesBefore);
    expect(page.url()).toContain('signup.html');
    expect(await page.inputValue('#password')).toBe(before);
  });
});
