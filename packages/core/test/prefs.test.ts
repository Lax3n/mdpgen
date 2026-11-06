import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, MAX_LENGTH, MIN_LENGTH, optionsFromPreferences, sanitizePreferences } from '../src/prefs.js';
import { generate } from '../src/generate.js';
import { strengthFromBits } from '../src/strength.js';

describe('sanitizePreferences', () => {
  it('rend les valeurs par défaut sans entrée', () => {
    expect(sanitizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({})).toEqual(DEFAULT_PREFERENCES);
  });

  it('borne la longueur', () => {
    expect(sanitizePreferences({ length: 1 }).length).toBe(MIN_LENGTH);
    expect(sanitizePreferences({ length: 10_000 }).length).toBe(MAX_LENGTH);
    expect(sanitizePreferences({ length: 'abc' }).length).toBe(DEFAULT_PREFERENCES.length);
    expect(sanitizePreferences({ length: 33 }).length).toBe(33);
  });

  it('nettoie le jeu de symboles', () => {
    expect(sanitizePreferences({ symbolSet: 'ab!!@ 9é#' }).symbolSet).toBe('!@#');
  });

  it('réactive les minuscules si tout est désactivé', () => {
    const prefs = sanitizePreferences({ upper: false, lower: false, digits: false, symbols: false });
    expect(prefs.lower).toBe(true);
    const prefs2 = sanitizePreferences({ upper: false, lower: false, digits: false, symbols: true, symbolSet: '' });
    expect(prefs2.lower).toBe(true);
  });

  it('ignore les types inattendus', () => {
    const prefs = sanitizePreferences({ upper: 'yes', maxConsecutive: 99, requireEach: null });
    expect(prefs.upper).toBe(true);
    expect(prefs.maxConsecutive).toBe(0);
    expect(prefs.requireEach).toBe(true);
  });
});

describe('optionsFromPreferences', () => {
  it('produit un mot de passe par défaut de 20 caractères à plus de 128 bits', () => {
    const result = generate(optionsFromPreferences({ ...DEFAULT_PREFERENCES }));
    expect(result.password).toHaveLength(20);
    expect(result.bits).toBeGreaterThan(128);
    expect(strengthFromBits(result.bits)).toBe('excellent');
  });

  it('transmet l’exclusion des ambigus et la limite de série', () => {
    const options = optionsFromPreferences({ ...DEFAULT_PREFERENCES, excludeAmbiguous: true, maxConsecutive: 2 });
    expect(options.exclude).toBe('0O1lI|');
    expect(options.maxConsecutive).toBe(2);
  });

  it('ne rend pas requis les jeux quand requireEach est faux', () => {
    const options = optionsFromPreferences({ ...DEFAULT_PREFERENCES, requireEach: false });
    expect(options.classes.every((c) => c.required === false)).toBe(true);
  });
});

describe('strengthFromBits', () => {
  it('suit les seuils annoncés', () => {
    expect(strengthFromBits(39.9)).toBe('weak');
    expect(strengthFromBits(40)).toBe('fair');
    expect(strengthFromBits(60)).toBe('good');
    expect(strengthFromBits(80)).toBe('strong');
    expect(strengthFromBits(100)).toBe('excellent');
  });
});
