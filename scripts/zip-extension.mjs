// Empaquette packages/extension/dist en store/mdpgen-extension-<version>.zip pour le Chrome Web Store.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'packages/extension/dist');
if (!existsSync(path.join(dist, 'manifest.json'))) {
  console.error('packages/extension/dist est absent : lancez « npm run build » d’abord.');
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
const out = path.join(root, 'store', `mdpgen-extension-${version}.zip`);
mkdirSync(path.dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', out, '.', '-x', '.DS_Store', '-x', '*/.DS_Store'], { cwd: dist, stdio: 'inherit' });
console.log(path.relative(root, out));
