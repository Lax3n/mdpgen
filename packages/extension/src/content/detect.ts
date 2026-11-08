/** Repérage et classement des champs mot de passe : création (inscription, changement) ou connexion. */
import type { FieldKind } from '../shared/messages.js';

const CREATION_TEXT =
  /new|nouveau|nouvelle|nuevo|nova|confirm|verif|repeat|retype|r[ée]p[ée]t|again|creat|cr[ée]er|creer|regist|inscri|sign-?up|signup|join|reset|r[ée]initialis|choose|choisi|set-?password|setpassword/i;
const LOGIN_TEXT = /current|existing|login|log-?in|signin|sign-?in|connexion|connecter|actuel|ancien|\bold\b/i;
const CREATION_BUTTON = /inscri|cr[ée]er|creer|create|sign ?up|register|join|rejoindre|commencer|get started/i;
const LOGIN_BUTTON = /connexion|connecter|log ?in|sign ?in|login|anmelden|entrar|accedi|identifi/i;
const CREATION_URL = /sign-?up|signup|regist|inscription|join|create|creer|cr%C3%A9er|new-?password|reset|forgot|change|modifier|set-?password|onboard|welcome|account\/new/i;
const LOGIN_URL = /log-?in|signin|sign-?in|connexion|\bauth\b/i;

export function isUsablePasswordField(value: unknown): value is HTMLInputElement {
  return value instanceof HTMLInputElement && value.type === 'password' && !value.disabled && !value.readOnly;
}

export function isVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/** Le formulaire du champ, sinon sa racine (document ou racine fantôme). */
export function fieldScope(field: HTMLInputElement): ParentNode {
  return field.form ?? (field.getRootNode() as ParentNode);
}

export function passwordFieldsIn(scope: ParentNode): HTMLInputElement[] {
  return Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="password"]')).filter(
    (field) => isUsablePasswordField(field) && isVisible(field),
  );
}

/** Tous les champs mot de passe visibles du document, racines fantômes ouvertes comprises. */
export function allPasswordFields(root: ParentNode = document): HTMLInputElement[] {
  const found = passwordFieldsIn(root);
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    if (element.shadowRoot) found.push(...allPasswordFields(element.shadowRoot));
  }
  return found;
}

export function attributeText(field: HTMLInputElement): string {
  return [
    field.name,
    field.id,
    field.placeholder,
    field.getAttribute('aria-label'),
    field.title,
    field.autocomplete,
    field.className,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
}

export function labelText(field: HTMLInputElement): string {
  const parts: string[] = [];
  for (const label of field.labels ?? []) parts.push(label.textContent ?? '');
  const labelledBy = field.getAttribute('aria-labelledby');
  if (labelledBy) {
    const root = field.getRootNode() as ParentNode;
    for (const id of labelledBy.split(/\s+/)) {
      const el = root.querySelector(`#${CSS.escape(id)}`);
      if (el) parts.push(el.textContent ?? '');
    }
  }
  return parts.join(' ');
}

function buttonText(scope: ParentNode): string {
  const parts: string[] = [];
  for (const el of scope.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="button"], [role="button"]')) {
    parts.push(el instanceof HTMLInputElement ? el.value : (el.textContent ?? ''));
    const aria = el.getAttribute('aria-label');
    if (aria) parts.push(aria);
  }
  return parts.join(' ');
}

/** Vrai si le champ est désigné comme « mot de passe actuel » (à ne pas remplir). */
export function isCurrentPasswordField(field: HTMLInputElement): boolean {
  const autocomplete = (field.autocomplete || field.getAttribute('autocomplete') || '').toLowerCase();
  if (autocomplete.includes('current-password')) return true;
  if (autocomplete.includes('new-password')) return false;
  const own = `${attributeText(field)} ${labelText(field)}`;
  return LOGIN_TEXT.test(own) && !CREATION_TEXT.test(own);
}

export function classifyPasswordField(field: HTMLInputElement): FieldKind {
  const autocomplete = (field.autocomplete || field.getAttribute('autocomplete') || '').toLowerCase();
  if (autocomplete.includes('new-password')) return 'creation';
  if (autocomplete.includes('current-password')) return 'login';
  if (field.hasAttribute('passwordrules')) return 'creation';

  const scope = fieldScope(field);
  const siblings = passwordFieldsIn(scope);
  if (siblings.length >= 2) return isCurrentPasswordField(field) ? 'login' : 'creation';

  const own = `${attributeText(field)} ${labelText(field)}`;
  if (CREATION_TEXT.test(own)) return 'creation';
  if (LOGIN_TEXT.test(own)) return 'login';

  const buttons = buttonText(scope);
  if (CREATION_BUTTON.test(buttons) && !LOGIN_BUTTON.test(buttons)) return 'creation';
  if (LOGIN_BUTTON.test(buttons)) return 'login';

  const where = `${location.pathname}${location.search} ${document.title}`;
  if (CREATION_URL.test(where) && !LOGIN_URL.test(where)) return 'creation';
  if (LOGIN_URL.test(where)) return 'login';
  return 'unknown';
}

const USERNAME_TEXT = /user|login|log-in|mail|identifiant|pseudo|account|compte|phone|tel|handle|nick/i;

/**
 * L'identifiant saisi dans le même formulaire : le champ email, sinon le champ
 * marqué username, sinon le champ texte le plus vraisemblable avant le mot de passe.
 */
export function findUsername(field: HTMLInputElement): string {
  const scope = fieldScope(field);
  const candidates = Array.from(scope.querySelectorAll<HTMLInputElement>('input')).filter(
    (input) =>
      input !== field &&
      ['text', 'email', 'tel', ''].includes(input.type) &&
      !input.disabled &&
      isVisible(input) &&
      input.value.trim().length > 0,
  );
  let best: HTMLInputElement | null = null;
  let bestScore = 0;
  for (const input of candidates) {
    const autocomplete = (input.autocomplete || input.getAttribute('autocomplete') || '').toLowerCase();
    let score = 1;
    if (input.type === 'email') score += 3;
    if (/\b(username|email)\b/.test(autocomplete)) score += 4;
    if (USERNAME_TEXT.test(`${attributeText(input)} ${labelText(input)}`)) score += 2;
    if (input.value.includes('@')) score += 1;
    if ((input.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = input;
    }
  }
  return best?.value.trim() ?? '';
}
