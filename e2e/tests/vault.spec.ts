import type { BrowserContext, Page } from '@playwright/test';
import {
  addVirtualAuthenticator,
  copyCredentials,
  expect,
  nextConfirmWindow,
  STRONG,
  test,
  waitForClosed,
  waitForSubmit,
  type VirtualAuthenticator,
} from '../fixtures.js';

const RECOVERY = /^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/;

/** Crée le coffre depuis la page d'options ; rend la page (qui garde l'authentificateur détenteur de la clé) et la clé de secours. */
async function createVault(context: BrowserContext, extensionId: string): Promise<{ options: Page; authenticator: VirtualAuthenticator; recoveryKey: string }> {
  const options = await context.newPage();
  const authenticator = await addVirtualAuthenticator(options);
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('#vaultNone')).toBeVisible();
  await options.locator('#vaultCreate').click();
  await expect(options.locator('#vaultRecovery')).toBeVisible({ timeout: 15_000 });
  const recoveryKey = (await options.locator('#vaultRecoveryKey').textContent()) ?? '';
  expect(recoveryKey).toMatch(RECOVERY);
  await expect(options.locator('#vaultRecoveryDone')).toBeDisabled();
  await options.locator('#vaultRecoveryAck').check();
  await options.locator('#vaultRecoveryDone').click();
  await expect(options.locator('#vaultRecovery')).toBeHidden();
  await expect(options.locator('#vaultExists')).toBeVisible();
  await expect(options.locator('#vaultStatus')).toContainText(/déverrouillé · 0|unlocked · 0/);
  return { options, authenticator, recoveryKey };
}

async function badgeText(context: BrowserContext): Promise<string> {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  return worker.evaluate(() => chrome.action.getBadgeText({}));
}

test.describe('coffre', () => {
  test('se crée avec une clé de secours, se verrouille, se rouvre par Touch ID ou par la clé, se supprime', async ({ context, extensionId }) => {
    const { options, recoveryKey } = await createVault(context, extensionId);
    await options.locator('#vaultLockNow').click();
    await expect(options.locator('#vaultStatus')).toHaveText(/verrouillé|locked/i);
    await expect(options.locator('#vaultUnlockNow')).toBeVisible();

    await options.locator('#vaultUnlockNow').click();
    await expect(options.locator('#vaultStatus')).toContainText(/déverrouillé|unlocked/);

    await options.locator('#vaultLockNow').click();
    await options.locator('#vaultRecoveryInput').fill('AAAAA-AAAAA-AAAAA-AAAAA-AAAAA');
    await options.locator('#vaultRecoveryUnlockBtn').click();
    await expect(options.locator('#vaultRecoveryStatus')).toHaveText(/n'ouvre pas|does not open/);
    await options.locator('#vaultRecoveryInput').fill(recoveryKey.toLowerCase());
    await options.locator('#vaultRecoveryUnlockBtn').click();
    await expect(options.locator('#vaultStatus')).toContainText(/déverrouillé|unlocked/);
    await expect(options.locator('#vaultRelinkRow')).toBeHidden();

    options.once('dialog', (dialog) => void dialog.accept());
    await options.locator('#vaultDestroyBtn').click();
    await expect(options.locator('#vaultNone')).toBeVisible();
  });

  test('coffre verrouillé : le mot de passe utilisé reste en attente, puis se range après Touch ID', async ({ context, base, extensionId }) => {
    const { options } = await createVault(context, extensionId);
    await options.locator('#vaultLockNow').click();

    // Inscription sans Touch ID : « Garder celui-ci » puis envoi du formulaire.
    const page = await context.newPage();
    await page.goto(`${base}/signup.html`);
    await page.locator('#password').focus();
    await expect(page.locator('mdpgen-bubble')).toBeVisible();
    await page.locator('mdpgen-bubble [data-action="use"]').click();
    await page.fill('#email', 'alex@example.com');
    await page.click('#submit');
    await page.waitForURL(/done\.html/);
    const password = (await page.locator('#password').textContent()) ?? '';
    expect(password).toMatch(STRONG);
    await expect.poll(() => badgeText(context)).toBe('1');

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('#pendingSave')).toBeVisible();
    await expect(popup.locator('#pendingSaveWho')).toContainText('alex@example.com');
    await expect(popup.locator('#vaultSummary')).toHaveText(/verrouillé|locked/i);

    // Le coffre s'ouvre par Touch ID là où la clé existe (page d'options), puis le popup range l'entrée.
    await options.locator('#vaultUnlockNow').click();
    await expect(options.locator('#vaultStatus')).toContainText(/déverrouillé|unlocked/);
    await popup.reload();
    await expect(popup.locator('#pendingSave')).toBeVisible();
    await popup.locator('#pendingSaveNow').click();
    await expect(popup.locator('#pendingSave')).toBeHidden();
    await expect(popup.locator('#vaultSummary')).toContainText(/1 mot de passe|1 password/);
    await expect.poll(() => badgeText(context)).toBe('');

    const entry = popup.locator('li.entry').first();
    await expect(entry.locator('.label')).toContainText('127.0.0.1');
    await expect(entry.locator('.help')).toHaveText('alex@example.com');
    await entry.locator('[data-action="reveal"]').click();
    await expect(entry.locator('code.pw')).toHaveText(password);

    // Suppression en deux clics.
    await entry.locator('[data-action="delete"]').click();
    await expect(entry.locator('[data-action="delete"]')).toHaveText(/Confirmer|Confirm/);
    await entry.locator('[data-action="delete"]').click();
    await expect(popup.locator('#vaultSummary')).toHaveText(/Aucun|No password/);

    // Verrouillage depuis le popup : la liste disparaît.
    await popup.locator('#vaultToggle').click();
    await expect(popup.locator('#vaultSummary')).toHaveText(/verrouillé|locked/i);
  });

  test('Touch ID perdu : la clé de secours ouvre le coffre et une nouvelle clé Touch ID se relie', async ({ context, extensionId }) => {
    const { options, recoveryKey } = await createVault(context, extensionId);
    // Comme un profil réinitialisé : la clé Touch ID de MDP Gen n'existe plus.
    await options.evaluate(() => chrome.storage.local.remove('touchIdCredential'));
    await options.locator('#vaultLockNow').click();
    await options.reload();
    await expect(options.locator('#vaultStatus')).toHaveText(/verrouillé|locked/i);
    await expect(options.locator('#vaultUnlockNow')).toBeHidden();

    await options.locator('#vaultRecoveryInput').fill(recoveryKey);
    await options.locator('#vaultRecoveryUnlockBtn').click();
    await expect(options.locator('#vaultStatus')).toContainText(/déverrouillé|unlocked/);
    await expect(options.locator('#vaultRelinkRow')).toBeVisible();
    await options.locator('#vaultRelink').click();
    await expect(options.locator('#vaultRecoveryStatus')).toHaveText(/relié|linked/, { timeout: 15_000 });
    await expect(options.locator('#vaultRelinkRow')).toBeHidden();

    await options.locator('#vaultLockNow').click();
    await options.locator('#vaultUnlockNow').click();
    await expect(options.locator('#vaultStatus')).toContainText(/déverrouillé|unlocked/);
  });
});

test.describe('coffre et Touch ID automatique', () => {
  test.use({ autoTouchId: true });

  test('clé Touch ID différente : le formulaire part quand même et le mot de passe reste en attente', async ({ context, base, extensionId }) => {
    const { options, authenticator } = await createVault(context, extensionId);
    await options.locator('#vaultLockNow').click();
    await expect(options.locator('#vaultStatus')).toHaveText(/verrouillé|locked/i);
    const page = await context.newPage();
    const pagesBefore = context.pages().length;
    await page.goto(`${base}/signup.html`);
    await page.fill('#email', 'a@b.fr');
    // L'authentificateur virtuel de la fenêtre reçoit la clé mais pas son secret PRF : comme un autre appareil.
    const confirmPromise = nextConfirmWindow(context, true, authenticator);
    await page.locator('#password').focus();
    const confirm = await confirmPromise;
    await waitForSubmit(page, confirm);
    await waitForClosed(context, confirm, pagesBefore);
    expect((await page.locator('#password').textContent()) ?? '').toMatch(STRONG);
    await expect.poll(() => badgeText(context)).toBe('1');

    const popup = await context.newPage();
    const popupAuthenticator = await addVirtualAuthenticator(popup);
    await copyCredentials(authenticator, popupAuthenticator);
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('#pendingSave')).toBeVisible();
    await expect(popup.locator('#pendingSaveWho')).toContainText('a@b.fr');
  });
});
