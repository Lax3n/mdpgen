/**
 * Le coffre : mots de passe chiffrés en local, clé dérivée de Touch ID (WebAuthn PRF).
 *
 *   sortie PRF (32 o) ──HKDF──▶ KEK ──déchiffre──▶ VK ──AES-GCM──▶ entrées
 *   clé de secours (25 car.) ──HKDF──▶ KEK₂ ──déchiffre──▶ la même VK
 *
 * Rien n'est écrit en clair : le blob (`chrome.storage.local`) ne contient que
 * des sels, la clé du coffre enveloppée deux fois et les entrées chiffrées.
 * La clé déverrouillée ne vit que dans `chrome.storage.session` (mémoire),
 * avec une échéance, et disparaît à la fermeture du navigateur.
 *
 * Tout est WebCrypto ; le module n'a aucune dépendance au navigateur en dehors
 * des deux stockages qu'on lui injecte, pour pouvoir le tester sous Node.
 */
import { generate } from '@mdpgen/core';

export interface VaultEntry {
  id: string;
  /** Origine du formulaire (schéma + hôte + port). */
  origin: string;
  /** Hôte, pour la recherche et l'affichage. */
  host: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export interface Sealed {
  iv: string;
  data: string;
}

export interface VaultBlob {
  version: 1;
  createdAt: number;
  updatedAt: number;
  /** Sel envoyé à l'authentificateur (PRF) et à HKDF, base64url. */
  prfSalt: string;
  /** Sel HKDF de la clé de secours, base64url. */
  recoverySalt: string;
  /** Identifiant (base64url) de la clé WebAuthn dont la PRF enveloppe VK. */
  credentialId: string;
  wrappedByPrf: Sealed;
  wrappedByRecovery: Sealed;
  /** Entrées chiffrées par VK ; null tant qu'il n'y en a aucune. */
  entries: Sealed | null;
}

/** Abstraction minimale des zones de stockage. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

interface UnlockRecord {
  key: string;
  expiresAt: number;
}

export const VAULT_KEY = 'vault';
export const UNLOCK_KEY = 'vaultUnlock';
export const PENDING_SAVE_KEY = 'vaultPendingSave';

/** Alphabet de la clé de secours : base32 de Crockford, sans I, L, O ni U. */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_LENGTH = 25;

const KEK_INFO = 'mdpgen/vault/kek/v1';
const RECOVERY_INFO = 'mdpgen/vault/recovery/v1';
const ENTRIES_AAD = 'mdpgen/vault/entries/v1';

export class VaultError extends Error {
  constructor(
    message: string,
    readonly reason: 'locked' | 'missing' | 'exists' | 'wrong-key' | 'corrupt' | 'invalid',
  ) {
    super(message);
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

function bytesOf(input: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  if (input instanceof Uint8Array) return new Uint8Array(input) as Uint8Array<ArrayBuffer>;
  return new Uint8Array(input.slice(0)) as Uint8Array<ArrayBuffer>;
}

/** Une clé de secours de 125 bits, tirée uniformément, groupée par cinq : XXXXX-XXXXX-XXXXX-XXXXX-XXXXX. */
export function generateRecoveryKey(): string {
  const { password } = generate({ length: RECOVERY_LENGTH, classes: [{ chars: RECOVERY_ALPHABET }] });
  return formatRecoveryKey(password);
}

export function formatRecoveryKey(raw: string): string {
  return (raw.match(/.{1,5}/g) ?? []).join('-');
}

/**
 * Ramène ce que l'utilisateur a tapé à la forme canonique : majuscules, sans
 * séparateurs, O lu comme 0, I et L comme 1 (tolérances de Crockford).
 */
export function normalizeRecoveryKey(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== RECOVERY_LENGTH) throw new VaultError('La clé de secours compte 25 caractères.', 'invalid');
  for (const ch of cleaned) {
    if (!RECOVERY_ALPHABET.includes(ch)) throw new VaultError(`Caractère inattendu dans la clé de secours : ${ch}.`, 'invalid');
  }
  return cleaned;
}

async function deriveKek(secret: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function wrap(vaultKey: CryptoKey, kek: CryptoKey): Promise<Sealed> {
  const iv = randomBytes(12);
  const data = await crypto.subtle.wrapKey('raw', vaultKey, kek, { name: 'AES-GCM', iv });
  return { iv: toBase64Url(iv), data: toBase64Url(data) };
}

async function unwrap(sealed: Sealed, kek: CryptoKey): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      fromBase64Url(sealed.data),
      kek,
      { name: 'AES-GCM', iv: fromBase64Url(sealed.iv) },
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  } catch {
    throw new VaultError('Cette clé n’ouvre pas le coffre.', 'wrong-key');
  }
}

async function importVaultKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

function isBlob(value: unknown): value is VaultBlob {
  const v = value as VaultBlob | undefined;
  return (
    !!v &&
    v.version === 1 &&
    typeof v.prfSalt === 'string' &&
    typeof v.recoverySalt === 'string' &&
    typeof v.credentialId === 'string' &&
    !!v.wrappedByPrf &&
    !!v.wrappedByRecovery
  );
}

export interface NewEntry {
  origin: string;
  username: string;
  password: string;
}

export class Vault {
  constructor(
    private readonly local: KeyValueStore,
    private readonly session: KeyValueStore,
    /** Durée de déverrouillage en minutes. */
    private readonly lockMinutes: () => Promise<number>,
  ) {}

  /** Le coffre branché sur chrome.storage ; la durée de verrou vient des réglages. */
  static forChrome(lockMinutes: () => Promise<number>): Vault {
    const area = (store: chrome.storage.StorageArea): KeyValueStore => ({
      get: async (key) => (await store.get(key))[key],
      set: (key, value) => store.set({ [key]: value }),
      remove: (key) => store.remove(key),
    });
    return new Vault(area(chrome.storage.local), area(chrome.storage.session), lockMinutes);
  }

  async read(): Promise<VaultBlob | null> {
    const value = await this.local.get(VAULT_KEY);
    return isBlob(value) ? value : null;
  }

  async exists(): Promise<boolean> {
    return (await this.read()) !== null;
  }

  /** Sel à passer à l'évaluation PRF ; lève si le coffre n'existe pas. */
  async prfSalt(): Promise<Uint8Array<ArrayBuffer>> {
    const blob = await this.requireBlob();
    return fromBase64Url(blob.prfSalt);
  }

  /**
   * Crée le coffre. `prfOutput` est la sortie PRF obtenue avec `prfSalt`
   * (générer le sel avec `newPrfSalt()` avant l'assertion). Rend la clé de
   * secours, à montrer une seule fois. Le coffre est déverrouillé en sortie.
   */
  async create(prfSalt: Uint8Array<ArrayBuffer>, prfOutput: ArrayBuffer | Uint8Array, credentialId: string): Promise<string> {
    if (await this.exists()) throw new VaultError('Le coffre existe déjà.', 'exists');
    const recoveryKey = generateRecoveryKey();
    const recoverySalt = randomBytes(32);
    const vaultKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const kek = await deriveKek(bytesOf(prfOutput), prfSalt, KEK_INFO);
    const kek2 = await deriveKek(encoder.encode(normalizeRecoveryKey(recoveryKey)) as Uint8Array<ArrayBuffer>, recoverySalt, RECOVERY_INFO);
    const now = Date.now();
    const blob: VaultBlob = {
      version: 1,
      createdAt: now,
      updatedAt: now,
      prfSalt: toBase64Url(prfSalt),
      recoverySalt: toBase64Url(recoverySalt),
      credentialId,
      wrappedByPrf: await wrap(vaultKey, kek),
      wrappedByRecovery: await wrap(vaultKey, kek2),
      entries: null,
    };
    await this.local.set(VAULT_KEY, blob);
    await this.storeUnlocked(vaultKey);
    return recoveryKey;
  }

  static newPrfSalt(): Uint8Array<ArrayBuffer> {
    return randomBytes(32);
  }

  async unlockWithPrf(prfOutput: ArrayBuffer | Uint8Array): Promise<void> {
    const blob = await this.requireBlob();
    const kek = await deriveKek(bytesOf(prfOutput), fromBase64Url(blob.prfSalt), KEK_INFO);
    const vaultKey = await unwrap(blob.wrappedByPrf, kek);
    await this.storeUnlocked(vaultKey);
  }

  async unlockWithRecovery(recoveryKey: string): Promise<void> {
    const blob = await this.requireBlob();
    const normalized = normalizeRecoveryKey(recoveryKey);
    const kek2 = await deriveKek(encoder.encode(normalized) as Uint8Array<ArrayBuffer>, fromBase64Url(blob.recoverySalt), RECOVERY_INFO);
    const vaultKey = await unwrap(blob.wrappedByRecovery, kek2);
    await this.storeUnlocked(vaultKey);
  }

  /** Après un déverrouillage par clé de secours : relie une nouvelle clé Touch ID (nouveau sel, nouvelle enveloppe). */
  async relinkPrf(prfSalt: Uint8Array<ArrayBuffer>, prfOutput: ArrayBuffer | Uint8Array, credentialId: string): Promise<void> {
    const blob = await this.requireBlob();
    const vaultKey = await this.requireUnlocked();
    const kek = await deriveKek(bytesOf(prfOutput), prfSalt, KEK_INFO);
    await this.local.set(VAULT_KEY, {
      ...blob,
      prfSalt: toBase64Url(prfSalt),
      credentialId,
      wrappedByPrf: await wrap(vaultKey, kek),
      updatedAt: Date.now(),
    } satisfies VaultBlob);
  }

  async lock(): Promise<void> {
    await this.session.remove(UNLOCK_KEY);
  }

  async isUnlocked(): Promise<boolean> {
    return (await this.readUnlocked()) !== null;
  }

  async entries(): Promise<VaultEntry[]> {
    const blob = await this.requireBlob();
    const vaultKey = await this.requireUnlocked();
    return this.decryptEntries(blob, vaultKey);
  }

  /** Ajoute ou met à jour (même origine, même identifiant). Rend l'entrée écrite. */
  async save(entry: NewEntry): Promise<VaultEntry> {
    const blob = await this.requireBlob();
    const vaultKey = await this.requireUnlocked();
    const entries = await this.decryptEntries(blob, vaultKey);
    const host = hostOf(entry.origin);
    const now = Date.now();
    const existing = entries.find((e) => e.origin === entry.origin && e.username === entry.username);
    let written: VaultEntry;
    if (existing) {
      existing.password = entry.password;
      existing.updatedAt = now;
      written = existing;
    } else {
      written = {
        id: crypto.randomUUID(),
        origin: entry.origin,
        host,
        username: entry.username,
        password: entry.password,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: null,
      };
      entries.push(written);
    }
    await this.writeEntries(blob, vaultKey, entries);
    return written;
  }

  async remove(id: string): Promise<void> {
    const blob = await this.requireBlob();
    const vaultKey = await this.requireUnlocked();
    const entries = (await this.decryptEntries(blob, vaultKey)).filter((e) => e.id !== id);
    await this.writeEntries(blob, vaultKey, entries);
  }

  async markUsed(id: string): Promise<void> {
    const blob = await this.requireBlob();
    const vaultKey = await this.requireUnlocked();
    const entries = await this.decryptEntries(blob, vaultKey);
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    entry.lastUsedAt = Date.now();
    await this.writeEntries(blob, vaultKey, entries);
  }

  /** Supprime tout : blob et clé déverrouillée. Irréversible. */
  async destroy(): Promise<void> {
    await this.local.remove(VAULT_KEY);
    await this.session.remove(UNLOCK_KEY);
    await this.session.remove(PENDING_SAVE_KEY);
  }

  private async requireBlob(): Promise<VaultBlob> {
    const blob = await this.read();
    if (!blob) throw new VaultError('Aucun coffre.', 'missing');
    return blob;
  }

  private async storeUnlocked(vaultKey: CryptoKey): Promise<void> {
    const raw = await crypto.subtle.exportKey('raw', vaultKey);
    const minutes = Math.max(1, await this.lockMinutes());
    const record: UnlockRecord = { key: toBase64Url(raw), expiresAt: Date.now() + minutes * 60_000 };
    await this.session.set(UNLOCK_KEY, record);
  }

  private async readUnlocked(): Promise<CryptoKey | null> {
    const record = (await this.session.get(UNLOCK_KEY)) as UnlockRecord | undefined;
    if (!record || typeof record.key !== 'string') return null;
    if (Date.now() > record.expiresAt) {
      await this.session.remove(UNLOCK_KEY);
      return null;
    }
    return importVaultKey(fromBase64Url(record.key));
  }

  private async requireUnlocked(): Promise<CryptoKey> {
    const key = await this.readUnlocked();
    if (!key) throw new VaultError('Le coffre est verrouillé.', 'locked');
    return key;
  }

  private async decryptEntries(blob: VaultBlob, vaultKey: CryptoKey): Promise<VaultEntry[]> {
    if (!blob.entries) return [];
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64Url(blob.entries.iv), additionalData: encoder.encode(ENTRIES_AAD) },
        vaultKey,
        fromBase64Url(blob.entries.data),
      );
      const parsed: unknown = JSON.parse(decoder.decode(plain));
      return Array.isArray(parsed) ? (parsed as VaultEntry[]) : [];
    } catch {
      throw new VaultError('Le coffre est illisible : clé différente ou contenu altéré.', 'corrupt');
    }
  }

  private async writeEntries(blob: VaultBlob, vaultKey: CryptoKey, entries: VaultEntry[]): Promise<void> {
    const iv = randomBytes(12);
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(ENTRIES_AAD) },
      vaultKey,
      encoder.encode(JSON.stringify(entries)),
    );
    await this.local.set(VAULT_KEY, {
      ...blob,
      entries: { iv: toBase64Url(iv), data: toBase64Url(data) },
      updatedAt: Date.now(),
    } satisfies VaultBlob);
  }
}

export function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/** Enregistrement en attente : un mot de passe utilisé sur un site alors que le coffre était verrouillé. */
export interface PendingSave extends NewEntry {
  at: number;
}
