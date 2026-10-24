// Writes docs/api-contracts/stripe-metadata.md from the metadata contract in the Catalyst function.
// Run after changing functions/beauty_guild_api/src/metadataContract.js: npm run docs:metadata
// (test/metadata-contract.test.js fails if the page is out of date.)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { renderMarkdown } = require(join(root, 'functions', 'beauty_guild_api', 'src', 'metadataContract.js'));
const target = join(root, '..', '..', 'docs', 'api-contracts', 'stripe-metadata.md');
writeFileSync(target, renderMarkdown());
console.log('wrote docs/api-contracts/stripe-metadata.md');
