/** Fenêtre de confirmation : demande Touch ID puis laisse le service worker remplir et valider. */
import { localize, t } from '../shared/i18n.js';
import { sendToBackground, type ConfirmInfoResponse } from '../shared/messages.js';
import { TouchIdError, ensureVerified, readStoredCredential } from '../shared/webauthn.js';

function $<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Élément #${id} introuvable.`);
  return element as T;
}

const els = {
  what: $<HTMLElement>('what'),
  status: $<HTMLElement>('status'),
  retry: $<HTMLButtonElement>('retry'),
  without: $<HTMLButtonElement>('without'),
  cancel: $<HTMLButtonElement>('cancel'),
};

const requestId = new URLSearchParams(location.search).get('id') ?? '';
let finishing = false;

function setStatus(text: string, tone: 'ok' | 'bad' | 'busy' | '' = ''): void {
  els.status.replaceChildren();
  if (tone === 'busy') {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    els.status.append(spinner);
  }
  els.status.append(document.createTextNode(text));
  els.status.className = `center status ${tone === 'busy' ? '' : tone}`.trim();
}

async function cancel(): Promise<void> {
  try {
    await sendToBackground({ type: 'mdpgen:confirm-cancel', requestId });
  } finally {
    window.close();
  }
}

async function finish(): Promise<void> {
  if (finishing) return;
  finishing = true;
  els.retry.hidden = true;
  els.without.hidden = true;
  setStatus(t('confirmDone'), 'ok');
  try {
    await sendToBackground({ type: 'mdpgen:confirm-verified', requestId });
    setTimeout(() => window.close(), 400);
  } catch {
    finishing = false;
    setStatus(t('confirmFillFailed'), 'bad');
  }
}

async function run(): Promise<void> {
  els.retry.hidden = true;
  els.without.hidden = true;
  const enrolled = (await readStoredCredential()) !== null;
  setStatus(t(enrolled ? 'confirmTouch' : 'confirmEnroll'), 'busy');
  try {
    await ensureVerified();
    await finish();
  } catch (error) {
    const reason = error instanceof TouchIdError ? error.reason : 'failed';
    if (reason === 'cancelled') {
      setStatus(t('confirmCancelled'), 'bad');
      els.retry.hidden = false;
    } else if (reason === 'unsupported' || reason === 'unavailable') {
      setStatus(t('confirmUnsupported'), 'bad');
      els.without.hidden = false;
    } else {
      setStatus(t('confirmFailed', error instanceof Error ? error.message : String(error)), 'bad');
      els.retry.hidden = false;
      els.without.hidden = false;
    }
  }
}

async function init(): Promise<void> {
  localize(document);
  els.cancel.addEventListener('click', () => void cancel());
  els.retry.addEventListener('click', () => void run());
  els.without.addEventListener('click', () => void finish());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') void cancel();
  });
  let info: ConfirmInfoResponse;
  try {
    info = await sendToBackground<ConfirmInfoResponse>({ type: 'mdpgen:confirm-info', requestId });
  } catch (error) {
    setStatus(t('confirmFailed', error instanceof Error ? error.message : String(error)), 'bad');
    return;
  }
  els.what.textContent = t(info.submit ? 'confirmFillSubmit' : 'confirmFill', info.host || '—');
  await run();
}

void init();
