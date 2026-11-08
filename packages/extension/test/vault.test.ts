import { beforeEach, describe, expect, it } from 'vitest';
import {
  RECOVERY_ALPHABET,
  UNLOCK_KEY,
  VAULT_KEY,
  Vault,
  VaultError,
  formatRecoveryKey,
  generateRecoveryKey,
  normalizeRecoveryKey,
  type KeyValueStore,
  type VaultBlob,
} from '../src/shared/vault.js';

function memoryStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => (data.has(key) ? structuredClone(data.get(key)) : undefined),
    set: async (key, value) => {
      data.set(key, structuredClone(value));
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

function prf(seed: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = (seed * 31 + i * 7) & 0xff;
  return out;
}

describe('clé de secours', () => {
  it('a 25 caractères de l’alphabet, groupés par cinq', () => {
    const key = generateRecoveryKey();
    expect(key).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    for (const ch of key.replace(/-/g, '')) expect(RECOVERY_ALPHABET).toContain(ch);
    expect(generateRecoveryKey()).not.toBe(key);
  });

  it('se normalise avec les tolérances de Crockford', () => {
    const raw = 'ABCDE' + 'FGH0J' + 'KMNPQ' + 'RSTVW' + 'XYZ12';
    expect(normalizeRecoveryKey(formatRecoveryKey(raw))).toBe(raw);
    expect(normalizeRecoveryKey(' abcde fgh0j kmnpq rstvw xyz12 ')).toBe(raw);
    expect(normalizeRecoveryKey('ABCDE-FGHOJ-KMNPQ-RSTVW-XYZI2')).toBe('ABCDEFGH0JKMNPQRSTVWXYZ12');
    expect(() => normalizeRecoveryKey('ABCDE')).toThrow(VaultError);
    expect(() => normalizeRecoveryKey('ABCDE-FGH0J-KMNPQ-RSTVW-XYZ1U')).toThrow(/inattendu/);
  });
});

describe('Vault', () => {
  let local: ReturnType<typeof memoryStore>;
  let session: ReturnType<typeof memoryStore>;
  let vault: Vault;
  const salt = Vault.newPrfSalt();

  beforeEach(() => {
    local = memoryStore();
    session = memoryStore();
    vault = new Vault(local, session, async () => 15);
  });

  it('se crée déverrouillé, vide, et rend une clé de secours', async () => {
    expect(await vault.exists()).toBe(false);
    const recovery = await vault.create(salt, prf(1), 'cred-1');
    expect(recovery).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    expect(await vault.exists()).toBe(true);
    expect(await vault.isUnlocked()).toBe(true);
    expect(await vault.entries()).toEqual([]);
    await expect(vault.create(salt, prf(1), 'cred-1')).rejects.toThrow(/existe déjà/);
  });

  it('enregistre, met à jour et supprime des entrées', async () => {
    await vault.create(salt, prf(1), 'cred-1');
    const first = await vault.save({ origin: 'https://example.com', username: 'alex@example.com', password: 'p1' });
    expect(first.host).toBe('example.com');
    await vault.save({ origin: 'https://example.com', username: 'autre@example.com', password: 'p2' });
    const updated = await vault.save({ origin: 'https://example.com', username: 'alex@example.com', password: 'p3' });
    expect(updated.id).toBe(first.id);
    const entries = await vault.entries();
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.id === first.id)?.password).toBe('p3');
    await vault.remove(first.id);
    expect(await vault.entries()).toHaveLength(1);
  });

  it('se verrouille puis se rouvre avec la même sortie PRF, et refuse une autre', async () => {
    await vault.create(salt, prf(1), 'cred-1');
    await vault.save({ origin: 'https://a.test', username: 'u', password: 'secret' });
    await vault.lock();
    expect(await vault.isUnlocked()).toBe(false);
    await expect(vault.entries()).rejects.toThrow(/verrouillé/);
    await expect(vault.unlockWithPrf(prf(2))).rejects.toMatchObject({ reason: 'wrong-key' });
    await vault.unlockWithPrf(prf(1));
    expect((await vault.entries())[0]?.password).toBe('secret');
  });

  it('se rouvre avec la clé de secours, même mal tapée', async () => {
    const recovery = await vault.create(salt, prf(1), 'cred-1');
    await vault.save({ origin: 'https://a.test', username: 'u', password: 'secret' });
    await vault.lock();
    await expect(vault.unlockWithRecovery('AAAAA-AAAAA-AAAAA-AAAAA-AAAAA')).rejects.toMatchObject({ reason: 'wrong-key' });
    await vault.unlockWithRecovery(recovery.toLowerCase().replace(/-/g, ' '));
    expect((await vault.entries())[0]?.password).toBe('secret');
  });

  it('relie une nouvelle clé Touch ID après un déverrouillage de secours', async () => {
    const recovery = await vault.create(salt, prf(1), 'cred-1');
    await vault.save({ origin: 'https://a.test', username: 'u', password: 'secret' });
    await vault.lock();
    await vault.unlockWithRecovery(recovery);
    const newSalt = Vault.newPrfSalt();
    await vault.relinkPrf(newSalt, prf(9), 'cred-2');
    await vault.lock();
    await expect(vault.unlockWithPrf(prf(1))).rejects.toMatchObject({ reason: 'wrong-key' });
    await vault.unlockWithPrf(prf(9));
    expect((await vault.entries())[0]?.password).toBe('secret');
    expect((await vault.read())?.credentialId).toBe('cred-2');
    await vault.lock();
    await vault.unlockWithRecovery(recovery);
    expect(await vault.isUnlocked()).toBe(true);
  });

  it('expire le déverrouillage', async () => {
    await vault.create(salt, prf(1), 'cred-1');
    const record = session.data.get(UNLOCK_KEY) as { key: string; expiresAt: number };
    expect(record.expiresAt).toBeGreaterThan(Date.now() + 14 * 60_000);
    session.data.set(UNLOCK_KEY, { ...record, expiresAt: Date.now() - 1 });
    expect(await vault.isUnlocked()).toBe(false);
    expect(session.data.has(UNLOCK_KEY)).toBe(false);
  });

  it('détecte une altération du contenu', async () => {
    await vault.create(salt, prf(1), 'cred-1');
    await vault.save({ origin: 'https://a.test', username: 'u', password: 'secret' });
    const blob = local.data.get(VAULT_KEY) as VaultBlob;
    const data = blob.entries?.data ?? '';
    const flipped = (data[0] === 'A' ? 'B' : 'A') + data.slice(1);
    local.data.set(VAULT_KEY, { ...blob, entries: { iv: blob.entries?.iv ?? '', data: flipped } });
    await expect(vault.entries()).rejects.toMatchObject({ reason: 'corrupt' });
  });

  it('ne laisse rien en clair sur le disque', async () => {
    await vault.create(salt, prf(1), 'cred-1');
    await vault.save({ origin: 'https://secret-site.example', username: 'alex@example.com', password: 'Tr0ub4dor&3' });
    const onDisk = JSON.stringify(local.data.get(VAULT_KEY));
    expect(onDisk).not.toContain('secret-site');
    expect(onDisk).not.toContain('alex@example.com');
    expect(onDisk).not.toContain('Tr0ub4dor');
    const inSession = JSON.stringify(session.data.get(UNLOCK_KEY));
    expect(inSession).not.toContain('Tr0ub4dor');
  });

  it('détruit tout', async () => {
    await vault.create(salt, prf(1), 'cred-1');
    await vault.destroy();
    expect(await vault.exists()).toBe(false);
    expect(await vault.isUnlocked()).toBe(false);
    await expect(vault.unlockWithPrf(prf(1))).rejects.toMatchObject({ reason: 'missing' });
  });
});
