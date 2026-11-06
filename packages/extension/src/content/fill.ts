/** Remplissage d'un champ comme le ferait l'utilisateur, et validation du formulaire. */
import { fieldScope, isCurrentPasswordField, passwordFieldsIn } from './detect.js';

const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

/**
 * Écrit la valeur via l'accesseur natif (pour contourner le suivi de valeur de
 * React) puis émet `input` et `change` : React, Vue, Angular et les validateurs
 * maison voient la saisie.
 */
export function setFieldValue(field: HTMLInputElement, value: string): void {
  if (nativeValueSetter) nativeValueSetter.call(field, value);
  else field.value = value;
  field.dispatchEvent(
    new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: value }),
  );
  field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

/** Les autres champs mot de passe du même formulaire à remplir avec la même valeur (confirmation). */
export function companionFields(field: HTMLInputElement): HTMLInputElement[] {
  const others = passwordFieldsIn(fieldScope(field)).filter((other) => other !== field);
  const candidates = others.filter((other) => !isCurrentPasswordField(other));
  if (candidates.length <= 1) return candidates;
  const following = candidates.filter(
    (other) => (field.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  );
  return following.length > 0 ? following : candidates;
}

export type SubmitOutcome = 'submitted' | 'invalid' | 'no-form';

/** Valide le formulaire du champ en cliquant son bouton d'envoi, si le formulaire est valide. */
export function submitForm(field: HTMLInputElement): SubmitOutcome {
  const form = field.form;
  if (!form) return 'no-form';
  if (!form.checkValidity()) {
    form.reportValidity();
    return 'invalid';
  }
  const button = form.querySelector<HTMLButtonElement | HTMLInputElement>(
    'button[type="submit"], input[type="submit"], button:not([type])',
  );
  if (button && !button.disabled) button.click();
  else form.requestSubmit();
  return 'submitted';
}
