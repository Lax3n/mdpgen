/**
 * Script de contenu : propose un mot de passe robuste dès qu'un champ de création
 * reçoit le focus (comme Safari), le retire si l'utilisateur tape le sien, et
 * exécute les remplissages demandés par le popup ou la fenêtre Touch ID.
 */
import { suggest, type Suggestion } from '../shared/generator.js';
import { sendToBackground, type FillResponse, type Message, type ProbeResponse } from '../shared/messages.js';
import { loadSettings, onSettingsChanged, type Settings } from '../shared/settings.js';
import { Bubble, type BubbleState } from './bubble.js';
import { allPasswordFields, classifyPasswordField, findUsername, isUsablePasswordField, isVisible } from './detect.js';
import { companionFields, setFieldValue, submitForm } from './fill.js';

interface Active {
  field: HTMLInputElement;
  suggestion: Suggestion;
  /** Champs où la proposition a été écrite. */
  filled: HTMLInputElement[];
  accepted: boolean;
}

let settings: Settings | null = null;
let lastField: HTMLInputElement | null = null;
let active: Active | null = null;
const dismissed = new WeakSet<HTMLInputElement>();
/** Champs pour lesquels Touch ID a déjà été demandé automatiquement : on ne redemande pas après une annulation. */
const autoRequested = new WeakSet<HTMLInputElement>();
/** Vrai pendant nos propres écritures, pour ignorer les focus qu'elles provoquent. */
let writing = false;

const bubble = new Bubble({ onUse, onRegenerate, onTouchId, onDismiss, onOptions });

function deepActiveElement(): Element | null {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

function constraintsOf(field: HTMLInputElement): { rules: string | null; maxLength: number } {
  return { rules: field.getAttribute('passwordrules'), maxLength: field.maxLength };
}

function stateFor(current: Active): BubbleState {
  return {
    password: current.suggestion.password,
    bits: current.suggestion.bits,
    strength: current.suggestion.strength,
    autofilled: current.filled.length > 0,
    touchId: settings?.touchId ?? false,
    busy: false,
    error: null,
  };
}

function write(targets: HTMLInputElement[], value: string): void {
  writing = true;
  try {
    for (const target of targets) setFieldValue(target, value);
  } finally {
    writing = false;
  }
}

function remember(password: string): void {
  void sendToBackground({ type: 'mdpgen:remember', password, host: location.host }).catch(() => undefined);
}

function forget(): void {
  void sendToBackground({ type: 'mdpgen:forget' }).catch(() => undefined);
}

function apply(current: Active): void {
  const targets = [current.field, ...companionFields(current.field)];
  write(targets, current.suggestion.password);
  current.filled = targets;
  remember(current.suggestion.password);
}

/** Retire la proposition des champs qui la contiennent encore. */
function retract(current: Active): void {
  const untouched = current.filled.filter((field) => field.value === current.suggestion.password);
  write(untouched, '');
  current.filled = [];
}

/** Vrai si tout le formulaire, mots de passe mis à part, est déjà valide : la validation après Touch ID aboutira. */
function formReady(field: HTMLInputElement): boolean {
  const form = field.form;
  if (!form) return false;
  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLInputElement && element.type === 'password') continue;
    if ('checkValidity' in element && typeof element.checkValidity === 'function' && !element.checkValidity()) return false;
  }
  return true;
}

/** Demande la confirmation Touch ID au service worker ; le remplissage arrive ensuite par message. */
async function requestTouchId(submit: boolean): Promise<void> {
  if (!active) return;
  bubble.update({ busy: true, error: null });
  try {
    await sendToBackground({
      type: 'mdpgen:confirm-request',
      password: active.suggestion.password,
      submit,
      host: location.host,
    });
  } catch (error) {
    bubble.update({ busy: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function propose(field: HTMLInputElement, autofill: boolean): void {
  if (!settings) return;
  const suggestion = suggest(settings, constraintsOf(field));
  active = { field, suggestion, filled: [], accepted: false };
  if (autofill) apply(active);
  bubble.show(field, stateFor(active));
  // Un doigt suffit : Touch ID est demandé dès la proposition, une seule fois par champ.
  if (autofill && settings.touchId && settings.autoTouchId && !autoRequested.has(field)) {
    autoRequested.add(field);
    void requestTouchId(settings.submitAfterFill && formReady(field));
  }
}

function consider(field: HTMLInputElement): void {
  lastField = field;
  if (!settings) return;
  if (active && (active.field === field || active.filled.includes(field))) {
    if (!active.accepted) bubble.show(field, stateFor(active));
    return;
  }
  if (!settings.autoSuggest || dismissed.has(field)) return;
  const kind = classifyPasswordField(field);
  if (kind !== 'creation' && !settings.showOnAllPasswordFields) return;
  propose(field, field.value === '');
}

function onUse(): void {
  if (!active) return;
  if (active.filled.length === 0) apply(active);
  active.accepted = true;
  bubble.hide();
}

function onRegenerate(): void {
  if (!active || !settings) return;
  const wasFilled = active.filled.length > 0;
  retract(active);
  active.suggestion = suggest(settings, constraintsOf(active.field));
  if (wasFilled) apply(active);
  bubble.update(stateFor(active));
}

function finishSubmit(field: HTMLInputElement): boolean {
  return submitForm(field) === 'submitted';
}

async function onTouchId(): Promise<void> {
  if (!active || !settings) return;
  if (!settings.touchId) {
    if (active.filled.length === 0) apply(active);
    active.accepted = true;
    bubble.hide();
    const field = active.field;
    setTimeout(() => finishSubmit(field), 60);
    return;
  }
  await requestTouchId(settings.submitAfterFill);
}

function onDismiss(): void {
  if (!active) return;
  retract(active);
  dismissed.add(active.field);
  active = null;
  bubble.hide();
  forget();
}

function onOptions(): void {
  void sendToBackground({ type: 'mdpgen:open-options' }).catch(() => undefined);
}

function onFocusIn(event: FocusEvent): void {
  if (writing) return;
  const target = event.composedPath()[0];
  if (isUsablePasswordField(target)) consider(target);
}

function onFocusOut(event: FocusEvent): void {
  if (writing || !active) return;
  const target = event.composedPath()[0];
  if (target !== active.field && !(active.filled as Node[]).includes(target as Node)) return;
  setTimeout(() => {
    const now = deepActiveElement();
    if (active && now !== active.field && !active.filled.includes(now as HTMLInputElement) && !bubble.contains(now)) {
      bubble.hide();
    }
  }, 120);
}

/** L'utilisateur tape dans un champ qui porte notre proposition : elle s'efface, il garde la main. */
function onBeforeInput(event: InputEvent): void {
  if (writing || !active) return;
  const target = event.composedPath()[0];
  if (!isUsablePasswordField(target) || !active.filled.includes(target)) return;
  if (target.value !== active.suggestion.password) return;
  retract(active);
  dismissed.add(active.field);
  active = null;
  bubble.hide();
  forget();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && bubble.visible) bubble.hide();
}

/** Le formulaire part avec notre mot de passe : on le signale pour le coffre (enregistré si déverrouillé, sinon mis en attente). */
function onSubmit(event: Event): void {
  if (!active || active.filled.length === 0) return;
  const form = event.target;
  if (form instanceof HTMLFormElement && active.field.form !== form) return;
  active.accepted = true;
  bubble.hide();
  if (active.field.value !== active.suggestion.password) return;
  void sendToBackground({
    type: 'mdpgen:form-submitted',
    origin: location.origin,
    username: findUsername(active.field),
    password: active.suggestion.password,
  }).catch(() => undefined);
}

/** Le champ visé par une demande externe : la proposition en cours, sinon le dernier focalisé, sinon le premier champ de création. */
function pickField(): HTMLInputElement | null {
  if (active && isUsablePasswordField(active.field) && isVisible(active.field)) return active.field;
  if (lastField && isUsablePasswordField(lastField) && isVisible(lastField)) return lastField;
  const fields = allPasswordFields();
  return fields.find((field) => classifyPasswordField(field) === 'creation') ?? fields[0] ?? null;
}

function fillFrom(field: HTMLInputElement, password: string, submit: boolean): FillResponse {
  const targets = [field, ...companionFields(field)];
  write(targets, password);
  if (active && (active.field === field || active.filled.includes(field))) {
    active.accepted = true;
    active.filled = targets;
  } else {
    active = null;
  }
  bubble.hide();
  return {
    filled: true,
    submitted: submit && finishSubmit(field),
    fields: targets.length,
    host: location.host,
    origin: location.origin,
    username: findUsername(field),
  };
}

function onMessage(message: Message, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void): boolean {
  if (message.type === 'mdpgen:confirm-cancelled') {
    if (active && bubble.visible) bubble.update({ busy: false, error: null });
    return false;
  }
  if (message.type === 'mdpgen:probe') {
    const field = pickField();
    if (!field) return false;
    const response: ProbeResponse = {
      hasField: true,
      kind: classifyPasswordField(field),
      host: location.host,
      maxLength: field.maxLength > 0 ? field.maxLength : null,
      rules: field.getAttribute('passwordrules'),
    };
    sendResponse(response);
    return false;
  }
  if (message.type === 'mdpgen:fill') {
    const field = pickField();
    if (!field) return false;
    if (!message.submit) {
      sendResponse(fillFrom(field, message.password, false));
      return false;
    }
    // Laisse aux frameworks le temps de traiter la saisie avant de valider.
    const targets = [field, ...companionFields(field)];
    write(targets, message.password);
    if (active && (active.field === field || active.filled.includes(field))) {
      active.accepted = true;
      active.filled = targets;
    } else {
      active = null;
    }
    bubble.hide();
    setTimeout(() => {
      sendResponse({
        filled: true,
        submitted: finishSubmit(field),
        fields: targets.length,
        host: location.host,
        origin: location.origin,
        username: findUsername(field),
      } satisfies FillResponse);
    }, 60);
    return true;
  }
  return false;
}

async function init(): Promise<void> {
  settings = await loadSettings();
  onSettingsChanged((next) => {
    settings = next;
  });
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('beforeinput', onBeforeInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('submit', onSubmit, true);
  chrome.runtime.onMessage.addListener(onMessage);
  const current = deepActiveElement();
  if (isUsablePasswordField(current)) consider(current);
}

void init();
