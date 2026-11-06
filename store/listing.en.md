# Chrome Web Store listing (English)

**Name**: MDP Gen: strong passwords

**Summary (≤ 132 characters)**: A truly random password whenever a site asks for a new one, filled and submitted with Touch ID. Nothing is stored.

**Description**:

Like Safari, but in Brave and Chrome. Click a "new password" field: a 20-character password (129 bits) is already filled in, with its confirmation. Keep it, draw another, or touch Touch ID: the form is filled and submitted without the password ever being shown, and Brave offers to save it.

- Randomness source: the browser's cryptographic generator, no modulo bias.
- Exact entropy displayed.
- Follows the site's rules (passwordrules, maxlength).
- Popup: generate, copy, insert into the page, last suggested password (session memory, behind Touch ID).
- Matching command-line tool.
- A single permission (settings), no network request, no telemetry, public source code under the MIT license.

**Category**: Productivity. **Languages**: French, English.

**Permission justification**: `storage` keeps the settings. The content script on all pages is required to detect password fields and offer a password there; it sends nothing and only reads the field it fills.

**Data usage**: no data collected. See PRIVACY.md.
