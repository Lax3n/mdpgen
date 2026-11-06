/** Jeux de caractères nommés. Tous ASCII : les sites acceptent rarement plus. */

export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const DIGITS = '0123456789';

/** Symboles par défaut : la ponctuation ASCII sans les caractères que les sites refusent le plus (guillemets, barres, apostrophe). */
export const SYMBOLS_DEFAULT = '!#$%&()*+,-.:;<=>?@[]^_{}~';

/** Toute la ponctuation ASCII (32 caractères). */
export const SYMBOLS_ALL = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

/** Caractères qui se confondent à l'œil ou à l'oral. */
export const AMBIGUOUS = '0O1lI|';

/** ASCII imprimable (0x20 à 0x7E), espace compris. */
export const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x20 + i)).join('');

/** Classe `special` des règles Apple (passwordrules) : ponctuation sans `\` ni `/`, espace et `]` compris. */
export const APPLE_SPECIAL = '-~!@#$%^&*_+=`|(){}[:;"\'<>,.? ]';

/** Découpe en points de code, sans doublon, ordre conservé. */
export function uniqueChars(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of text) {
    if (!seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out;
}
