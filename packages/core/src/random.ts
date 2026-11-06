/**
 * Source d'aléa et tirage uniforme sans biais.
 *
 * La seule source utilisée est `crypto.getRandomValues`, le générateur
 * cryptographique du navigateur ou de Node. Sur macOS il est alimenté par le
 * générateur matériel d'Apple via le noyau ; aucun autre composant n'est requis.
 */

/** Remplit un tableau de mots de 32 bits avec de l'aléa cryptographique. */
export type RandomSource = (buffer: Uint32Array<ArrayBuffer>) => void;

/** `getRandomValues` refuse plus de 65 536 octets par appel : on découpe. */
const MAX_BYTES_PER_CALL = 65_536;
const TWO_POW_32 = 0x1_0000_0000;

export const webCryptoSource: RandomSource = (buffer) => {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject === undefined || typeof cryptoObject.getRandomValues !== 'function') {
    throw new Error('Aucun générateur aléatoire cryptographique disponible (crypto.getRandomValues).');
  }
  const maxWords = MAX_BYTES_PER_CALL / Uint32Array.BYTES_PER_ELEMENT;
  for (let start = 0; start < buffer.length; start += maxWords) {
    cryptoObject.getRandomValues(buffer.subarray(start, Math.min(start + maxWords, buffer.length)));
  }
};

/**
 * Tire des entiers uniformes dans [0, n) par rejet : un mot de 32 bits est
 * refusé s'il tombe dans la queue incomplète au-dessus du dernier multiple de n,
 * ce qui supprime le biais du modulo. La probabilité de rejet est toujours < 1/2.
 */
export class UniformSampler {
  private readonly buffer: Uint32Array<ArrayBuffer>;
  private position: number;

  constructor(
    private readonly source: RandomSource = webCryptoSource,
    batchSize = 64,
  ) {
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new RangeError('batchSize doit être un entier ≥ 1.');
    }
    this.buffer = new Uint32Array(batchSize);
    this.position = batchSize;
  }

  /** Un mot de 32 bits brut. Le mot consommé est effacé du tampon. */
  next32(): number {
    if (this.position >= this.buffer.length) {
      this.source(this.buffer);
      this.position = 0;
    }
    const value = this.buffer[this.position] as number;
    this.buffer[this.position] = 0;
    this.position += 1;
    return value;
  }

  /** Entier uniforme dans [0, n), n entier dans [1, 2^32]. */
  below(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > TWO_POW_32) {
      throw new RangeError('n doit être un entier dans [1, 2^32].');
    }
    if (n === 1) return 0;
    const limit = TWO_POW_32 - (TWO_POW_32 % n);
    for (;;) {
      const word = this.next32();
      if (word < limit) return word % n;
    }
  }

  /** Efface le tampon : à appeler quand le tireur ne sert plus. */
  dispose(): void {
    this.buffer.fill(0);
    this.position = this.buffer.length;
  }
}
