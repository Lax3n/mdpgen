import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/mdpgen.mjs');

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('mdpgen (CLI)', () => {
  it('produit un mot de passe de 20 caractères par défaut', () => {
    const out = execFileSync(process.execPath, [bin], { encoding: 'utf8' });
    const lines = out.trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(20);
    expect(lines[0]).toMatch(/[A-Z]/);
    expect(lines[0]).toMatch(/[a-z]/);
    expect(lines[0]).toMatch(/[0-9]/);
  });

  it('respecte --length et --count', () => {
    const { status, stdout } = run(['-l', '32', '-n', '5']);
    expect(status).toBe(0);
    const lines = stdout.trimEnd().split('\n');
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line).toHaveLength(32);
    expect(new Set(lines).size).toBe(5);
  });

  it('désactive des jeux et exclut des caractères', () => {
    const { stdout } = run(['--no-symbols', '--no-upper', '-x', 'aeiou', '-l', '64']);
    expect(stdout.trimEnd()).toMatch(/^[b-df-hj-np-tv-z0-9]{64}$/);
  });

  it('sort du JSON exploitable', () => {
    const { stdout } = run(['-j', '-n', '2']);
    const payload = JSON.parse(stdout) as { passwords: string[]; entropyBits: number; strength: string; alphabetSize: number };
    expect(payload.passwords).toHaveLength(2);
    expect(payload.alphabetSize).toBe(88);
    expect(payload.entropyBits).toBeGreaterThan(128);
    expect(payload.strength).toBe('excellent');
  });

  it('applique des règles passwordrules', () => {
    const { status, stdout } = run(['-r', 'required: upper; required: digit; allowed: [-]; maxlength: 10; max-consecutive: 1']);
    expect(status).toBe(0);
    const pw = stdout.trimEnd();
    expect(pw).toHaveLength(10);
    expect(pw).toMatch(/^[A-Z0-9-]+$/);
    expect(pw).not.toMatch(/(.)\1/);
  });

  it('affiche l’entropie sur stderr avec -e', () => {
    const { stdout, stderr } = run(['-e']);
    expect(stdout.trimEnd()).toHaveLength(20);
    expect(stderr).toMatch(/bits d'entropie/);
  });

  it('refuse les usages invalides avec le code 2', () => {
    expect(run(['-l', 'abc']).status).toBe(2);
    expect(run(['-l', '2']).status).toBe(2);
    expect(run(['--bogus']).status).toBe(2);
    expect(run(['-c', '-n', '3']).status).toBe(2);
    expect(run(['-s', 'abc']).status).toBe(2);
  });

  it('signale une contrainte impossible avec le code 1', () => {
    const { status, stderr } = run(['-r', 'required: upper; required: lower; required: digit; required: [-]; maxlength: 3']);
    expect(status).toBe(1);
    expect(stderr).toMatch(/requises/);
  });

  it('a une aide et une version', () => {
    expect(run(['--help']).stdout).toMatch(/Usage/);
    expect(run(['-V']).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
