import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
manifest.version = pkg.version;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

const common = {
  bundle: true,
  target: 'chrome116',
  legalComments: 'none',
  logLevel: 'warning',
  define: { __MDPGEN_VERSION__: JSON.stringify(pkg.version) },
};

await Promise.all([
  // Le script de contenu partage l'espace global de la page : IIFE, rien n'est exporté.
  build({ ...common, entryPoints: ['src/content/index.ts'], outfile: 'dist/content.js', format: 'iife' }),
  build({ ...common, entryPoints: ['src/background/index.ts'], outfile: 'dist/background.js', format: 'esm' }),
  build({ ...common, entryPoints: ['src/popup/index.ts'], outfile: 'dist/popup.js', format: 'esm' }),
  build({ ...common, entryPoints: ['src/options/index.ts'], outfile: 'dist/options.js', format: 'esm' }),
  build({ ...common, entryPoints: ['src/confirm/index.ts'], outfile: 'dist/confirm.js', format: 'esm' }),
]);

cpSync('public', 'dist', { recursive: true });
writeFileSync('dist/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
