/// <reference types="chrome" />
import { chromium, test as base, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_DIR = path.resolve(here, '../packages/extension/dist');
const FIXTURES_DIR = path.join(here, 'fixtures');

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  base: string;
  /** Touch ID demandé dès la proposition (réglage par défaut de l'extension). Désactivé dans les tests sauf demande. */
  autoTouchId: boolean;
}
interface WorkerFixtures {
  server: string;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  server: [
    async ({}, use) => {
      const server = http.createServer(async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const file = path.join(FIXTURES_DIR, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
        try {
          const body = await readFile(file);
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          response.end(body);
        } catch {
          response.writeHead(404);
          response.end('not found');
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      await use(`http://127.0.0.1:${port}`);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    { scope: 'worker' },
  ],
  autoTouchId: [false, { option: true }],
  context: async ({ autoTouchId }, use) => {
    const brave = process.env.BRAVE_PATH;
    const context = await chromium.launchPersistentContext('', {
      ...(brave ? { executablePath: brave, headless: false } : { channel: 'chromium', headless: true }),
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await worker.evaluate(async (patch) => {
      const stored = await chrome.storage.sync.get('settings');
      await chrome.storage.sync.set({ settings: { ...((stored['settings'] as object | undefined) ?? {}), ...patch } });
    }, { autoTouchId });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker.url().split('/')[2] as string);
  },
  base: async ({ server }, use) => {
    await use(server);
  },
});

export const expect = test.expect;

export interface VirtualAuthenticator {
  cdp: CDPSession;
  id: string;
}

/** Branche un authentificateur virtuel (Touch ID simulé) sur la page. */
export async function addVirtualAuthenticator(page: Page, verified = true): Promise<VirtualAuthenticator> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: verified,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, id: authenticatorId };
}

/**
 * Les authentificateurs virtuels sont propres à chaque page ; un vrai Touch ID est
 * partagé. On recopie donc la clé créée sur une page vers l'authentificateur d'une autre.
 */
export async function copyCredentials(from: VirtualAuthenticator, to: VirtualAuthenticator): Promise<void> {
  const { credentials } = await from.cdp.send('WebAuthn.getCredentials', { authenticatorId: from.id });
  for (const credential of credentials) {
    await to.cdp.send('WebAuthn.addCredential', { authenticatorId: to.id, credential });
  }
}

export const STRONG = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!#$%&()*+,\-.:;<=>?@[\]^_{}~]).{20}$/;

/**
 * La prochaine fenêtre ouverte dans le contexte, avec un authentificateur virtuel branché dès sa création,
 * avant que sa page ne lance la demande WebAuthn. `verified` à faux simule un doigt non reconnu.
 */
export function nextConfirmWindow(context: BrowserContext, verified = true, source?: VirtualAuthenticator): Promise<Page> {
  return new Promise((resolve, reject) => {
    context.once('page', (page) => {
      addVirtualAuthenticator(page, verified)
        .then(async (authenticator) => {
          if (source) await copyCredentials(source, authenticator);
          resolve(page);
        })
        .catch(reject);
    });
  });
}

/** Attend l'envoi du formulaire. Relance la demande si elle est partie avant l'authentificateur virtuel. */
export async function waitForSubmit(page: Page, confirm: Page): Promise<void> {
  const done = page.waitForURL(/done\.html/, { timeout: 15_000 }).then(() => 'done' as const, () => 'failed' as const);
  const late = new Promise<'late'>((resolve) => setTimeout(() => resolve('late'), 4_000));
  const settled = await Promise.race([done, late]);
  if (settled === 'late' && !confirm.isClosed()) {
    await confirm.reload().catch(() => undefined);
    await page.waitForURL(/done\.html/, { timeout: 15_000 });
  } else if (settled === 'failed') {
    throw new Error('Le formulaire n’a pas été envoyé.');
  }
}

export async function waitForClosed(context: BrowserContext, confirm: Page, expectedPages: number): Promise<void> {
  if (!confirm.isClosed()) await confirm.waitForEvent('close', { timeout: 15_000 });
  await expect.poll(() => context.pages().length, { timeout: 10_000 }).toBe(expectedPages);
}
