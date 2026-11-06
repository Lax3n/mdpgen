/**
 * Comptage exact des mots de passe valides, donc entropie exacte.
 *
 * Un mot de passe est tiré uniformément parmi toutes les chaînes de l'alphabet
 * qui respectent les contraintes (chaque classe requise présente, séries
 * d'identiques bornées). L'entropie est donc log2 du nombre de ces chaînes,
 * obtenu par inclusion-exclusion sur les classes requises et une récurrence
 * pour les séries. Tout est calculé en BigInt : aucune perte de précision.
 */

/** log2 d'un BigInt > 0, précis à la double près. */
export function log2BigInt(n: bigint): number {
  if (n <= 0n) throw new RangeError('log2 défini pour n > 0.');
  const bits = n.toString(2).length;
  if (bits <= 53) return Math.log2(Number(n));
  const shift = bits - 53;
  return Math.log2(Number(n >> BigInt(shift))) + shift;
}

/**
 * Nombre de chaînes de longueur `length` sur `m` symboles dont aucune série
 * d'identiques consécutifs ne dépasse `maxRun`. `maxRun` infini ou ≥ length : m^length.
 *
 * Récurrence : la dernière série a une longueur j ∈ [1, maxRun]. Si elle couvre
 * toute la chaîne (j = n) il y a m choix ; sinon le préfixe de longueur n − j est
 * une chaîne valide et la série prend l'un des m − 1 symboles différents de sa fin.
 */
export function countWithBoundedRuns(m: number, length: number, maxRun: number): bigint {
  if (!Number.isInteger(m) || m < 0) throw new RangeError('m doit être un entier ≥ 0.');
  if (!Number.isInteger(length) || length < 0) throw new RangeError('length doit être un entier ≥ 0.');
  if (length === 0) return 1n;
  if (m === 0) return 0n;
  if (!Number.isFinite(maxRun) || maxRun >= length) return BigInt(m) ** BigInt(length);
  if (!Number.isInteger(maxRun) || maxRun < 1) throw new RangeError('maxRun doit être un entier ≥ 1.');
  const M = BigInt(m);
  const M1 = BigInt(m - 1);
  const counts: bigint[] = [1n];
  for (let n = 1; n <= length; n += 1) {
    let total = 0n;
    const longest = Math.min(maxRun, n);
    for (let j = 1; j <= longest; j += 1) {
      total += j === n ? M : M1 * (counts[n - j] as bigint);
    }
    counts.push(total);
  }
  return counts[length] as bigint;
}

/**
 * Nombre exact de chaînes de longueur `length` sur un alphabet de `alphabetSize`
 * symboles qui contiennent au moins un caractère de chaque classe requise et
 * dont les séries d'identiques ne dépassent pas `maxRun`.
 *
 * Inclusion-exclusion : pour chaque sous-ensemble S de classes requises, on
 * compte les chaînes qui évitent toutes les classes de S, c'est-à-dire tirées
 * dans l'alphabet privé de l'union de S, avec le signe (−1)^|S|.
 */
export function countValidPasswords(
  alphabetSize: number,
  requiredClasses: ReadonlyArray<ReadonlyArray<string>>,
  length: number,
  maxRun: number = Number.POSITIVE_INFINITY,
): bigint {
  const k = requiredClasses.length;
  if (k > 20) throw new RangeError('Au plus 20 classes requises.');
  let total = 0n;
  for (let mask = 0; mask < 1 << k; mask += 1) {
    const union = new Set<string>();
    let size = 0;
    for (let i = 0; i < k; i += 1) {
      if (mask & (1 << i)) {
        size += 1;
        for (const ch of requiredClasses[i] as ReadonlyArray<string>) union.add(ch);
      }
    }
    const term = countWithBoundedRuns(alphabetSize - union.size, length, maxRun);
    total += size % 2 === 0 ? term : -term;
  }
  return total;
}
