import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PREFERENCES,
  MAX_LENGTH,
  MIN_LENGTH,
  SYMBOLS_ALL,
  generate,
  optionsFromPreferences,
  parsePasswordRules,
  rulesToOptions,
  sanitizePreferences,
  strengthFromBits,
  type GenerateOptions,
  type Preferences,
  type Strength,
} from '@mdpgen/core';
import {
  copyToClipboard,
  detectClipboardTool,
  digest,
  runClipboardClear,
  scheduleClipboardClear,
} from './clipboard.js';

declare const __MDPGEN_VERSION__: string;

const STRENGTH_LABELS: Record<Strength, string> = {
  weak: 'faible',
  fair: 'moyen',
  good: 'bon',
  strong: 'fort',
  excellent: 'très fort',
};

const HELP = `mdpgen ${__MDPGEN_VERSION__} — mots de passe aléatoires, sans biais, sans dépendance

Usage : mdpgen [options]

  -l, --length <n>          longueur (défaut ${DEFAULT_PREFERENCES.length}, entre ${MIN_LENGTH} et ${MAX_LENGTH})
  -n, --count <n>           nombre de mots de passe (défaut 1)
      --no-upper            sans majuscules
      --no-lower            sans minuscules
      --no-digits           sans chiffres
      --no-symbols          sans symboles
  -s, --symbols <chars>     jeu de symboles (défaut ${DEFAULT_PREFERENCES.symbolSet})
      --all-symbols         toute la ponctuation ASCII
  -x, --exclude <chars>     caractères à exclure
  -a, --no-ambiguous        exclut 0 O 1 l I |
      --max-consecutive <n> longueur maximale d'une série d'identiques
      --any                 n'exige pas un caractère de chaque jeu
  -r, --rules <règles>      règles passwordrules (ex. "required: upper; minlength: 12")
  -c, --copy                copie dans le presse-papiers sans l'afficher
      --clear <s>           efface le presse-papiers après s secondes (défaut 60, 0 = jamais)
  -e, --entropy             affiche l'entropie sur la sortie d'erreur
  -j, --json                sortie JSON
  -h, --help                cette aide
  -V, --version             version

La source d'aléa est crypto.getRandomValues ; chaque caractère est tiré par rejet,
sans biais de modulo, et le mot de passe est uniforme parmi toutes les chaînes valides.
`;

class UsageError extends Error {}

function parseInteger(value: string | undefined, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new UsageError(`${name} attend un entier, reçu « ${value} ».`);
  const n = Number.parseInt(value, 10);
  if (n < min || n > max) throw new UsageError(`${name} doit être entre ${min} et ${max}.`);
  return n;
}

interface Invocation {
  options: GenerateOptions;
  count: number;
  copy: boolean;
  clearSeconds: number;
  showEntropy: boolean;
  json: boolean;
}

export function parseInvocation(argv: string[]): Invocation | { exit: 0; output: string } {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      length: { type: 'string', short: 'l' },
      count: { type: 'string', short: 'n' },
      'no-upper': { type: 'boolean' },
      'no-lower': { type: 'boolean' },
      'no-digits': { type: 'boolean' },
      'no-symbols': { type: 'boolean' },
      symbols: { type: 'string', short: 's' },
      'all-symbols': { type: 'boolean' },
      exclude: { type: 'string', short: 'x' },
      'no-ambiguous': { type: 'boolean', short: 'a' },
      'max-consecutive': { type: 'string' },
      any: { type: 'boolean' },
      rules: { type: 'string', short: 'r' },
      copy: { type: 'boolean', short: 'c' },
      clear: { type: 'string' },
      entropy: { type: 'boolean', short: 'e' },
      json: { type: 'boolean', short: 'j' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'V' },
    },
  });

  if (values.help) return { exit: 0, output: HELP };
  if (values.version) return { exit: 0, output: `${__MDPGEN_VERSION__}\n` };

  const prefs: Preferences = sanitizePreferences({
    length: parseInteger(values.length, '--length', MIN_LENGTH, MAX_LENGTH) ?? DEFAULT_PREFERENCES.length,
    upper: !values['no-upper'],
    lower: !values['no-lower'],
    digits: !values['no-digits'],
    symbols: !values['no-symbols'],
    symbolSet: values['all-symbols'] ? SYMBOLS_ALL : (values.symbols ?? DEFAULT_PREFERENCES.symbolSet),
    excludeAmbiguous: Boolean(values['no-ambiguous']),
    requireEach: !values.any,
    maxConsecutive: parseInteger(values['max-consecutive'], '--max-consecutive', 1, 16) ?? 0,
  });
  if (values.symbols !== undefined && !values['all-symbols'] && prefs.symbolSet !== values.symbols) {
    throw new UsageError('--symbols n’accepte que de la ponctuation ASCII, sans lettre, chiffre ni espace.');
  }

  let options = optionsFromPreferences(prefs);
  if (values.rules !== undefined) {
    options = rulesToOptions(parsePasswordRules(values.rules), { length: options.length, classes: options.classes });
    if (options.exclude === undefined && prefs.excludeAmbiguous) options = { ...options, exclude: '0O1lI|' };
  }
  if (values.exclude) options = { ...options, exclude: (options.exclude ?? '') + values.exclude };

  const count = parseInteger(values.count, '--count', 1, 10_000) ?? 1;
  const copy = Boolean(values.copy);
  if (copy && count !== 1) throw new UsageError('--copy ne s’applique qu’à un seul mot de passe.');
  const clearSeconds = parseInteger(values.clear, '--clear', 0, 86_400) ?? 60;

  return { options, count, copy, clearSeconds, showEntropy: Boolean(values.entropy), json: Boolean(values.json) };
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === '--__clear-clipboard') {
    const seconds = Number.parseInt(argv[1] ?? '', 10);
    const secretDigest = argv[2] ?? '';
    if (!Number.isInteger(seconds) || seconds < 0 || !/^[0-9a-f]{64}$/.test(secretDigest)) return 2;
    await runClipboardClear(seconds, secretDigest);
    return 0;
  }

  let invocation: Invocation | { exit: 0; output: string };
  try {
    invocation = parseInvocation(argv);
  } catch (error) {
    process.stderr.write(`mdpgen : ${(error as Error).message}\nEssayez « mdpgen --help ».\n`);
    return 2;
  }
  if ('exit' in invocation) {
    process.stdout.write(invocation.output);
    return invocation.exit;
  }

  const { options, count, copy, clearSeconds, showEntropy, json } = invocation;
  const results = [];
  try {
    for (let i = 0; i < count; i += 1) results.push(generate(options));
  } catch (error) {
    process.stderr.write(`mdpgen : ${(error as Error).message}\n`);
    return 1;
  }
  const first = results[0];
  if (first === undefined) return 1;
  const strength = strengthFromBits(first.bits);

  if (copy) {
    const tool = detectClipboardTool();
    if (!tool) {
      process.stderr.write('mdpgen : aucun outil de presse-papiers trouvé (pbcopy, wl-copy, xclip, xsel).\n');
      return 1;
    }
    try {
      await copyToClipboard(first.password, tool);
    } catch (error) {
      process.stderr.write(`mdpgen : copie impossible (${(error as Error).message}).\n`);
      return 1;
    }
    let notice = `Mot de passe de ${options.length} caractères copié (${first.bits.toFixed(1)} bits, ${STRENGTH_LABELS[strength]}).`;
    if (clearSeconds > 0) {
      if (tool.paste) {
        scheduleClipboardClear(fileURLToPath(import.meta.url), clearSeconds, digest(first.password));
        notice += ` Le presse-papiers sera effacé dans ${clearSeconds} s s'il n'a pas changé.`;
      } else {
        notice += ' Effacement automatique indisponible sur cette plateforme.';
      }
    }
    process.stderr.write(`${notice}\n`);
    return 0;
  }

  if (json) {
    const payload = {
      passwords: results.map((r) => r.password),
      length: options.length,
      alphabetSize: first.alphabetSize,
      entropyBits: Number(first.bits.toFixed(3)),
      strength,
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return 0;
  }

  process.stdout.write(`${results.map((r) => r.password).join('\n')}\n`);
  if (showEntropy) {
    process.stderr.write(
      `${first.bits.toFixed(1)} bits d'entropie, ${STRENGTH_LABELS[strength]} (alphabet de ${first.alphabetSize} caractères, longueur ${options.length}).\n`,
    );
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`mdpgen : ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
