import { countValidPasswords, log2BigInt } from './entropy.js';
import { uniqueChars } from './charsets.js';
import { UniformSampler, webCryptoSource, type RandomSource } from './random.js';

/** Une classe de caractères. `required` impose au moins un de ses caractères. */
export interface CharacterClass {
  /** Caractères de la classe (les doublons sont ignorés). */
  chars: string;
  /** Au moins un caractère de cette classe doit apparaître. */
  required?: boolean;
  /** Nom libre, pour les messages. */
  name?: string;
}

export interface GenerateOptions {
  /** Longueur en caractères (points de code). */
  length: number;
  /** Classes dont l'union forme l'alphabet. */
  classes: ReadonlyArray<CharacterClass>;
  /** Caractères retirés de l'alphabet (et des classes). */
  exclude?: string;
  /** Longueur maximale d'une série d'identiques consécutifs (≥ 1). Absent : pas de limite. */
  maxConsecutive?: number;
  /** Source d'aléa ; par défaut `crypto.getRandomValues`. */
  random?: RandomSource;
  /** Garde-fou contre une boucle de rejet qui n'aboutirait pas. */
  maxAttempts?: number;
}

export interface Alphabet {
  /** Alphabet effectif, sans doublon, ordre d'apparition. */
  symbols: string[];
  /** Classes requises, restreintes à l'alphabet, sans doublon. */
  required: string[][];
}

export interface EntropyEstimate {
  /** log2 du nombre exact de mots de passe que le tirage peut produire. */
  bits: number;
  alphabetSize: number;
  /** Nombre exact de mots de passe valides. */
  validCount: bigint;
  /** Probabilité qu'un tirage brut soit accepté (valides / alphabet^longueur). */
  acceptance: number;
}

export interface GenerateResult extends EntropyEstimate {
  password: string;
  /** Tirages bruts effectués avant d'obtenir un mot de passe valide. */
  attempts: number;
}

const DEFAULT_MAX_ATTEMPTS = 100_000;
/** En dessous de cette probabilité d'acceptation, on refuse plutôt que de boucler. */
const MIN_ACCEPTANCE = 1e-6;

/** Construit l'alphabet effectif et les classes requises, après validation. */
export function buildAlphabet(options: Pick<GenerateOptions, 'classes' | 'exclude'>): Alphabet {
  const excluded = new Set(uniqueChars(options.exclude ?? ''));
  const symbols: string[] = [];
  const seen = new Set<string>();
  const required: string[][] = [];
  for (const cls of options.classes) {
    const kept = uniqueChars(cls.chars).filter((ch) => !excluded.has(ch));
    for (const ch of kept) {
      if (!seen.has(ch)) {
        seen.add(ch);
        symbols.push(ch);
      }
    }
    if (cls.required) {
      if (kept.length === 0) {
        throw new RangeError(`La classe requise « ${cls.name ?? cls.chars} » ne contient plus aucun caractère.`);
      }
      required.push(kept);
    }
  }
  if (symbols.length === 0) throw new RangeError("L'alphabet est vide : activez au moins un jeu de caractères.");
  return { symbols, required };
}

function validateLength(length: number): void {
  if (!Number.isInteger(length) || length < 1) throw new RangeError('La longueur doit être un entier ≥ 1.');
  if (length > 4096) throw new RangeError('La longueur ne peut pas dépasser 4096.');
}

function validateMaxConsecutive(maxConsecutive: number | undefined): number {
  if (maxConsecutive === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isInteger(maxConsecutive) || maxConsecutive < 1) {
    throw new RangeError('maxConsecutive doit être un entier ≥ 1.');
  }
  return maxConsecutive;
}

/** Entropie exacte du tirage décrit par `options`, sans rien tirer. */
export function estimateEntropy(options: Omit<GenerateOptions, 'random' | 'maxAttempts'>): EntropyEstimate {
  validateLength(options.length);
  const maxRun = validateMaxConsecutive(options.maxConsecutive);
  const { symbols, required } = buildAlphabet(options);
  if (required.length > options.length) {
    throw new RangeError(
      `${required.length} classes sont requises mais la longueur n'est que de ${options.length}.`,
    );
  }
  const validCount = countValidPasswords(symbols.length, required, options.length, maxRun);
  if (validCount <= 0n) {
    throw new RangeError('Aucun mot de passe ne satisfait ces contraintes.');
  }
  const totalBits = options.length * Math.log2(symbols.length);
  const bits = log2BigInt(validCount);
  return { bits, alphabetSize: symbols.length, validCount, acceptance: 2 ** (bits - totalBits) };
}

function longestRun(chars: ReadonlyArray<string>): number {
  let best = 0;
  let current = 0;
  let previous: string | undefined;
  for (const ch of chars) {
    current = ch === previous ? current + 1 : 1;
    previous = ch;
    if (current > best) best = current;
  }
  return best;
}

function hasEveryRequired(chars: ReadonlyArray<string>, required: ReadonlyArray<ReadonlyArray<string>>): boolean {
  if (required.length === 0) return true;
  const present = new Set(chars);
  return required.every((cls) => cls.some((ch) => present.has(ch)));
}

/**
 * Tire un mot de passe uniformément parmi toutes les chaînes valides.
 *
 * Chaque caractère est tiré uniformément dans l'alphabet, puis la chaîne
 * entière est acceptée ou rejetée selon les contraintes : la distribution
 * obtenue est exactement uniforme sur l'ensemble des chaînes valides, ce
 * qu'un placement forcé d'un caractère par classe ne garantirait pas.
 */
export function generate(options: GenerateOptions): GenerateResult {
  const estimate = estimateEntropy(options);
  if (estimate.acceptance < MIN_ACCEPTANCE) {
    throw new RangeError(
      'Contraintes trop restrictives : moins d’un tirage sur un million serait accepté. Allongez le mot de passe ou relâchez les règles.',
    );
  }
  const { symbols, required } = buildAlphabet(options);
  const maxRun = validateMaxConsecutive(options.maxConsecutive);
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const sampler = new UniformSampler(options.random ?? webCryptoSource, Math.max(64, options.length));
  const draw: string[] = new Array<string>(options.length);
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      for (let i = 0; i < options.length; i += 1) {
        draw[i] = symbols[sampler.below(symbols.length)] as string;
      }
      if (hasEveryRequired(draw, required) && (maxRun === Number.POSITIVE_INFINITY || longestRun(draw) <= maxRun)) {
        const password = draw.join('');
        draw.fill('');
        return { password, attempts: attempt, ...estimate };
      }
    }
  } finally {
    sampler.dispose();
    draw.fill('');
  }
  throw new Error(`Aucun tirage accepté en ${maxAttempts} essais.`);
}
