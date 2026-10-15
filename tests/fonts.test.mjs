import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

const METADATA = `)]}'
{"familyMetadataList":[
  {"family":"Lobster","category":"Display","fonts":{"400":{}},"axes":[],"popularity":140},
  {"family":"Inter","category":"Sans Serif","fonts":{"100":{},"900":{},"400":{},"400i":{}},"axes":[{"tag":"wght"}],"popularity":2},
  {"family":"Lato","category":"Sans Serif","fonts":{"700":{},"300":{},"400":{}},"axes":[],"popularity":5},
  {"family":"Acme Brand","category":"Serif","fonts":{"400":{}},"axes":[],"popularity":1,"isBrandFont":true},
  {"family":"Bad<Name","category":"Serif","fonts":{"400":{}},"axes":[],"popularity":3}
]}`;

test('parseGoogleMetadata sorts by popularity and drops brand or unsafe families', () => {
  const fonts = h.parseGoogleMetadata(METADATA);
  assert.deepEqual(fonts, [
    { family: 'Inter', category: 'sans-serif', weights: [100, 400, 900], variable: true },
    { family: 'Lato', category: 'sans-serif', weights: [300, 400, 700], variable: false },
    { family: 'Lobster', category: 'display', weights: [400], variable: false },
  ]);
});

test('family parameters, stylesheet URLs and font stacks', () => {
  const [inter, lato, lobster] = h.parseGoogleMetadata(METADATA);
  assert.equal(h.googleFamilyParam(inter), 'Inter:wght@100..900');
  assert.equal(h.googleFamilyParam(lato), 'Lato:wght@300;400;700');
  assert.equal(h.googleFamilyParam(lobster), 'Lobster');
  assert.equal(h.googleFontsHref(['Playfair Display:wght@400..900', 'Lobster']), 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&family=Lobster&display=swap');
  assert.match(h.previewHref({ family: 'Buda', category: 'display', weights: [300], variable: false }), /family=Buda:wght@300&text=Buda&display=block$/);
  assert.equal(h.fontStack('Inter', 'sans-serif'), 'Inter, sans-serif');
  assert.equal(h.fontStack('Playfair Display', 'serif'), "'Playfair Display', serif");
  assert.equal(h.fontStack('Dancing Script', 'handwriting'), "'Dancing Script', cursive");
  assert.equal(h.firstFamily("'Playfair Display', serif"), 'Playfair Display');
  assert.equal(h.firstFamily('"Inter", system-ui'), 'Inter');
  assert.equal(h.firstFamily(''), '');
});

test('isGoogleFamilyParam only accepts plain names and weight axes', () => {
  for (const ok of ['Inter', 'Press Start 2P', 'Inter:wght@100..900', 'Lato:wght@300;400;700', 'DM Sans:wght@100..1000']) assert.ok(h.isGoogleFamilyParam(ok), ok);
  for (const bad of ['', 'Inter"', 'Inter&x=1', 'Inter:ital@1', 'Inter:wght@abc', '<script>', 'A'.repeat(80)]) assert.ok(!h.isGoogleFamilyParam(bad), bad);
});

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Site</title>
  </head>
  <body></body>
</html>
`;

test('ensureGoogleFontLink adds, merges and replaces families in one managed link', () => {
  const one = h.ensureGoogleFontLink(HTML, 'Inter:wght@100..900');
  assert.ok(one.includes('    <link rel="preconnect" href="https://fonts.googleapis.com" />\n'));
  assert.ok(one.includes('    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" data-oc-fonts />\n  </head>'));
  assert.equal(h.ensureGoogleFontLink(one, 'Inter:wght@100..900'), one, 'already linked: unchanged');

  const two = h.ensureGoogleFontLink(one, 'Lobster');
  assert.deepEqual(h.linkedGoogleFamilies(two), ['Inter', 'Lobster']);
  assert.equal(two.match(/preconnect/g).length, 2, 'preconnect hints are not duplicated');
  assert.equal(two.match(/data-oc-fonts/g).length, 1);

  const replaced = h.ensureGoogleFontLink(two, 'Inter:wght@400;700');
  assert.ok(replaced.includes('family=Lobster&family=Inter:wght@400;700&display=swap'));
  assert.equal(replaced.split('\n').length, two.split('\n').length);

  const crlf = h.ensureGoogleFontLink(HTML.replace(/\n/g, '\r\n'), 'Lobster');
  assert.ok(!/[^\r]\n/.test(crlf), 'keeps CRLF line endings');

  assert.throws(() => h.ensureGoogleFontLink('<html><body></body></html>', 'Inter'), /no <\/head>/);
  assert.throws(() => h.ensureGoogleFontLink(HTML, 'Inter"><script>'), /Invalid/);
});
