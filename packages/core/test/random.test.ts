import { describe, expect, it } from 'vitest';
import { UniformSampler, webCryptoSource, type RandomSource } from '../src/random.js';

/** Source qui rejoue une suite fixe de mots de 32 bits. */
function scripted(words: number[]): RandomSource & { consumed: () => number } {
  let index = 0;
  const source = ((buffer: Uint32Array) => {
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = words[index % words.length] as number;
      index += 1;
    }
  }) as RandomSource & { consumed: () => number };
  source.consumed = () => index;
  return source;
}

/** PRNG déterministe (xorshift32) : sert à tester la cartographie, pas l'aléa. */
function xorshift(seed: number): RandomSource {
  let state = seed >>> 0 || 1;
  return (buffer) => {
    for (let i = 0; i < buffer.length; i += 1) {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      buffer[i] = state;
    }
  };
}

function chiSquare(counts: number[], expected: number): number {
  return counts.reduce((sum, c) => sum + ((c - expected) ** 2) / expected, 0);
}

describe('UniformSampler.below', () => {
  it('rejette les mots au-dessus du dernier multiple de n', () => {
    // 2^32 mod 3 = 1 : seul 4294967295 est refusé pour n = 3.
    const sampler = new UniformSampler(scripted([4_294_967_295, 7]), 1);
    expect(sampler.below(3)).toBe(1);
  });

  it('accepte 2^32 − 2 pour n = 3 (dernier mot accepté)', () => {
    const sampler = new UniformSampler(scripted([4_294_967_294]), 1);
    expect(sampler.below(3)).toBe(4_294_967_294 % 3);
  });

  it('ne consomme rien pour n = 1', () => {
    const source = scripted([42]);
    const sampler = new UniformSampler(source, 1);
    expect(sampler.below(1)).toBe(0);
    expect(source.consumed()).toBe(0);
  });

  it('renvoie le mot brut pour n = 2^32', () => {
    const sampler = new UniformSampler(scripted([123_456_789]), 1);
    expect(sampler.below(2 ** 32)).toBe(123_456_789);
  });

  it('refuse les n invalides', () => {
    const sampler = new UniformSampler(scripted([0]), 1);
    expect(() => sampler.below(0)).toThrow(RangeError);
    expect(() => sampler.below(1.5)).toThrow(RangeError);
    expect(() => sampler.below(2 ** 32 + 1)).toThrow(RangeError);
  });

  it('refuse un lot invalide', () => {
    expect(() => new UniformSampler(scripted([0]), 0)).toThrow(RangeError);
  });

  it('est uniforme sur une source déterministe (chi², 10 classes, 100 000 tirages)', () => {
    const sampler = new UniformSampler(xorshift(0x9e3779b9), 256);
    const counts = new Array<number>(10).fill(0);
    const samples = 100_000;
    for (let i = 0; i < samples; i += 1) counts[sampler.below(10)] += 1;
    // Seuil à 99,9 % pour 9 degrés de liberté.
    expect(chiSquare(counts, samples / 10)).toBeLessThan(27.88);
  });

  it('n = 1000 : les classes au-dessus de 2^32 mod 1000 ne sont pas favorisées', () => {
    // 2^32 mod 1000 = 296 : sans rejet, les restes 0..295 seraient surreprésentés.
    const sampler = new UniformSampler(xorshift(12345), 256);
    const samples = 200_000;
    let low = 0;
    for (let i = 0; i < samples; i += 1) if (sampler.below(1000) < 296) low += 1;
    const expected = samples * 0.296;
    const sigma = Math.sqrt(samples * 0.296 * 0.704);
    expect(Math.abs(low - expected)).toBeLessThan(4 * sigma);
  });

  it('est uniforme avec la vraie source cryptographique (seuil large)', () => {
    const sampler = new UniformSampler(webCryptoSource, 1024);
    const counts = new Array<number>(7).fill(0);
    const samples = 70_000;
    for (let i = 0; i < samples; i += 1) counts[sampler.below(7)] += 1;
    // Seuil à 99,999 % pour 6 degrés de liberté : un faux échec sur cent mille exécutions.
    expect(chiSquare(counts, samples / 7)).toBeLessThan(33.1);
  });

  it('découpe les gros tampons pour getRandomValues', () => {
    const buffer = new Uint32Array(40_000);
    webCryptoSource(buffer);
    expect(buffer.some((w) => w !== 0)).toBe(true);
  });
});
