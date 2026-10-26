import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Switching school sections must not render one section with another section's data (it blanked the whole app).
test('each school section is mounted fresh, so it never reads the previous section data', () => {
  // Compared with the whitespace removed, so reformatting the source cannot break the check.
  const src = readFileSync('src/SchoolWorkspace.jsx', 'utf8').replace(/\s+/g, '');
  assert.match(src, /<SchoolSectionkey=\{id\+'\/'\+section\}/);
});
test('the app has an error boundary around the routes so one screen cannot blank the page', () => {
  const src = readFileSync('src/App.jsx', 'utf8');
  assert.match(src, /<ErrorBoundary resetKey=\{pathname\}>\{children\}<\/ErrorBoundary>/);
});

test('the old membership preview form redirects to the real purchase page once checkout is on', () => {
  const src = readFileSync('src/App.jsx', 'utf8').replace(/\s+/g, '');
  assert.match(
    src,
    /path="\/membership\/new"element=\{INTEGRATIONS\.stripeCheckout\?<Navigateto="\/membership\/buy"replace\/>:<Journeykind="membership"\/>\}/,
  );
});
