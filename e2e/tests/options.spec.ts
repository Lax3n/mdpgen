import { expect, test } from '../fixtures.js';

test('les options se sauvegardent et se rétablissent', async ({ context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('#preview')).toContainText(/bits/);
  await expect(options.locator('#touchIdStatus')).not.toBeEmpty();

  await options.fill('#lengthNumber', '40');
  await options.locator('#lengthNumber').dispatchEvent('change');
  await options.uncheck('#symbols');
  await options.fill('#symbolSet', 'ab!?');
  await options.locator('#symbolSet').dispatchEvent('change');
  await expect(options.locator('#saved')).toHaveText(/Enregistré|Saved/);
  await expect(options.locator('#symbolSet')).toHaveValue('!?');

  await options.reload();
  await expect(options.locator('#lengthNumber')).toHaveValue('40');
  await expect(options.locator('#symbols')).not.toBeChecked();

  await options.click('#reset');
  await expect(options.locator('#lengthNumber')).toHaveValue('20');
  await expect(options.locator('#symbols')).toBeChecked();
});
