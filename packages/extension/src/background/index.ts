/**
 * Service worker : relais entre la page, la fenêtre de confirmation Touch ID
 * et les pages de l'extension. Il ne garde rien sur disque ; les demandes en
 * cours et le dernier mot de passe vivent dans chrome.storage.session.
 */
import { LAST_KEY, type FillResponse, type LastPassword, type Message } from '../shared/messages.js';
import { loadSettings } from '../shared/settings.js';
import { PENDING_SAVE_KEY, Vault, type PendingSave } from '../shared/vault.js';

const vault = Vault.forChrome(async () => (await loadSettings()).vaultLockMinutes);

interface Pending {
  tabId: number;
  frameId: number;
  windowId: number | null;
  password: string;
  submit: boolean;
  host: string;
  at: number;
}

const PENDING_PREFIX = 'pending:';
const PENDING_TTL_MS = 3 * 60_000;
const CONFIRM_WIDTH = 420;
const CONFIRM_HEIGHT = 340;

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  handle(message, sender).then(
    (response) => sendResponse(response ?? {}),
    (error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }),
  );
  return true;
});

chrome.windows.onRemoved.addListener((windowId) => {
  void dropPendingForWindow(windowId);
});

function isConfirmPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && (sender.url ?? '').startsWith(chrome.runtime.getURL('confirm.html'));
}

function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && (sender.url ?? '').startsWith(chrome.runtime.getURL(''));
}

async function handle(message: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'mdpgen:confirm-request':
      return openConfirmation(message.password, message.submit, message.host, sender);
    case 'mdpgen:confirm-info': {
      if (!isConfirmPage(sender)) throw new Error('Expéditeur inattendu.');
      const pending = await readPending(message.requestId);
      return { host: pending.host, submit: pending.submit };
    }
    case 'mdpgen:confirm-verified':
      if (!isConfirmPage(sender)) throw new Error('Expéditeur inattendu.');
      return completeConfirmation(message.requestId);
    case 'mdpgen:confirm-cancel':
      if (!isConfirmPage(sender)) throw new Error('Expéditeur inattendu.');
      return cancelConfirmation(message.requestId);
    case 'mdpgen:remember':
      if (!sender.tab && !isExtensionPage(sender)) throw new Error('Expéditeur inattendu.');
      return remember(message.password, message.host);
    case 'mdpgen:forget':
      return chrome.storage.session.remove(LAST_KEY);
    case 'mdpgen:open-options':
      return chrome.runtime.openOptionsPage();
    case 'mdpgen:form-submitted':
      if (!sender.tab) throw new Error('Expéditeur inattendu.');
      return recordPassword(message.origin, message.username, message.password);
    case 'mdpgen:pending-save-clear':
      if (!isExtensionPage(sender)) throw new Error('Expéditeur inattendu.');
      return clearPendingSave();
    default:
      return undefined;
  }
}

async function openConfirmation(
  password: string,
  submit: boolean,
  host: string,
  sender: chrome.runtime.MessageSender,
): Promise<{ requestId: string }> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId === undefined) throw new Error('Demande hors d’un onglet.');

  // Une seule fenêtre par cadre : si une demande est déjà ouverte, on la met à jour et on la ramène devant.
  const existing = await findPendingForFrame(tabId, sender.frameId);
  if (existing && existing.pending.windowId !== null) {
    try {
      await chrome.windows.get(existing.pending.windowId);
      await chrome.storage.session.set({ [existing.key]: { ...existing.pending, password, submit, host } });
      await chrome.windows.update(existing.pending.windowId, { focused: true });
      return { requestId: existing.key.slice(PENDING_PREFIX.length) };
    } catch {
      await chrome.storage.session.remove(existing.key);
    }
  }

  const requestId = crypto.randomUUID();
  const pending: Pending = { tabId, frameId: sender.frameId, windowId: null, password, submit, host, at: Date.now() };
  await chrome.storage.session.set({ [PENDING_PREFIX + requestId]: pending });

  let left: number | undefined;
  let top: number | undefined;
  if (sender.tab?.windowId !== undefined) {
    try {
      const parent = await chrome.windows.get(sender.tab.windowId);
      if (parent.left !== undefined && parent.width !== undefined) {
        left = Math.max(0, Math.round(parent.left + (parent.width - CONFIRM_WIDTH) / 2));
      }
      if (parent.top !== undefined && parent.height !== undefined) {
        top = Math.max(0, Math.round(parent.top + (parent.height - CONFIRM_HEIGHT) / 3));
      }
    } catch {
      // Position par défaut si la fenêtre parente n'est pas lisible.
    }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(`confirm.html?id=${encodeURIComponent(requestId)}`),
    type: 'popup',
    width: CONFIRM_WIDTH,
    height: CONFIRM_HEIGHT,
    focused: true,
    ...(left !== undefined ? { left } : {}),
    ...(top !== undefined ? { top } : {}),
  });
  pending.windowId = win?.id ?? null;
  await chrome.storage.session.set({ [PENDING_PREFIX + requestId]: pending });
  setTimeout(() => void expirePending(requestId), PENDING_TTL_MS);
  return { requestId };
}

async function findPendingForFrame(tabId: number, frameId: number): Promise<{ key: string; pending: Pending } | null> {
  const all = await chrome.storage.session.get(null);
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(PENDING_PREFIX)) continue;
    const pending = value as Pending;
    if (pending.tabId === tabId && pending.frameId === frameId && Date.now() - pending.at <= PENDING_TTL_MS) {
      return { key, pending };
    }
  }
  return null;
}

/** Prévient la page que la demande s'est terminée sans remplissage, pour que la bulle redevienne utilisable. */
async function notifyCancelled(pending: Pending): Promise<void> {
  try {
    await chrome.tabs.sendMessage(pending.tabId, { type: 'mdpgen:confirm-cancelled' }, { frameId: pending.frameId });
  } catch {
    // Onglet fermé ou script absent.
  }
}

async function readPending(requestId: string): Promise<Pending> {
  const key = PENDING_PREFIX + requestId;
  const stored = await chrome.storage.session.get(key);
  const pending = stored[key] as Pending | undefined;
  if (!pending) throw new Error('Demande expirée ou inconnue.');
  if (Date.now() - pending.at > PENDING_TTL_MS) {
    await chrome.storage.session.remove(key);
    throw new Error('Demande expirée.');
  }
  return pending;
}

async function completeConfirmation(requestId: string): Promise<FillResponse> {
  const pending = await readPending(requestId);
  await chrome.storage.session.remove(PENDING_PREFIX + requestId);
  let response: FillResponse | undefined;
  try {
    response = (await chrome.tabs.sendMessage(
      pending.tabId,
      { type: 'mdpgen:fill', password: pending.password, submit: pending.submit },
      { frameId: pending.frameId },
    )) as FillResponse | undefined;
  } finally {
    await closeWindow(pending.windowId);
  }
  if (!response?.filled) throw new Error('Le champ de mot de passe n’a pas pu être rempli.');
  await remember(pending.password, pending.host);
  // Formulaire envoyé : le mot de passe rejoint le coffre. Sinon, l'envoi ultérieur du formulaire le signalera.
  if (response.submitted) await recordPassword(response.origin, response.username, pending.password);
  return response;
}

/**
 * Enregistre un mot de passe dans le coffre s'il existe et qu'il est déverrouillé ;
 * sinon le garde en attente (mémoire de session) et le signale par une pastille.
 */
async function recordPassword(origin: string, username: string, password: string): Promise<void> {
  if (!(await vault.exists())) return;
  if (await vault.isUnlocked()) {
    await vault.save({ origin, username, password });
    await clearPendingSave();
    return;
  }
  const pending: PendingSave = { origin, username, password, at: Date.now() };
  await chrome.storage.session.set({ [PENDING_SAVE_KEY]: pending });
  await chrome.action.setBadgeBackgroundColor({ color: '#0a7aff' });
  await chrome.action.setBadgeText({ text: '1' });
}

async function clearPendingSave(): Promise<void> {
  await chrome.storage.session.remove(PENDING_SAVE_KEY);
  await chrome.action.setBadgeText({ text: '' });
}

async function cancelConfirmation(requestId: string): Promise<void> {
  const key = PENDING_PREFIX + requestId;
  const stored = await chrome.storage.session.get(key);
  const pending = stored[key] as Pending | undefined;
  await chrome.storage.session.remove(key);
  if (pending) {
    await closeWindow(pending.windowId);
    await notifyCancelled(pending);
  }
}

async function expirePending(requestId: string): Promise<void> {
  const key = PENDING_PREFIX + requestId;
  const stored = await chrome.storage.session.get(key);
  const pending = stored[key] as Pending | undefined;
  if (!pending) return;
  await chrome.storage.session.remove(key);
  await closeWindow(pending.windowId);
  await notifyCancelled(pending);
}

async function dropPendingForWindow(windowId: number): Promise<void> {
  const all = await chrome.storage.session.get(null);
  for (const [key, value] of Object.entries(all)) {
    const pending = value as Pending;
    if (key.startsWith(PENDING_PREFIX) && pending.windowId === windowId) {
      await chrome.storage.session.remove(key);
      await notifyCancelled(pending);
    }
  }
}

async function closeWindow(windowId: number | null): Promise<void> {
  if (windowId === null) return;
  try {
    await chrome.windows.remove(windowId);
  } catch {
    // Déjà fermée.
  }
}

async function remember(password: string, host: string): Promise<void> {
  const settings = await loadSettings();
  if (settings.retainMinutes <= 0) return;
  const at = Date.now();
  const last: LastPassword = { password, host, at, expiresAt: at + settings.retainMinutes * 60_000 };
  await chrome.storage.session.set({ [LAST_KEY]: last });
}
