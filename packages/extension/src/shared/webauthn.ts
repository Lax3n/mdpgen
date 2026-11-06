/**
 * Touch ID par WebAuthn, depuis les pages de l'extension uniquement.
 *
 * L'extension est sa propre partie utilisatrice (RP ID = identifiant de
 * l'extension). La première fois, une clé est créée dans l'authentificateur de
 * plateforme (Touch ID sur Mac) ; ensuite chaque confirmation est une assertion
 * dont on vérifie la signature, l'origine, le défi et le drapeau de
 * vérification de l'utilisateur. Rien ne quitte la machine.
 */

const STORAGE_KEY = 'touchIdCredential';
const RP_NAME = 'MDP Gen';
const TIMEOUT_MS = 60_000;

export interface StoredCredential {
  /** Identifiant de la clé, base64url. */
  id: string;
  /** Clé publique SPKI, base64url. */
  publicKey: string;
  /** Algorithme COSE (−7 = ES256, −257 = RS256). */
  alg: number;
  /** Hachage du RP ID tel que l'authentificateur l'a signé à la création, base64url. */
  rpIdHash: string;
  createdAt: number;
}

export type TouchIdStatus = 'unsupported' | 'unavailable' | 'not-enrolled' | 'enrolled';

export class TouchIdError extends Error {
  constructor(
    message: string,
    readonly reason: 'unsupported' | 'unavailable' | 'cancelled' | 'invalid' | 'failed',
  ) {
    super(message);
  }
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
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

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/** Signature ECDSA DER (SEQUENCE de deux INTEGER) → r‖s de 64 octets, attendu par WebCrypto. */
function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new TouchIdError('Signature mal formée.', 'invalid');
  let offset = 2;
  if ((der[1] as number) & 0x80) offset += (der[1] as number) & 0x7f;
  const readInteger = (): Uint8Array => {
    if (der[offset] !== 0x02) throw new TouchIdError('Signature mal formée.', 'invalid');
    const length = der[offset + 1] as number;
    const value = der.slice(offset + 2, offset + 2 + length);
    offset += 2 + length;
    return value;
  };
  const r = readInteger();
  const s = readInteger();
  const raw = new Uint8Array(64);
  const put = (value: Uint8Array, at: number): void => {
    const trimmed = value[0] === 0 && value.length > 32 ? value.slice(1) : value;
    if (trimmed.length > 32) throw new TouchIdError('Signature mal formée.', 'invalid');
    raw.set(trimmed, at + 32 - trimmed.length);
  };
  put(r, 0);
  put(s, 32);
  return raw;
}

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

function rpId(): string {
  return location.hostname;
}

export function isWebAuthnSupported(): boolean {
  return typeof PublicKeyCredential === 'function' && typeof navigator.credentials?.create === 'function';
}

export async function readStoredCredential(): Promise<StoredCredential | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const cred = stored[STORAGE_KEY] as StoredCredential | undefined;
  return cred && typeof cred.id === 'string' && typeof cred.publicKey === 'string' && typeof cred.rpIdHash === 'string'
    ? cred
    : null;
}

export async function touchIdStatus(): Promise<TouchIdStatus> {
  if (!isWebAuthnSupported()) return 'unsupported';
  let available = false;
  try {
    available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    available = false;
  }
  if (!available) return 'unavailable';
  return (await readStoredCredential()) ? 'enrolled' : 'not-enrolled';
}

function translateError(error: unknown): TouchIdError {
  if (error instanceof TouchIdError) return error;
  const name = (error as { name?: string })?.name ?? '';
  const message = (error as { message?: string })?.message ?? String(error);
  if (name === 'NotAllowedError' || name === 'AbortError') return new TouchIdError(message, 'cancelled');
  if (name === 'NotSupportedError' || name === 'SecurityError') return new TouchIdError(message, 'unsupported');
  if (name === 'InvalidStateError') return new TouchIdError(message, 'failed');
  return new TouchIdError(message, 'failed');
}

/** Crée la clé Touch ID de l'extension. L'utilisateur est vérifié pendant la création. */
export async function enroll(): Promise<StoredCredential> {
  if (!isWebAuthnSupported()) throw new TouchIdError('WebAuthn indisponible.', 'unsupported');
  const challenge = randomBytes(32);
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        rp: { id: rpId(), name: RP_NAME },
        user: { id: randomBytes(16), name: 'mdpgen', displayName: RP_NAME },
        challenge,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
        },
        attestation: 'none',
        timeout: TIMEOUT_MS,
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    throw translateError(error);
  }
  if (!credential) throw new TouchIdError('Aucune clé créée.', 'failed');
  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey = response.getPublicKey?.();
  const alg = response.getPublicKeyAlgorithm?.();
  if (!publicKey || (alg !== -7 && alg !== -257)) throw new TouchIdError('Clé publique inexploitable.', 'failed');
  const authData = new Uint8Array(response.getAuthenticatorData());
  if (((authData[32] as number) & 0x04) === 0) throw new TouchIdError('Utilisateur non vérifié.', 'invalid');
  const stored: StoredCredential = {
    id: toBase64Url(credential.rawId),
    publicKey: toBase64Url(publicKey),
    alg,
    rpIdHash: toBase64Url(authData.slice(0, 32)),
    createdAt: Date.now(),
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: stored });
  return stored;
}

/** Demande Touch ID et vérifie l'assertion. Lève TouchIdError en cas d'échec. */
export async function verify(): Promise<void> {
  const stored = await readStoredCredential();
  if (!stored) throw new TouchIdError('Touch ID non activé.', 'failed');
  const challenge = randomBytes(32);
  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        rpId: rpId(),
        challenge,
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(stored.id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: TIMEOUT_MS,
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    throw translateError(error);
  }
  if (!assertion) throw new TouchIdError('Aucune assertion.', 'failed');
  const response = assertion.response as AuthenticatorAssertionResponse;
  const authData = new Uint8Array(response.authenticatorData);
  const clientData = new Uint8Array(response.clientDataJSON);

  // 1. Le défi, le type et l'origine du clientDataJSON sont les nôtres.
  const client = JSON.parse(new TextDecoder().decode(clientData)) as { type?: string; challenge?: string; origin?: string };
  if (client.type !== 'webauthn.get') throw new TouchIdError('Type d’assertion inattendu.', 'invalid');
  if (client.challenge !== toBase64Url(challenge)) throw new TouchIdError('Défi inattendu.', 'invalid');
  if (client.origin !== location.origin) throw new TouchIdError('Origine inattendue.', 'invalid');

  // 2. Le hachage du RP ID (celui signé à la création : Chromium hache l'origine complète pour une extension) et le drapeau « utilisateur vérifié ».
  if (!equalBytes(authData.slice(0, 32), fromBase64Url(stored.rpIdHash))) throw new TouchIdError('RP ID inattendu.', 'invalid');
  if (((authData[32] as number) & 0x04) === 0) throw new TouchIdError('Utilisateur non vérifié.', 'invalid');

  // 3. La signature (ES256 ou RS256) sur authenticatorData ‖ SHA-256(clientDataJSON).
  const signed = new Uint8Array(authData.length + 32);
  signed.set(authData, 0);
  signed.set(await sha256(clientData as Uint8Array<ArrayBuffer>), authData.length);
  const signature = new Uint8Array(response.signature);
  let valid: boolean;
  if (stored.alg === -257) {
    const key = await crypto.subtle.importKey(
      'spki',
      fromBase64Url(stored.publicKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, signed);
  } else {
    const key = await crypto.subtle.importKey(
      'spki',
      fromBase64Url(stored.publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(signature), signed);
  }
  if (!valid) throw new TouchIdError('Signature invalide.', 'invalid');
}

/** Vérifie l'utilisateur : crée la clé si besoin (ce qui vérifie déjà), sinon demande une assertion. */
export async function ensureVerified(): Promise<'enrolled' | 'verified'> {
  const stored = await readStoredCredential();
  if (!stored) {
    await enroll();
    return 'enrolled';
  }
  await verify();
  return 'verified';
}

export async function resetEnrollment(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
