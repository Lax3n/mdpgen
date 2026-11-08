import { suggest, type Suggestion } from '../shared/generator.js';
import { localize, strengthLabel, t } from '../shared/i18n.js';
import { ICON_EYE, ICON_EYE_OFF, ICON_FINGERPRINT, ICON_REFRESH, icon, mask } from '../shared/icons.js';
import {
  readLastPassword,
  sendToBackground,
  type FillResponse,
  type LastPassword,
  type ProbeResponse,
} from '../shared/messages.js';
import { loadSettings, saveSettings, type Settings } from '../shared/settings.js';
import { TouchIdError, ensureVerified, touchIdStatus } from '../shared/webauthn.js';

declare const __MDPGEN_VERSION__: string;

function $<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Élément #${id} introuvable.`);
  return element as T;
}

const els = {
  password: $<HTMLElement>('password'),
  reveal: $<HTMLButtonElement>('reveal'),
  regenerate: $<HTMLButtonElement>('regenerate'),
  bits: $<HTMLElement>('bits'),
  strength: $<HTMLElement>('strength'),
  dot: $<HTMLElement>('dot'),
  copy: $<HTMLButtonElement>('copy'),
  insert: $<HTMLButtonElement>('insert'),
  touchid: $<HTMLButtonElement>('touchid'),
  status: $<HTMLElement>('status'),
  length: $<HTMLInputElement>('length'),
  lengthValue: $<HTMLOutputElement>('lengthValue'),
  upper: $<HTMLInputElement>('upper'),
  lower: $<HTMLInputElement>('lower'),
  digits: $<HTMLInputElement>('digits'),
  symbols: $<HTMLInputElement>('symbols'),
  last: $<HTMLElement>('last'),
  lastMeta: $<HTMLElement>('lastMeta'),
  lastValue: $<HTMLElement>('lastValue'),
  lastReveal: $<HTMLButtonElement>('lastReveal'),
  lastCopy: $<HTMLButtonElement>('lastCopy'),
  lastForget: $<HTMLButtonElement>('lastForget'),
  version: $<HTMLElement>('version'),
};

let settings: Settings;
let suggestion: Suggestion;
let probe: ProbeResponse | null = null;
let tabId: number | null = null;
let revealed = false;
let last: LastPassword | null = null;
let lastRevealed = false;

function setStatus(text: string, tone: 'ok' | 'bad' | '' = ''): void {
  els.status.textContent = text;
  els.status.className = `status ${tone}`.trim();
}

function setEye(button: HTMLButtonElement, shown: boolean): void {
  button.replaceChildren(icon(shown ? ICON_EYE_OFF : ICON_EYE));
  const label = t(shown ? 'bubbleHide' : 'bubbleReveal');
  button.title = label;
  button.setAttribute('aria-label', label);
}

function renderPassword(): void {
  els.password.textContent = revealed ? suggestion.password : mask(suggestion.password);
  els.password.classList.toggle('masked', !revealed);
  setEye(els.reveal, revealed);
  els.bits.textContent = t('bubbleBits', String(Math.floor(suggestion.bits)));
  els.strength.textContent = strengthLabel(suggestion.strength);
  els.strength.className = `strength-${suggestion.strength}`;
  els.dot.className = `dot strength-${suggestion.strength}`;
}

function regenerate(): void {
  suggestion = suggest(settings, probe ? { rules: probe.rules, maxLength: probe.maxLength } : {});
  revealed = false;
  renderPassword();
}

async function probeOne(id: number): Promise<ProbeResponse | null> {
  try {
    const response = (await chrome.tabs.sendMessage(id, { type: 'mdpgen:probe' })) as ProbeResponse | undefined;
    return response?.hasField ? response : null;
  } catch {
    return null;
  }
}

/** L'onglet actif de la fenêtre courante ; à défaut (popup ouvert dans un onglet), les onglets actifs des autres fenêtres. */
async function probeTab(): Promise<void> {
  const candidates: chrome.tabs.Tab[] = [];
  try {
    candidates.push(...(await chrome.tabs.query({ active: true, currentWindow: true })));
    candidates.push(...(await chrome.tabs.query({ active: true })));
  } catch {
    // Pas d'onglet accessible.
  }
  for (const tab of candidates) {
    if (tab.id === undefined) continue;
    const response = await probeOne(tab.id);
    if (response) {
      tabId = tab.id;
      probe = response;
      break;
    }
  }
  const hasField = probe?.hasField === true;
  els.insert.disabled = !hasField;
  els.touchid.hidden = !hasField;
  els.touchid.replaceChildren(
    icon(ICON_FINGERPRINT),
    document.createTextNode(t(settings.touchId ? 'popupTouchId' : 'popupTouchIdFill')),
  );
}

async function fillActiveTab(submit: boolean): Promise<FillResponse | null> {
  if (tabId === null) return null;
  const response = (await chrome.tabs.sendMessage(tabId, {
    type: 'mdpgen:fill',
    password: suggestion.password,
    submit,
  })) as FillResponse | undefined;
  return response?.filled ? response : null;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(t('popupCopied'), 'ok');
  } catch {
    setStatus(t('popupCopyFailed'), 'bad');
  }
}

async function onInsert(): Promise<void> {
  try {
    const response = await fillActiveTab(false);
    if (!response) {
      setStatus(t('popupNoField'), 'bad');
      return;
    }
    await sendToBackground({ type: 'mdpgen:remember', password: suggestion.password, host: response.host });
    setStatus(t('popupInserted', response.host), 'ok');
    setTimeout(() => window.close(), 700);
  } catch {
    setStatus(t('popupNoField'), 'bad');
  }
}

async function onTouchId(): Promise<void> {
  els.touchid.disabled = true;
  try {
    if (settings.touchId) await ensureVerified();
    const response = await fillActiveTab(settings.submitAfterFill);
    if (!response) {
      setStatus(t('popupNoField'), 'bad');
      return;
    }
    await sendToBackground({ type: 'mdpgen:remember', password: suggestion.password, host: response.host });
    setStatus(t('confirmDone'), 'ok');
    setTimeout(() => window.close(), 900);
  } catch (error) {
    if (error instanceof TouchIdError) {
      setStatus(error.reason === 'cancelled' ? t('confirmCancelled') : t('confirmFailed', error.message), 'bad');
    } else {
      setStatus(t('popupNoField'), 'bad');
    }
  } finally {
    els.touchid.disabled = false;
  }
}

function reflectQuick(): void {
  els.length.value = String(settings.length);
  els.lengthValue.value = String(settings.length);
  els.upper.checked = settings.upper;
  els.lower.checked = settings.lower;
  els.digits.checked = settings.digits;
  els.symbols.checked = settings.symbols;
}

async function saveQuick(patch: Partial<Settings>): Promise<void> {
  settings = await saveSettings(patch);
  reflectQuick();
  regenerate();
}

function bindQuick(): void {
  reflectQuick();
  els.length.addEventListener('input', () => {
    els.lengthValue.value = els.length.value;
  });
  els.length.addEventListener('change', () => void saveQuick({ length: Number(els.length.value) }));
  for (const key of ['upper', 'lower', 'digits', 'symbols'] as const) {
    els[key].addEventListener('change', () => void saveQuick({ [key]: els[key].checked }));
  }
}

function renderLastValue(): void {
  if (!last) return;
  els.lastValue.textContent = lastRevealed ? last.password : mask(last.password);
  els.lastValue.classList.toggle('masked', !lastRevealed);
  setEye(els.lastReveal, lastRevealed);
}

async function renderLast(): Promise<void> {
  last = await readLastPassword();
  lastRevealed = false;
  els.last.hidden = last === null;
  if (!last) return;
  const minutes = Math.max(0, Math.round((Date.now() - last.at) / 60_000));
  els.lastMeta.textContent = t('popupLastMeta', last.host || '—', String(minutes));
  renderLastValue();
}

/** Révéler ou copier le dernier mot de passe exige Touch ID quand il est activé et enregistré. */
async function unlockLast(): Promise<boolean> {
  if (!settings.touchId || lastRevealed) return true;
  if ((await touchIdStatus()) !== 'enrolled') return true;
  try {
    await ensureVerified();
    return true;
  } catch {
    setStatus(t('popupTouchIdRequired'), 'bad');
    return false;
  }
}

async function init(): Promise<void> {
  localize(document);
  els.version.textContent = `v${__MDPGEN_VERSION__}`;
  els.regenerate.append(icon(ICON_REFRESH));
  settings = await loadSettings();
  bindQuick();
  await probeTab();
  regenerate();
  await renderLast();

  els.regenerate.addEventListener('click', regenerate);
  els.reveal.addEventListener('click', () => {
    revealed = !revealed;
    renderPassword();
  });
  els.copy.addEventListener('click', () => void copyText(suggestion.password));
  els.insert.addEventListener('click', () => void onInsert());
  els.touchid.addEventListener('click', () => void onTouchId());
  els.lastReveal.addEventListener('click', async () => {
    if (!last) return;
    if (!lastRevealed && !(await unlockLast())) return;
    lastRevealed = !lastRevealed;
    renderLastValue();
  });
  els.lastCopy.addEventListener('click', async () => {
    if (!last) return;
    if (!(await unlockLast())) return;
    await copyText(last.password);
  });
  els.lastForget.addEventListener('click', async () => {
    await sendToBackground({ type: 'mdpgen:forget' });
    await renderLast();
  });
}

void init();
