import { describe, expect, it } from 'vitest';
import { APPLE_SPECIAL, ASCII_PRINTABLE, DIGITS, LOWER, UPPER } from '../src/charsets.js';
import { hasPasswordRules, parsePasswordRules, rulesToOptions } from '../src/passwordrules.js';
import { generate } from '../src/generate.js';

const fallback = { length: 20, classes: [{ chars: LOWER, required: true }] };

describe('parsePasswordRules', () => {
  it('lit l’exemple canonique d’Apple', () => {
    const rules = parsePasswordRules(
      "required: upper; required: lower; required: digit; allowed: [-().&@?'#,/\"+]; max-consecutive: 2; minlength: 8; maxlength: 16;",
    );
    expect(rules.required).toEqual([UPPER, LOWER, DIGITS]);
    expect(rules.allowed).toEqual(["-().&@?'#,/\"+"]);
    expect(rules.maxConsecutive).toBe(2);
    expect(rules.minLength).toBe(8);
    expect(rules.maxLength).toBe(16);
  });

  it('accepte plusieurs classes par propriété et les classes nommées', () => {
    const rules = parsePasswordRules('required: upper, lower; allowed: special, ascii-printable, unicode');
    expect(rules.required).toEqual([UPPER, LOWER]);
    expect(rules.allowed).toEqual([APPLE_SPECIAL, ASCII_PRINTABLE, ASCII_PRINTABLE]);
  });

  it('protège ; et , à l’intérieur d’une classe personnalisée', () => {
    const rules = parsePasswordRules('required: [;,]; minlength: 10');
    expect(rules.required).toEqual([';,']);
    expect(rules.minLength).toBe(10);
  });

  it('ignore l’inconnu et le mal formé', () => {
    const rules = parsePasswordRules('foo: bar; required: nothing; minlength: abc; maxlength: -3; max-consecutive: 2x; garbage');
    expect(rules).toEqual({ required: [], allowed: [] });
  });

  it('est insensible à la casse et aux espaces', () => {
    const rules = parsePasswordRules('  Required :  UPPER ;  MinLength : 12  ');
    expect(rules.required).toEqual([UPPER]);
    expect(rules.minLength).toBe(12);
  });
});

describe('rulesToOptions', () => {
  it('reprend les classes de repli sans classe nommée', () => {
    const options = rulesToOptions(parsePasswordRules('minlength: 24'), fallback);
    expect(options.classes).toEqual(fallback.classes);
    expect(options.length).toBe(24);
  });

  it('ramène la longueur dans [minlength, maxlength]', () => {
    expect(rulesToOptions(parsePasswordRules('maxlength: 12'), fallback).length).toBe(12);
    expect(rulesToOptions(parsePasswordRules('minlength: 32'), fallback).length).toBe(32);
    expect(rulesToOptions(parsePasswordRules('minlength: 8; maxlength: 64'), fallback).length).toBe(20);
    expect(rulesToOptions(parsePasswordRules('minlength: 30; maxlength: 12'), fallback).length).toBe(12);
  });

  it('respecte aussi le maxlength de l’attribut HTML', () => {
    expect(rulesToOptions(parsePasswordRules(''), { ...fallback, maxLength: 10 }).length).toBe(10);
    expect(rulesToOptions(parsePasswordRules('maxlength: 15'), { ...fallback, maxLength: 10 }).length).toBe(10);
  });

  it('produit des mots de passe conformes aux règles', () => {
    const rules = parsePasswordRules('required: upper; required: lower; required: digit; required: [-]; maxlength: 12; max-consecutive: 2');
    const options = rulesToOptions(rules, fallback);
    for (let i = 0; i < 50; i += 1) {
      const { password } = generate(options);
      expect(password).toHaveLength(12);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toContain('-');
      expect(password).toMatch(/^[A-Za-z0-9-]+$/);
      expect(password).not.toMatch(/(.)\1\1/);
    }
  });
});

describe('hasPasswordRules', () => {
  it('distingue une règle d’un texte quelconque', () => {
    expect(hasPasswordRules('required: upper')).toBe(true);
    expect(hasPasswordRules('minlength: 8')).toBe(true);
    expect(hasPasswordRules('hello world')).toBe(false);
    expect(hasPasswordRules('')).toBe(false);
    expect(hasPasswordRules(null)).toBe(false);
  });
});
