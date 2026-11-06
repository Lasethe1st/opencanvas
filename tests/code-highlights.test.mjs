import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');
const hits = (text) => h.highlightCode(text).filter((p) => p.kind).map((p) => [p.kind, p.text]);

test('class names, element types, colours and measurements are found', () => {
  assert.deepEqual(hits('Make .nav-bar sit under the h1 in #1a2b3c at 16px'), [
    ['class', '.nav-bar'],
    ['element', 'h1'],
    ['color', '#1a2b3c'],
    ['unit', '16px'],
  ]);
  assert.deepEqual(hits('div.card > ul li'), [['element', 'div'], ['class', '.card'], ['element', 'ul'], ['element', 'li']]);
  assert.deepEqual(hits('use rgb(10 20 30), rgba(10, 20, 30, 0.5) and hsl(210 50% 40%)').map((x) => x[0]), ['color', 'color', 'color']);
  assert.deepEqual(hits('wrap it in <section> or </div>'), [['element', '<section>'], ['element', '</div>']]);
});

test('ordinary prose, file names and issue numbers are left alone', () => {
  for (const text of [
    'e.g. open index.html and logo.png, then .env and .gitignore',
    'See #123 and PR #45, version v1.2.3, the end.',
    'The button in the header form, a link and a paragraph',
    'Colour names like red or tomato stay plain, and so does #12',
    'a.b and word.word and 3.14 and ...dots',
  ]) assert.deepEqual(hits(text), [], text);
});

test('colour boxes pick readable text and keep the fill', () => {
  const [light] = h.highlightCode('#ffe066').filter((p) => p.kind === 'color');
  const [dark] = h.highlightCode('#1a2b3c').filter((p) => p.kind === 'color');
  assert.equal(light.swatch.css, '#ffe066');
  assert.equal(light.swatch.darkText, true);
  assert.equal(dark.swatch.darkText, false);
  const [see] = h.highlightCode('#00000040').filter((p) => p.kind === 'color');
  assert.equal(see.swatch.faint, true);
  const [fn] = h.highlightCode('hsl(0 100% 50%)').filter((p) => p.kind === 'color');
  assert.equal(fn.swatch.darkText, false);
  // Text is preserved exactly.
  const msg = 'a .x-y, h2 #fff 4rem <b> end';
  assert.equal(h.highlightCode(msg).map((p) => p.text).join(''), msg);
});

test('measurements keep their families', () => {
  const fam = (t) => h.highlightCode(t).find((p) => p.kind === 'unit')?.family;
  assert.equal(fam('16px'), 'absolute');
  assert.equal(fam('1.5rem'), 'font');
  assert.equal(fam('50%'), 'percent');
  assert.equal(fam('100vh'), 'viewport');
  assert.equal(fam('300ms'), 'other');
});
