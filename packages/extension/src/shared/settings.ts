import { DEFAULT_PREFERENCES, sanitizePreferences, type Preferences } from '@mdpgen/core';

/** Réglages de l'extension : préférences de tirage et comportement. Jamais de mot de passe ici. */
export interface Settings extends Preferences {
  /** Bulle automatique sur les champs de création de mot de passe, à la Safari. */
  autoSuggest: boolean;
  /** Proposer aussi sur les champs de connexion. */
  showOnAllPasswordFields: boolean;
  /** Proposer Touch ID (WebAuthn plateforme) pour remplir et valider sans afficher le mot de passe. */
  touchId: boolean;
  /** Valider le formulaire après le remplissage confirmé par Touch ID. */
  submitAfterFill: boolean;
  /** Durée pendant laquelle le dernier mot de passe proposé reste en mémoire de session (minutes, 0 = jamais). */
  retainMinutes: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  ...DEFAULT_PREFERENCES,
  autoSuggest: true,
  showOnAllPasswordFields: false,
  touchId: true,
  submitAfterFill: true,
  retainMinutes: 10,
});

const STORAGE_KEY = 'settings';

export function sanitizeSettings(raw: unknown): Settings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const prefs = sanitizePreferences(input);
  const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
  const retain = Number(input.retainMinutes);
  return {
    ...prefs,
    autoSuggest: bool(input.autoSuggest, DEFAULT_SETTINGS.autoSuggest),
    showOnAllPasswordFields: bool(input.showOnAllPasswordFields, DEFAULT_SETTINGS.showOnAllPasswordFields),
    touchId: bool(input.touchId, DEFAULT_SETTINGS.touchId),
    submitAfterFill: bool(input.submitAfterFill, DEFAULT_SETTINGS.submitAfterFill),
    retainMinutes:
      Number.isInteger(retain) && retain >= 0 && retain <= 1440 ? retain : DEFAULT_SETTINGS.retainMinutes,
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return sanitizeSettings(stored[STORAGE_KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = sanitizeSettings({ ...current, ...patch });
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

export async function resetSettings(): Promise<Settings> {
  await chrome.storage.sync.remove(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS };
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    const change = changes[STORAGE_KEY];
    if (area === 'sync' && change) listener(sanitizeSettings(change.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
