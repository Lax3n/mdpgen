import { expect, STRONG, test } from '../fixtures.js';

test.describe('bulle automatique', () => {
  test('propose, remplit les deux champs et prévient le framework', async ({ context, base }) => {
    const page = await context.newPage();
    await page.goto(`${base}/signup.html`);
    await page.locator('#password').focus();

    const bubble = page.locator('mdpgen-bubble');
    await expect(bubble).toBeVisible();
    await expect(bubble.locator('.bits')).toContainText(/\d+ bits/);
    await expect(bubble.locator('.strength')).toHaveText(/très fort|excellent/);

    const password = await page.inputValue('#password');
    expect(password).toMatch(STRONG);
    expect(await page.inputValue('#confirm')).toBe(password);
    await expect(page.locator('#state')).toHaveText(JSON.stringify({ password, confirm: password }));
    const events = await page.evaluate(() => (window as unknown as { __events: { type: string; id: string }[] }).__events);
    expect(events.filter((e) => e.type === 'input').map((e) => e.id)).toEqual(['password', 'confirm']);
    expect(events.filter((e) => e.type === 'change')).toHaveLength(2);

    // Masqué par défaut, révélé à la demande.
    await expect(bubble.locator('.value')).toHaveText('•'.repeat(20));
    await bubble.locator('[data-action="reveal"]').click();
    await expect(bubble.locator('.value')).toHaveText(password);

    await bubble.locator('[data-action="use"]').click();
    await expect(bubble).toBeHidden();
    expect(await page.inputValue('#password')).toBe(password);

    await page.fill('#email', 'a@b.fr');
    await page.click('#submit');
    await page.waitForURL(/done\.html/);
    await expect(page.locator('#password')).toHaveText(password);
    await expect(page.locator('#confirm')).toHaveText(password);
  });

  test('« un autre » retire la proposition précédente', async ({ context, base }) => {
    const page = await context.newPage();
    await page.goto(`${base}/signup.html`);
    await page.locator('#password').focus();
    const bubble = page.locator('mdpgen-bubble');
    await expect(bubble).toBeVisible();
    const first = await page.inputValue('#password');
    await bubble.locator('[data-action="regenerate"]').click();
    await expect.poll(() => page.inputValue('#password')).not.toBe(first);
    const second = await page.inputValue('#password');
    expect(second).toMatch(STRONG);
    expect(await page.inputValue('#confirm')).toBe(second);
  });

  test('taper efface la proposition et rend la main', async ({ context, base }) => {
    const page = await context.newPage();
    await page.goto(`${base}/signup.html`);
    await page.locator('#password').focus();
    const bubble = page.locator('mdpgen-bubble');
    await expect(bubble).toBeVisible();
    await page.keyboard.type('ab');
    expect(await page.inputValue('#password')).toBe('ab');
    expect(await page.inputValue('#confirm')).toBe('');
    await expect(bubble).toBeHidden();
    // Plus de proposition sur ce champ après un refus.
    await page.locator('#email').focus();
    await page.locator('#password').focus();
    await expect(bubble).toBeHidden();
  });

  test('« ne pas utiliser » vide les champs', async ({ context, base }) => {
    const page = await context.newPage();
    await page.goto(`${base}/signup.html`);
    await page.locator('#password').focus();
    const bubble = page.locator('mdpgen-bubble');
    await expect(bubble).toBeVisible();
    await bubble.locator('[data-action="dismiss"]').click();
    await expect(bubble).toBeHidden();
    expect(await page.inputValue('#password')).toBe('');
    expect(await page.inputValue('#confirm')).toBe('');
  });

  test('Échap masque la bulle, le refocus la réaffiche avec la même proposition', async ({ context, base }) => {
    const page = await context.newPage();
    await page.goto(`${base}/signup.html`);
    await page.locator('#password').focus();
    const bubble = page.locator('mdpgen-bubble');
    await expect(bubble).toBeVisible();
    const password = await page.inputValue('#password');
    await page.keyboard.press('Escape');
    await expect(bubble).toBeHidden();
    await page.locator('#email').focus();
    await page.locator('#confirm').focus();
    await expect(bubble).toBeVisible();
    expect(await page.inputValue('#password')).toBe(password);
  });

  test('rien sur un formulaire de connexion', async ({ context, base }) => {
    const page = await context.newPage();
    await page.goto(`${base}/login.html`);
    await page.locator('#password').focus();
    await page.waitForTimeout(400);
    await expect(page.locator('mdpgen-bubble')).toBeHidden();
    expect(await page.inputValue('#password')).toBe('');
  });

  test('rien sur un champ sans indice, sauf si demandé dans les options', async ({ context, base, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`${base}/plain.html`);
    await page.locator('#password').focus();
    await page.waitForTimeout(400);
    await expect(page.locator('mdpgen-bubble')).toBeHidden();

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.check('#showOnAllPasswordFields');
    await expect(options.locator('#saved')).toHaveText(/Enregistré|Saved/);
    await options.close();

    await page.reload();
    await page.locator('#password').focus();
    await expect(page.locator('mdpgen-bubble')).toBeVisible();
    expect(await page.inputValue('#password')).toMatch(STRONG);
  });

  test('respecte passwordrules et maxlength', async ({ context, base }) => {
    const page = await context.newPage();
    await page.goto(`${base}/rules.html`);
    await page.locator('#password').focus();
    await expect(page.locator('mdpgen-bubble')).toBeVisible();
    const password = await page.inputValue('#password');
    expect(password).toHaveLength(12);
    expect(password).toMatch(/^[A-Za-z0-9-]+$/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toContain('-');
    expect(password).not.toMatch(/(.)\1\1/);
    expect(await page.inputValue('#confirm')).toBe(password);
  });

  test('ne touche pas au mot de passe actuel sur un changement', async ({ context, base }) => {
    const page = await context.newPage();
    await page.goto(`${base}/change.html`);
    await page.fill('#current', 'ancien');
    await page.locator('#password').focus();
    await expect(page.locator('mdpgen-bubble')).toBeVisible();
    const password = await page.inputValue('#password');
    expect(password).toMatch(STRONG);
    expect(await page.inputValue('#confirm')).toBe(password);
    expect(await page.inputValue('#current')).toBe('ancien');
  });
});
