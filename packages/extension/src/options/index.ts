import { suggest } from '../shared/generator.js';
import { localize, strengthLabel, t } from '../shared/i18n.js';
import { loadSettings, resetSettings, saveSettings, type Settings } from '../shared/settings.js';
import { Vault, VaultError, fromBase64Url } from '../shared/vault.js';
import { TouchIdError, enroll, readStoredCredential, resetEnrollment, touchIdStatus, verify } from '../shared/webauthn.js';

declare const __MDPGEN_VERSION__: string;

function $<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Élément #${id} introuvable.`);
  return element as T;
}

const booleans = [
  'upper',
  'lower',
  'digits',
  'symbols',
  'requireEach',
  'excludeAmbiguous',
  'autoSuggest',
  'showOnAllPasswordFields',
  'submitAfterFill',
  'touchId',
  'autoTouchId',
] as const;

const els = {
  length: $<HTMLInputElement>('length'),
  lengthNumber: $<HTMLInputElement>('lengthNumber'),
  symbolSet: $<HTMLInputElement>('symbolSet'),
  maxConsecutive: $<HTMLInputElement>('maxConsecutive'),
  retainMinutes: $<HTMLInputElement>('retainMinutes'),
  preview: $<HTMLElement>('preview'),
  touchIdStatus: $<HTMLElement>('touchIdStatus'),
  touchIdEnroll: $<HTMLButtonElement>('touchIdEnroll'),
  touchIdTest: $<HTMLButtonElement>('touchIdTest'),
  touchIdReset: $<HTMLButtonElement>('touchIdReset'),
  touchIdResult: $<HTMLElement>('touchIdResult'),
  reset: $<HTMLButtonElement>('reset'),
  saved: $<HTMLElement>('saved'),
  version: $<HTMLElement>('version'),
  vaultNone: $<HTMLElement>('vaultNone'),
  vaultCreate: $<HTMLButtonElement>('vaultCreate'),
  vaultCreateStatusRow: $<HTMLElement>('vaultCreateStatusRow'),
  vaultCreateStatus: $<HTMLElement>('vaultCreateStatus'),
  vaultRecovery: $<HTMLElement>('vaultRecovery'),
  vaultRecoveryKey: $<HTMLElement>('vaultRecoveryKey'),
  vaultRecoveryCopy: $<HTMLButtonElement>('vaultRecoveryCopy'),
  vaultRecoveryAck: $<HTMLInputElement>('vaultRecoveryAck'),
  vaultRecoveryDone: $<HTMLButtonElement>('vaultRecoveryDone'),
  vaultExists: $<HTMLElement>('vaultExists'),
  vaultStatus: $<HTMLElement>('vaultStatus'),
  vaultCreatedAt: $<HTMLElement>('vaultCreatedAt'),
  vaultLockNow: $<HTMLButtonElement>('vaultLockNow'),
  vaultUnlockNow: $<HTMLButtonElement>('vaultUnlockNow'),
  vaultLockMinutes: $<HTMLInputElement>('vaultLockMinutes'),
  vaultRecoveryUnlockRow: $<HTMLElement>('vaultRecoveryUnlockRow'),
  vaultRecoveryInput: $<HTMLInputElement>('vaultRecoveryInput'),
  vaultRecoveryUnlockBtn: $<HTMLButtonElement>('vaultRecoveryUnlockBtn'),
  vaultRecoveryStatus: $<HTMLElement>('vaultRecoveryStatus'),
  vaultRelinkRow: $<HTMLElement>('vaultRelinkRow'),
  vaultRelink: $<HTMLButtonElement>('vaultRelink'),
  vaultDestroyBtn: $<HTMLButtonElement>('vaultDestroyBtn'),
};

let settings: Settings;
const vault = Vault.forChrome(async () => settings.vaultLockMinutes);

let saveTimer = 0;

function reflect(): void {
  els.length.value = String(settings.length);
  els.lengthNumber.value = String(settings.length);
  els.symbolSet.value = settings.symbolSet;
  els.maxConsecutive.value = String(settings.maxConsecutive);
  els.retainMinutes.value = String(settings.retainMinutes);
  els.vaultLockMinutes.value = String(settings.vaultLockMinutes);
  for (const key of booleans) $<HTMLInputElement>(key).checked = settings[key];
}

function collect(): Partial<Settings> {
  const patch: Partial<Settings> = {
    length: Number(els.lengthNumber.value),
    symbolSet: els.symbolSet.value,
    maxConsecutive: Number(els.maxConsecutive.value),
    retainMinutes: Number(els.retainMinutes.value),
    vaultLockMinutes: Number(els.vaultLockMinutes.value),
  };
  for (const key of booleans) patch[key] = $<HTMLInputElement>(key).checked;
  return patch;
}

function preview(): void {
  try {
    const sample = suggest(settings);
    els.preview.textContent = t('previewLine', sample.password, String(Math.floor(sample.bits)), strengthLabel(sample.strength));
  } catch (error) {
    els.preview.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function save(): Promise<void> {
  settings = await saveSettings(collect());
  reflect();
  preview();
  els.saved.textContent = t('optionsSaved');
  els.saved.className = 'status ok';
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    els.saved.textContent = '';
  }, 1500);
}

function setTouchIdResult(text: string, tone: 'ok' | 'bad'): void {
  els.touchIdResult.textContent = text;
  els.touchIdResult.className = `status ${tone}`;
}

function touchIdErrorText(error: unknown): string {
  if (error instanceof TouchIdError) {
    if (error.reason === 'cancelled') return t('confirmCancelled');
    if (error.reason === 'unsupported' || error.reason === 'unavailable') return t('confirmUnsupported');
    return t('confirmFailed', error.message);
  }
  return t('confirmFailed', error instanceof Error ? error.message : String(error));
}

async function renderTouchIdStatus(): Promise<void> {
  const status = await touchIdStatus();
  const stored = await readStoredCredential();
  const messages = {
    unsupported: t('touchIdStatusUnsupported'),
    unavailable: t('touchIdStatusUnavailable'),
    'not-enrolled': t('touchIdStatusNotEnrolled'),
    enrolled: t('touchIdStatusEnrolled', stored ? new Date(stored.createdAt).toLocaleString() : ''),
  } as const;
  els.touchIdStatus.textContent = messages[status];
  els.touchIdEnroll.disabled = status !== 'not-enrolled';
  els.touchIdTest.disabled = status !== 'enrolled';
  els.touchIdReset.disabled = stored === null;
}

// ---------- Coffre ----------

function setVaultCreateStatus(text: string, tone: 'ok' | 'bad' | '' = ''): void {
  els.vaultCreateStatusRow.hidden = text === '';
  els.vaultCreateStatus.textContent = text;
  els.vaultCreateStatus.className = `help status ${tone}`.trim();
}

function setRecoveryStatus(text: string, tone: 'ok' | 'bad' | '' = ''): void {
  els.vaultRecoveryStatus.textContent = text;
  els.vaultRecoveryStatus.className = `help status ${tone}`.trim();
}

function vaultErrorText(error: unknown): string {
  if (error instanceof VaultError) {
    if (error.reason === 'wrong-key' || error.reason === 'invalid') return t('vaultRecoveryWrong');
    return error.message;
  }
  return touchIdErrorText(error);
}

async function renderVault(): Promise<void> {
  const blob = await vault.read();
  els.vaultNone.hidden = blob !== null;
  els.vaultExists.hidden = blob === null;
  if (!blob) return;
  const unlocked = await vault.isUnlocked();
  if (unlocked) {
    const count = (await vault.entries()).length;
    els.vaultStatus.textContent = count === 1 ? t('vaultStatusUnlockedOne') : t('vaultStatusUnlocked', String(count));
  } else {
    els.vaultStatus.textContent = t('vaultStatusLocked');
  }
  els.vaultCreatedAt.textContent = t('vaultCreatedOn', new Date(blob.createdAt).toLocaleDateString());
  els.vaultLockNow.hidden = !unlocked;
  els.vaultRecoveryUnlockRow.hidden = unlocked;
  const stored = await readStoredCredential();
  const linked = stored !== null && stored.id === blob.credentialId && stored.prf;
  els.vaultUnlockNow.hidden = unlocked || !linked;
  els.vaultRelinkRow.hidden = !(unlocked && !linked);
}

/** Déverrouille par Touch ID : l'assertion évalue la PRF avec le sel du coffre. */
async function unlockWithTouchId(): Promise<void> {
  const blob = await vault.read();
  if (!blob) return;
  els.vaultUnlockNow.disabled = true;
  try {
    const { prf } = await verify(fromBase64Url(blob.prfSalt));
    if (!prf) throw new VaultError(t('vaultPrfUnavailable'), 'invalid');
    await vault.unlockWithPrf(prf);
    setRecoveryStatus('');
  } catch (error) {
    setRecoveryStatus(vaultErrorText(error), 'bad');
  } finally {
    els.vaultUnlockNow.disabled = false;
    await renderVault();
  }
}

/** Une clé Touch ID qui prend en charge PRF : la clé actuelle si elle convient, sinon une nouvelle. */
async function prfCredential(): Promise<{ id: string }> {
  let stored = await readStoredCredential();
  if (!stored || !stored.prf) {
    await resetEnrollment();
    stored = await enroll();
  }
  if (!stored.prf) throw new VaultError(t('vaultPrfUnavailable'), 'invalid');
  return stored;
}

async function createVault(): Promise<void> {
  els.vaultCreate.disabled = true;
  setVaultCreateStatus(t('vaultCreating'));
  try {
    const credential = await prfCredential();
    const salt = Vault.newPrfSalt();
    const { prf } = await verify(salt);
    if (!prf) throw new VaultError(t('vaultPrfUnavailable'), 'invalid');
    const recoveryKey = await vault.create(salt, prf, credential.id);
    setVaultCreateStatus('');
    els.vaultNone.hidden = true;
    els.vaultRecovery.hidden = false;
    els.vaultRecoveryKey.textContent = recoveryKey;
    els.vaultRecoveryAck.checked = false;
    els.vaultRecoveryDone.disabled = true;
  } catch (error) {
    setVaultCreateStatus(vaultErrorText(error), 'bad');
  } finally {
    els.vaultCreate.disabled = false;
  }
}

async function relinkTouchId(): Promise<void> {
  els.vaultRelink.disabled = true;
  try {
    await resetEnrollment();
    const credential = await enroll();
    if (!credential.prf) throw new VaultError(t('vaultPrfUnavailable'), 'invalid');
    const salt = Vault.newPrfSalt();
    const { prf } = await verify(salt);
    if (!prf) throw new VaultError(t('vaultPrfUnavailable'), 'invalid');
    await vault.relinkPrf(salt, prf, credential.id);
    setRecoveryStatus(t('vaultRelinked'), 'ok');
    await renderTouchIdStatus();
  } catch (error) {
    setRecoveryStatus(vaultErrorText(error), 'bad');
  } finally {
    els.vaultRelink.disabled = false;
    await renderVault();
  }
}

function bindVault(): void {
  els.vaultCreate.addEventListener('click', () => void createVault());
  els.vaultRecoveryCopy.addEventListener('click', () => {
    void navigator.clipboard.writeText(els.vaultRecoveryKey.textContent ?? '');
  });
  els.vaultRecoveryAck.addEventListener('change', () => {
    els.vaultRecoveryDone.disabled = !els.vaultRecoveryAck.checked;
  });
  els.vaultRecoveryDone.addEventListener('click', async () => {
    els.vaultRecoveryKey.textContent = '';
    els.vaultRecovery.hidden = true;
    await renderVault();
  });
  els.vaultLockNow.addEventListener('click', async () => {
    await vault.lock();
    await renderVault();
  });
  els.vaultUnlockNow.addEventListener('click', () => void unlockWithTouchId());
  els.vaultRecoveryUnlockBtn.addEventListener('click', async () => {
    try {
      await vault.unlockWithRecovery(els.vaultRecoveryInput.value);
      els.vaultRecoveryInput.value = '';
      setRecoveryStatus(t('vaultUnlocked'), 'ok');
    } catch (error) {
      setRecoveryStatus(vaultErrorText(error), 'bad');
    }
    await renderVault();
  });
  els.vaultRelink.addEventListener('click', () => void relinkTouchId());
  els.vaultDestroyBtn.addEventListener('click', async () => {
    if (!window.confirm(t('vaultDestroyConfirm'))) return;
    await vault.destroy();
    await renderVault();
  });
}

async function init(): Promise<void> {
  localize(document);
  els.version.textContent = `v${__MDPGEN_VERSION__}`;
  settings = await loadSettings();
  reflect();
  preview();
  await renderTouchIdStatus();
  bindVault();
  await renderVault();

  els.length.addEventListener('input', () => {
    els.lengthNumber.value = els.length.value;
  });
  els.length.addEventListener('change', () => void save());
  els.lengthNumber.addEventListener('change', () => {
    els.length.value = els.lengthNumber.value;
    void save();
  });
  for (const id of [...booleans, 'symbolSet', 'maxConsecutive', 'retainMinutes', 'vaultLockMinutes']) {
    $<HTMLInputElement>(id).addEventListener('change', () => void save());
  }
  els.reset.addEventListener('click', async () => {
    settings = await resetSettings();
    reflect();
    preview();
    els.saved.textContent = t('optionsSaved');
    els.saved.className = 'status ok';
  });
  els.touchIdEnroll.addEventListener('click', async () => {
    try {
      await enroll();
      setTouchIdResult(t('touchIdEnrolled'), 'ok');
    } catch (error) {
      setTouchIdResult(touchIdErrorText(error), 'bad');
    }
    await renderTouchIdStatus();
  });
  els.touchIdTest.addEventListener('click', async () => {
    try {
      await verify();
      setTouchIdResult(t('touchIdOk'), 'ok');
    } catch (error) {
      setTouchIdResult(touchIdErrorText(error), 'bad');
    }
  });
  els.touchIdReset.addEventListener('click', async () => {
    await resetEnrollment();
    setTouchIdResult(t('touchIdResetDone'), 'ok');
    await renderTouchIdStatus();
  });
}

void init();
