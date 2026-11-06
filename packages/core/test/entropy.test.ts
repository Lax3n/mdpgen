import { describe, expect, it } from 'vitest';
import { countValidPasswords, countWithBoundedRuns, log2BigInt } from '../src/entropy.js';

function* allStrings(alphabet: string[], length: number): Generator<string[]> {
  if (length === 0) {
    yield [];
    return;
  }
  for (const rest of allStrings(alphabet, length - 1)) for (const ch of alphabet) yield [ch, ...rest];
}

function longestRun(chars: string[]): number {
  let best = 0;
  let current = 0;
  for (let i = 0; i < chars.length; i += 1) {
    current = i > 0 && chars[i] === chars[i - 1] ? current + 1 : 1;
    best = Math.max(best, current);
  }
  return best;
}

describe('log2BigInt', () => {
  it('est exact sur les puissances de deux', () => {
    expect(log2BigInt(1n)).toBe(0);
    expect(log2BigInt(2n ** 100n)).toBe(100);
    expect(log2BigInt(2n ** 1000n)).toBe(1000);
  });
  it('est précis hors puissance de deux', () => {
    expect(log2BigInt(3n)).toBeCloseTo(Math.log2(3), 12);
    expect(log2BigInt(10n ** 40n)).toBeCloseTo(40 * Math.log2(10), 9);
  });
  it('refuse n ≤ 0', () => {
    expect(() => log2BigInt(0n)).toThrow(RangeError);
  });
});

describe('countWithBoundedRuns', () => {
  it('coïncide avec l’énumération exhaustive', () => {
    const alphabet = ['a', 'b', 'c'];
    for (const length of [1, 2, 3, 4, 5, 6]) {
      for (const maxRun of [1, 2, 3, 4]) {
        let brute = 0;
        for (const s of allStrings(alphabet, length)) if (longestRun(s) <= maxRun) brute += 1;
        expect(countWithBoundedRuns(3, length, maxRun)).toBe(BigInt(brute));
      }
    }
  });
  it('vaut m^L sans limite', () => {
    expect(countWithBoundedRuns(88, 20, Number.POSITIVE_INFINITY)).toBe(88n ** 20n);
    expect(countWithBoundedRuns(88, 20, 20)).toBe(88n ** 20n);
  });
  it('gère les cas dégénérés', () => {
    expect(countWithBoundedRuns(0, 0, 1)).toBe(1n);
    expect(countWithBoundedRuns(0, 3, 1)).toBe(0n);
    expect(countWithBoundedRuns(1, 3, 1)).toBe(0n);
    expect(countWithBoundedRuns(1, 3, 3)).toBe(1n);
  });
});

describe('countValidPasswords', () => {
  const alphabet = ['a', 'b', '1', '2', 'x'];
  const required = [['a', 'b'], ['1', '2']];

  it('coïncide avec l’énumération exhaustive, avec et sans limite de série', () => {
    for (const length of [2, 3, 4, 5]) {
      for (const maxRun of [1, 2, Number.POSITIVE_INFINITY]) {
        let brute = 0;
        for (const s of allStrings(alphabet, length)) {
          const set = new Set(s);
          const ok = required.every((cls) => cls.some((c) => set.has(c))) && longestRun(s) <= maxRun;
          if (ok) brute += 1;
        }
        expect(countValidPasswords(alphabet.length, required, length, maxRun)).toBe(BigInt(brute));
      }
    }
  });

  it('retrouve la formule fermée du cas simple', () => {
    // 4 symboles, lettres et chiffres requis, longueur 4 : 4^4 − 2·2^4 + 0 = 224.
    expect(countValidPasswords(4, [['a', 'b'], ['1', '2']], 4)).toBe(224n);
  });

  it('gère des classes qui se recouvrent', () => {
    // Classes {a,b} et {b,c} sur {a,b,c}, longueur 2 : valides = ab, ba, ac, ca, bb, bc, cb, ... énumérons.
    const alpha = ['a', 'b', 'c'];
    const req = [['a', 'b'], ['b', 'c']];
    let brute = 0;
    for (const s of allStrings(alpha, 2)) {
      const set = new Set(s);
      if (req.every((cls) => cls.some((c) => set.has(c)))) brute += 1;
    }
    expect(countValidPasswords(3, req, 2)).toBe(BigInt(brute));
  });

  it('vaut m^L sans classe requise', () => {
    expect(countValidPasswords(26, [], 10)).toBe(26n ** 10n);
  });
});
