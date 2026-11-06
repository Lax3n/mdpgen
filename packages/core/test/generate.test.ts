import { describe, expect, it } from 'vitest';
import { DIGITS, LOWER, SYMBOLS_DEFAULT, UPPER, ASCII_PRINTABLE } from '../src/charsets.js';
import { buildAlphabet, estimateEntropy, generate, type RandomSource } from '../src/index.js';

const fourClasses = [
  { chars: UPPER, required: true },
  { chars: LOWER, required: true },
  { chars: DIGITS, required: true },
  { chars: SYMBOLS_DEFAULT, required: true },
];

const zeros: RandomSource = (buffer) => buffer.fill(0);

describe('generate', () => {
  it('respecte la longueur et l’alphabet', () => {
    const result = generate({ length: 20, classes: fourClasses });
    expect(Array.from(result.password)).toHaveLength(20);
    const alphabet = new Set(UPPER + LOWER + DIGITS + SYMBOLS_DEFAULT);
    for (const ch of result.password) expect(alphabet.has(ch)).toBe(true);
  });

  it('contient chaque classe requise, même quand le rejet est fréquent', () => {
    for (let i = 0; i < 300; i += 1) {
      const { password } = generate({ length: 4, classes: fourClasses });
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(Array.from(password).some((ch) => SYMBOLS_DEFAULT.includes(ch))).toBe(true);
    }
  });

  it('exclut les caractères demandés', () => {
    for (let i = 0; i < 50; i += 1) {
      const { password } = generate({ length: 40, classes: fourClasses, exclude: '0O1lI|' });
      expect(password).not.toMatch(/[0O1lI|]/);
    }
  });

  it('borne les séries d’identiques', () => {
    for (let i = 0; i < 100; i += 1) {
      const { password } = generate({ length: 12, classes: [{ chars: 'ab' }], maxConsecutive: 1 });
      expect(password).toMatch(/^(ab)+$|^(ba)+$/);
    }
    const estimate = estimateEntropy({ length: 12, classes: [{ chars: 'ab' }], maxConsecutive: 1 });
    expect(estimate.validCount).toBe(2n);
    expect(estimate.bits).toBe(1);
  });

  it('calcule l’entropie exacte des réglages par défaut', () => {
    const estimate = estimateEntropy({ length: 20, classes: fourClasses });
    const unconstrained = 20 * Math.log2(88);
    expect(estimate.alphabetSize).toBe(88);
    expect(estimate.bits).toBeLessThan(unconstrained);
    // Exiger les quatre classes coûte ≈ 0,14 bit : 9 % des tirages bruts sont rejetés.
    expect(estimate.bits).toBeGreaterThan(unconstrained - 0.2);
    expect(estimate.acceptance).toBeGreaterThan(0.85);
    expect(estimate.acceptance).toBeLessThan(0.95);
  });

  it('utilise la source fournie', () => {
    const result = generate({ length: 5, classes: [{ chars: 'abc' }], random: zeros });
    expect(result.password).toBe('aaaaa');
    expect(result.attempts).toBe(1);
  });

  it('abandonne après maxAttempts', () => {
    expect(() =>
      generate({ length: 2, classes: [{ chars: 'a' }, { chars: 'b', required: true }], random: zeros, maxAttempts: 10 }),
    ).toThrow(/10 essais/);
  });

  it('refuse plus de classes requises que de caractères', () => {
    expect(() => generate({ length: 3, classes: fourClasses })).toThrow(/requises/);
  });

  it('refuse un alphabet vide ou une classe requise vidée', () => {
    expect(() => generate({ length: 8, classes: [] })).toThrow(/vide/);
    expect(() => generate({ length: 8, classes: [{ chars: 'ab' }, { chars: '1', required: true }], exclude: '1' })).toThrow(
      /aucun caractère/,
    );
  });

  it('refuse des contraintes dont l’acceptation serait infime', () => {
    const classes = [{ chars: ASCII_PRINTABLE }, ...'!@#$%^'.split('').map((c) => ({ chars: c, required: true }))];
    expect(() => generate({ length: 6, classes })).toThrow(/restrictives/);
  });

  it('valide longueur et maxConsecutive', () => {
    expect(() => generate({ length: 0, classes: fourClasses })).toThrow(RangeError);
    expect(() => generate({ length: 2.5, classes: fourClasses })).toThrow(RangeError);
    expect(() => generate({ length: 5000, classes: fourClasses })).toThrow(RangeError);
    expect(() => generate({ length: 8, classes: fourClasses, maxConsecutive: 0 })).toThrow(RangeError);
  });

  it('déduplique l’alphabet en gardant l’ordre', () => {
    const { symbols, required } = buildAlphabet({ classes: [{ chars: 'aab' }, { chars: 'bc', required: true }] });
    expect(symbols).toEqual(['a', 'b', 'c']);
    expect(required).toEqual([['b', 'c']]);
  });

  it('produit des mots de passe distincts', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(generate({ length: 20, classes: fourClasses }).password);
    expect(seen.size).toBe(200);
  });
});
