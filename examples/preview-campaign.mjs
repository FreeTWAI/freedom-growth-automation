import { readFile } from 'node:fs/promises';
import { previewPublication } from '../src/index.mjs';

// Load a sanitized, fictional campaign fixture.
// Note: This does not access a database or perform external network requests.
const fixturePath = new URL('../tests/fixtures/campaign.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

// Generate a plain text preview and log the result to stdout.
const preview = previewPublication(fixture, { channel: 'plain' });
console.log(JSON.stringify(preview, null, 2));
