/** Chaînes traduites via chrome.i18n ; la clé sert de repli si le message manque. */
export function t(key: string, ...substitutions: string[]): string {
  const message = chrome.i18n.getMessage(key, substitutions);
  return message === '' ? key : message;
}

/** Applique `data-i18n` (texte), `data-i18n-title`, `data-i18n-aria` et `data-i18n-placeholder` dans un sous-arbre. */
export function localize(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n as string);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle as string);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as string));
  }
  for (const el of root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder as string);
  }
}

export function strengthLabel(strength: string): string {
  return t(`strength_${strength}`);
}
