/** Préférences utilisateur communes à la CLI et à l'extension, et leur traduction en options. */
import { AMBIGUOUS, DIGITS, LOWER, SYMBOLS_DEFAULT, UPPER } from './charsets.js';
import type { CharacterClass, GenerateOptions } from './generate.js';

export interface Preferences {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  /** Jeu de symboles quand `symbols` est actif. */
  symbolSet: string;
  /** Retire 0O1lI| de l'alphabet. */
  excludeAmbiguous: boolean;
  /** Impose au moins un caractère de chaque jeu actif. */
  requireEach: boolean;
  /** Longueur maximale d'une série d'identiques ; 0 = sans limite. */
  maxConsecutive: number;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  symbolSet: SYMBOLS_DEFAULT,
  excludeAmbiguous: false,
  requireEach: true,
  maxConsecutive: 0,
});

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 128;

/** Classes de caractères correspondant aux préférences. */
export function classesFromPreferences(prefs: Preferences): CharacterClass[] {
  const required = prefs.requireEach;
  const classes: CharacterClass[] = [];
  if (prefs.upper) classes.push({ name: 'majuscules', chars: UPPER, required });
  if (prefs.lower) classes.push({ name: 'minuscules', chars: LOWER, required });
  if (prefs.digits) classes.push({ name: 'chiffres', chars: DIGITS, required });
  if (prefs.symbols && prefs.symbolSet.length > 0) classes.push({ name: 'symboles', chars: prefs.symbolSet, required });
  return classes;
}

/** Options de tirage pour les préférences, sans règle de site. */
export function optionsFromPreferences(prefs: Preferences): GenerateOptions {
  const options: GenerateOptions = { length: prefs.length, classes: classesFromPreferences(prefs) };
  if (prefs.excludeAmbiguous) options.exclude = AMBIGUOUS;
  if (prefs.maxConsecutive > 0) options.maxConsecutive = prefs.maxConsecutive;
  return options;
}

/** Ramène des préférences partielles ou douteuses à des valeurs sûres. */
export function sanitizePreferences(input: Partial<Record<keyof Preferences, unknown>> | undefined): Preferences {
  const base: Preferences = { ...DEFAULT_PREFERENCES };
  if (!input) return base;
  const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
  const length = Number(input.length);
  if (Number.isInteger(length)) base.length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, length));
  base.upper = bool(input.upper, base.upper);
  base.lower = bool(input.lower, base.lower);
  base.digits = bool(input.digits, base.digits);
  base.symbols = bool(input.symbols, base.symbols);
  if (typeof input.symbolSet === 'string') {
    const cleaned = Array.from(input.symbolSet).filter((ch) => ch >= ' ' && ch <= '~' && !/[A-Za-z0-9 ]/.test(ch));
    base.symbolSet = Array.from(new Set(cleaned)).join('');
  }
  base.excludeAmbiguous = bool(input.excludeAmbiguous, base.excludeAmbiguous);
  base.requireEach = bool(input.requireEach, base.requireEach);
  const maxConsecutive = Number(input.maxConsecutive);
  if (Number.isInteger(maxConsecutive) && maxConsecutive >= 0 && maxConsecutive <= 16) base.maxConsecutive = maxConsecutive;
  if (!base.upper && !base.lower && !base.digits && !(base.symbols && base.symbolSet.length > 0)) {
    base.lower = true;
  }
  return base;
}
