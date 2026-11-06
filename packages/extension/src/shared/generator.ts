import {
  AMBIGUOUS,
  generate,
  hasPasswordRules,
  optionsFromPreferences,
  parsePasswordRules,
  rulesToOptions,
  strengthFromBits,
  type GenerateOptions,
  type Strength,
} from '@mdpgen/core';
import type { Settings } from './settings.js';

export interface FieldConstraints {
  /** Attribut `passwordrules` du champ. */
  rules?: string | null;
  /** Attribut `maxlength` du champ (−1 ou null : aucun). */
  maxLength?: number | null;
}

export interface Suggestion {
  password: string;
  bits: number;
  strength: Strength;
  alphabetSize: number;
}

/** Options de tirage pour des réglages et, s'il y en a, les contraintes du champ. */
export function optionsFor(settings: Settings, constraints: FieldConstraints = {}): GenerateOptions {
  let options = optionsFromPreferences(settings);
  const maxLength =
    typeof constraints.maxLength === 'number' && constraints.maxLength > 0 ? constraints.maxLength : undefined;
  if (constraints.rules && hasPasswordRules(constraints.rules)) {
    const fallback = { length: options.length, classes: options.classes, ...(maxLength !== undefined ? { maxLength } : {}) };
    const fromRules = rulesToOptions(parsePasswordRules(constraints.rules), fallback);
    options = settings.excludeAmbiguous ? { ...fromRules, exclude: AMBIGUOUS } : fromRules;
  } else if (maxLength !== undefined && maxLength < options.length) {
    options = { ...options, length: maxLength };
  }
  return options;
}

/** Tire une proposition ; si les contraintes du champ rendent les classes requises impossibles, les relâche. */
export function suggest(settings: Settings, constraints: FieldConstraints = {}): Suggestion {
  const options = optionsFor(settings, constraints);
  let result;
  try {
    result = generate(options);
  } catch {
    result = generate({ ...options, classes: options.classes.map((cls) => ({ ...cls, required: false })) });
  }
  return {
    password: result.password,
    bits: result.bits,
    strength: strengthFromBits(result.bits),
    alphabetSize: result.alphabetSize,
  };
}
