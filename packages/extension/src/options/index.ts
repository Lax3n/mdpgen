import { suggest } from '../shared/generator.js';
import { localize, strengthLabel, t } from '../shared/i18n.js';
import { loadSettings, resetSettings, saveSettings, type Settings } from '../shared/settings.js';
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
};

let settings: Settings;
let saveTimer = 0;

function reflect(): void {
  els.length.value = String(settings.length);
  els.lengthNumber.value = String(settings.length);
  els.symbolSet.value = settings.symbolSet;
  els.maxConsecutive.value = String(settings.maxConsecutive);
  els.retainMinutes.value = String(settings.retainMinutes);
  for (const key of booleans) $<HTMLInputElement>(key).checked = settings[key];
}

function collect(): Partial<Settings> {
  const patch: Partial<Settings> = {
    length: Number(els.lengthNumber.value),
    symbolSet: els.symbolSet.value,
    maxConsecutive: Number(els.maxConsecutive.value),
    retainMinutes: Number(els.retainMinutes.value),
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

async function init(): Promise<void> {
  localize(document);
  els.version.textContent = `v${__MDPGEN_VERSION__}`;
  settings = await loadSettings();
  reflect();
  preview();
  await renderTouchIdStatus();

  els.length.addEventListener('input', () => {
    els.lengthNumber.value = els.length.value;
  });
  els.length.addEventListener('change', () => void save());
  els.lengthNumber.addEventListener('change', () => {
    els.length.value = els.lengthNumber.value;
    void save();
  });
  for (const id of [...booleans, 'symbolSet', 'maxConsecutive', 'retainMinutes']) {
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
