import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Switching school sections must not render one section with another section's data (it blanked the whole app).
test('each school section is mounted fresh, so it never reads the previous section data',()=>{
  const src=readFileSync('src/SchoolWorkspace.jsx','utf8');
  assert.match(src,/<SchoolSection key=\{id\+'\/'\+section\}/);
});
test('the app has an error boundary around the routes so one screen cannot blank the page',()=>{
  const src=readFileSync('src/App.jsx','utf8');
  assert.match(src,/<ErrorBoundary resetKey=\{pathname\}>\{children\}<\/ErrorBoundary>/);
});

test('the old membership preview form redirects to the real purchase page once checkout is on',()=>{
  const src=readFileSync('src/App.jsx','utf8');
  assert.match(src,/path="\/membership\/new" element=\{INTEGRATIONS\.stripeCheckout \? <Navigate to="\/membership\/buy" replace \/> : <Journey kind="membership" \/>\}/);
});
