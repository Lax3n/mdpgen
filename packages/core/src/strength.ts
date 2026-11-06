/** Qualification d'une entropie en bits. Les seuils suivent les ordres de grandeur usuels d'attaque hors ligne. */
export type Strength = 'weak' | 'fair' | 'good' | 'strong' | 'excellent';

export function strengthFromBits(bits: number): Strength {
  if (bits < 40) return 'weak';
  if (bits < 60) return 'fair';
  if (bits < 80) return 'good';
  if (bits < 100) return 'strong';
  return 'excellent';
}
