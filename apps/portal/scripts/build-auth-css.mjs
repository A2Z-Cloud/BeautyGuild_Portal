// Builds the Catalyst embedded-auth stylesheets served at /app/auth/*.css.
// Catalyst's base stylesheet (auth-css/base) is kept untouched and our overrides
// (auth-css/overrides.css) are appended after its last line, as the Catalyst docs instruct.
// Google Fonts are imported at the very top (an @import must come first in a stylesheet). The weights match index.html so
// the sign-in screens and the portal draw every weight from the same files (src/typography.test.js checks this).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['embedded_signin.css', 'embedded_password_reset.css', 'confirm_password.css'];
const FONTS = "@import url('https://fonts.googleapis.com/css2?family=Alegreya+Sans:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&display=swap');\n";
const overrides = readFileSync(join(root, 'auth-css', 'overrides.css'), 'utf8');

mkdirSync(join(root, 'public', 'auth'), { recursive: true });
for (const name of FILES) {
  const base = readFileSync(join(root, 'auth-css', 'base', name), 'utf8');
  writeFileSync(join(root, 'public', 'auth', name), FONTS + base + overrides);
  console.log('built public/auth/' + name);
}
