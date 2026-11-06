/**
 * Lecture de l'attribut `passwordrules` (format Apple, repris par certains
 * sites) et traduction en options de tirage.
 *
 *   required: upper; required: lower; required: digit;
 *   allowed: [-().&@?'#,/"+]; max-consecutive: 2; minlength: 8; maxlength: 16;
 *
 * Classes nommées : upper, lower, digit, special, ascii-printable, unicode
 * (ramené à ascii-printable). Classe personnalisée : `[caractères]`.
 * Les propriétés inconnues ou mal formées sont ignorées.
 */
import { APPLE_SPECIAL, ASCII_PRINTABLE, DIGITS, LOWER, UPPER, uniqueChars } from './charsets.js';
import type { CharacterClass, GenerateOptions } from './generate.js';

export interface PasswordRules {
  required: string[];
  allowed: string[];
  minLength?: number;
  maxLength?: number;
  maxConsecutive?: number;
}

const NAMED_CLASSES: Readonly<Record<string, string>> = {
  upper: UPPER,
  lower: LOWER,
  digit: DIGITS,
  special: APPLE_SPECIAL,
  'ascii-printable': ASCII_PRINTABLE,
  unicode: ASCII_PRINTABLE,
};

/** Découpe sur `separator` en ignorant les séparateurs à l'intérieur de `[...]`. */
function splitOutsideBrackets(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '[') depth += 1;
    else if (ch === ']' && depth > 0) depth -= 1;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function parseClass(token: string): string | undefined {
  const trimmed = token.trim();
  if (trimmed.startsWith('[')) {
    const end = trimmed.lastIndexOf(']');
    const inner = end > 0 ? trimmed.slice(1, end) : trimmed.slice(1);
    return inner.length > 0 ? inner : undefined;
  }
  return NAMED_CLASSES[trimmed.toLowerCase()];
}

function parsePositiveInt(value: string): number | undefined {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isInteger(n) && n > 0 && /^\s*\d+\s*$/.test(value) ? n : undefined;
}

export function parsePasswordRules(input: string): PasswordRules {
  const rules: PasswordRules = { required: [], allowed: [] };
  for (const statement of splitOutsideBrackets(input, ';')) {
    const colon = statement.indexOf(':');
    if (colon < 0) continue;
    const name = statement.slice(0, colon).trim().toLowerCase();
    const value = statement.slice(colon + 1);
    switch (name) {
      case 'required':
      case 'allowed': {
        for (const token of splitOutsideBrackets(value, ',')) {
          const chars = parseClass(token);
          if (chars !== undefined) rules[name].push(chars);
        }
        break;
      }
      case 'minlength': {
        const n = parsePositiveInt(value);
        if (n !== undefined) rules.minLength = n;
        break;
      }
      case 'maxlength': {
        const n = parsePositiveInt(value);
        if (n !== undefined) rules.maxLength = n;
        break;
      }
      case 'max-consecutive': {
        const n = parsePositiveInt(value);
        if (n !== undefined) rules.maxConsecutive = n;
        break;
      }
      default:
        break;
    }
  }
  return rules;
}

export interface RulesFallback {
  /** Longueur souhaitée quand les règles ne l'imposent pas. */
  length: number;
  /** Classes utilisées quand les règles n'en nomment aucune. */
  classes: ReadonlyArray<CharacterClass>;
  /** Longueur maximale imposée par ailleurs (attribut `maxlength`). */
  maxLength?: number;
}

/**
 * Traduit des règles en options de tirage. L'alphabet est l'union des classes
 * `allowed` et `required` ; sans aucune classe nommée, les classes de repli
 * servent. La longueur de repli est ramenée dans [minlength, maxlength].
 */
export function rulesToOptions(rules: PasswordRules, fallback: RulesFallback): GenerateOptions {
  const classes: CharacterClass[] = [];
  if (rules.required.length > 0 || rules.allowed.length > 0) {
    for (const chars of rules.required) classes.push({ chars, required: true });
    for (const chars of rules.allowed) classes.push({ chars, required: false });
  } else {
    classes.push(...fallback.classes);
  }
  let length = fallback.length;
  const maxLength = [rules.maxLength, fallback.maxLength]
    .filter((n): n is number => n !== undefined)
    .reduce<number | undefined>((min, n) => (min === undefined ? n : Math.min(min, n)), undefined);
  if (rules.minLength !== undefined) length = Math.max(length, rules.minLength);
  if (maxLength !== undefined) length = Math.min(length, maxLength);
  const options: GenerateOptions = { length, classes };
  if (rules.maxConsecutive !== undefined) options.maxConsecutive = rules.maxConsecutive;
  return options;
}

/** Vrai si le texte contient au moins une propriété reconnue. */
export function hasPasswordRules(input: string | null | undefined): boolean {
  if (!input) return false;
  const rules = parsePasswordRules(input);
  return (
    rules.required.length > 0 ||
    rules.allowed.length > 0 ||
    rules.minLength !== undefined ||
    rules.maxLength !== undefined ||
    rules.maxConsecutive !== undefined
  );
}

export { uniqueChars };
