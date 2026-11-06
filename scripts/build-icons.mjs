// Rastérise icons/icon.svg en PNG 16/32/48/128 avec le Chromium de Playwright (fond transparent).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'packages/extension/public/icons');
const svg = readFileSync(path.join(iconsDir, 'icon.svg'), 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent"><img id="i" src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  const png = await page.locator('#i').screenshot({ omitBackground: true });
  writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`icon${size}.png`);
}
await browser.close();
