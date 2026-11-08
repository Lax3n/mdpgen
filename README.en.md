# MDP Gen

A truly random password generator in two shapes that share one core:

- **a Brave / Chrome extension** that, like Safari, suggests a strong password as soon as a site asks for a new one, fills it, and can submit the form with **Touch ID** without ever showing it to you;
- **a command-line tool**, `mdpgen`, with zero dependencies.

Nothing is written to disk, nothing goes over the network, no telemetry. The code is short, readable and tested. *[Version française](README.md).*

## What the extension does

1. You click a "new password" field (sign-up, change password).
2. A bubble appears under the field; a 20-character password is already filled in, in the field and in its confirmation.
3. You choose: **Keep this one**, **Another**, **Don't use**, or **Touch ID and submit**.
4. Touch ID is requested right away, nothing to press: a small window waits for your fingerprint, then the form is filled and submitted. Brave then offers to save the password in its manager, as for any password typed by hand. Cancel and the bubble stays with its buttons; the automatic prompt can be turned off in the options.

Type anything in the field and the suggestion goes away. Nothing shows on sign-in forms (configurable).

The toolbar popup generates on demand, copies, inserts into the page, and shows the **last suggested password** for ten minutes, behind Touch ID: a safety net if Brave did not offer to save. That memory lives in `chrome.storage.session`, is never written to disk, is cleared when the browser closes, and can be turned off.

### Install in Brave

From the Chrome Web Store once the listing is published, or right now from source:

```bash
git clone https://github.com/Lax3n/mdpgen.git && cd mdpgen && npm install && npm run build
```

Then in Brave: `brave://extensions` → enable **Developer mode** → **Load unpacked** → pick `packages/extension/dist`. Same steps in Chrome, Edge, Arc, Vivaldi or Opera.

Touch ID is set up on first use (Brave asks for your fingerprint to create the MDP Gen key), or from the options page.

### Settings

Length (4 to 128), character sets, symbol set, ambiguous characters, longest run of identical characters, automatic bubble, sign-in fields, Touch ID, form submission, session-memory duration. Everything is on the extension's options page. When a site carries a `passwordrules` attribute (Apple format) or `maxlength`, the extension complies.

## The command-line tool

```bash
npm install -g ./packages/cli      # after npm run build at the root
mdpgen                              # one 20-character password
mdpgen -l 32 -n 5                   # five of 32
mdpgen -e                           # with entropy on stderr
mdpgen -c                           # copied to the clipboard without display, cleared after 60 s
mdpgen --no-symbols -a              # no symbols, no ambiguous characters
mdpgen -r "required: upper; required: digit; maxlength: 12"
mdpgen -j                           # JSON
```

`mdpgen --help` lists every option. Clipboard clearing leaves the clipboard alone if you copied something else in between.

## Why it is safe

- **Randomness source**: `crypto.getRandomValues`, the browser's or Node's cryptographic generator. On a Mac it is fed by Apple's hardware generator through the kernel. No third-party library is involved.
- **No modulo bias**: each character is drawn by rejection in [0, alphabet size). A raw 32-bit draw that lands in the incomplete tail is rejected, never folded.
- **Uniform over all valid passwords**: the "at least one character from each set" rule and the run limit are enforced by rejecting the whole password, not by forcing one character per class into a chosen position. Every valid string is equally likely.
- **Exact entropy**: the number of valid passwords is counted exactly (inclusion-exclusion and a recurrence, in arbitrary-precision integers); the displayed entropy is its log2. Default: 20 characters over 88 symbols, i.e. 129 bits.
- **Touch ID**: WebAuthn with the platform authenticator, the extension being its own relying party. Each confirmation is an assertion whose signature, origin, challenge, RP ID and user-verification flag are checked. The key stays in Brave, on your Mac.
- **Minimal surface**: a single permission (`storage`, for settings), a content script in an isolated Shadow DOM, a strict content security policy, no network access, no runtime dependency.

What MDP Gen does not do: it does not store your passwords (that is the job of Brave's manager or your vault), and it cannot protect against a web page reading its own field, since the password is meant for that page.

## Development

```bash
npm install
npm run typecheck      # tsc -b
npm run build          # core, CLI, extension
npm test               # unit tests (vitest): sampling, entropy, rules, CLI
npm run e2e            # Playwright, headless Chromium, extension loaded, simulated Touch ID
npm run e2e:brave      # same in Brave, visible windows
npm run zip            # Chrome Web Store package in store/
```

Layout: `packages/core` (sampling, rules, entropy; zero dependencies), `packages/cli`, `packages/extension` (Manifest V3, framework-free TypeScript, esbuild), `e2e` (HTML fixtures and tests).

Icons: [Lucide](https://lucide.dev) paths (ISC license).

## License

MIT.
