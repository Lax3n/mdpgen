/**
 * Presse-papiers sans dépendance : pbcopy/pbpaste (macOS), wl-copy, xclip ou
 * xsel (Linux), clip (Windows, écriture seule). Le texte transite toujours par
 * l'entrée standard, jamais par la ligne de commande visible dans `ps`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

interface ClipboardTool {
  copy: [string, string[]];
  paste?: [string, string[]];
}

function available(command: string): boolean {
  const result = spawnSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
  return result.status === 0;
}

export function detectClipboardTool(): ClipboardTool | undefined {
  switch (process.platform) {
    case 'darwin':
      return { copy: ['pbcopy', []], paste: ['pbpaste', []] };
    case 'win32':
      return { copy: ['clip', []] };
    default:
      if (process.env.WAYLAND_DISPLAY && available('wl-copy')) {
        return { copy: ['wl-copy', []], paste: ['wl-paste', ['--no-newline']] };
      }
      if (available('xclip')) {
        return { copy: ['xclip', ['-selection', 'clipboard']], paste: ['xclip', ['-selection', 'clipboard', '-o']] };
      }
      if (available('xsel')) {
        return { copy: ['xsel', ['--clipboard', '--input']], paste: ['xsel', ['--clipboard', '--output']] };
      }
      return undefined;
  }
}

export function copyToClipboard(text: string, tool: ClipboardTool): Promise<void> {
  return new Promise((resolve, reject) => {
    const [command, args] = tool.copy;
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} a renvoyé le code ${code}.`))));
    child.stdin.end(text);
  });
}

export function readClipboard(tool: ClipboardTool): string | undefined {
  if (!tool.paste) return undefined;
  const [command, args] = tool.paste;
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout : undefined;
}

export function digest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Lance un processus détaché qui effacera le presse-papiers s'il contient encore le secret. */
export function scheduleClipboardClear(scriptPath: string, seconds: number, secretDigest: string): void {
  const child = spawn(process.execPath, [scriptPath, '--__clear-clipboard', String(seconds), secretDigest], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

/** Corps du processus détaché : attend, compare l'empreinte, efface si inchangé. */
export async function runClipboardClear(seconds: number, secretDigest: string): Promise<void> {
  const tool = detectClipboardTool();
  if (!tool?.paste) return;
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  const current = readClipboard(tool);
  if (current !== undefined && digest(current) === secretDigest) {
    await copyToClipboard('', tool);
  }
}
