import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

const APP = `import Thing from './Thing';

// A comment that must survive
export default function App() {
  const items = [1, 2];
  return (
    <main className="page">
      <h1 className="title">Hello</h1>
      <p>First</p>
      <Thing prop={1} />
      {items.map((i) => <span key={i}>{i}</span>)}
    </main>
  );
}
`;

function idOf(code, needle) {
  const offset = code.indexOf(needle);
  const { line, column } = h.offsetToLineCol(code, offset);
  return { line, column };
}

test('injectSourceIds tags host elements only', () => {
  const { code, changed } = h.injectSourceIds(APP, 'App.jsx', 'src/App.jsx');
  assert.ok(changed);
  assert.match(code, /<main data-oc-id="src\/App.jsx:7:4"/);
  assert.match(code, /<h1 data-oc-id="src\/App.jsx:8:6"/);
  assert.doesNotMatch(code, /<Thing data-oc-id/);
  assert.match(code, /<span data-oc-id=/);
});

test('ensureStyleKey adds a data-oc attribute and preserves everything else', () => {
  const { line, column } = idOf(APP, '<h1');
  const { code, key } = h.ensureStyleKey(APP, 'App.jsx', line, column);
  assert.match(key, /^h1-/);
  assert.ok(code.includes(`<h1 data-oc="${key}" className="title">Hello</h1>`));
  assert.ok(code.includes('// A comment that must survive'));
  assert.equal(code.replace(` data-oc="${key}"`, ''), APP);
  const again = h.ensureStyleKey(code, 'App.jsx', line, column);
  assert.equal(again.key, key);
  assert.equal(again.code, code);
});

test('setText replaces only the text content', () => {
  const { line, column } = idOf(APP, '<h1');
  const code = h.setText(APP, 'App.jsx', line, column, 'Welcome {all}');
  assert.ok(code.includes('<h1 className="title">{"Welcome {all}"}</h1>'));
  assert.equal(code.split('\n').length, APP.split('\n').length);
});

test('insertElement adds a child to a container on its own line', () => {
  const { line, column } = idOf(APP, '<main');
  const { code, offset } = h.insertElement(APP, 'App.jsx', line, column, '<p data-oc="p-x">New</p>');
  assert.ok(code.includes('      {items.map((i) => <span key={i}>{i}</span>)}\n      <p data-oc="p-x">New</p>\n    </main>'));
  assert.equal(code.slice(offset, offset + 2), '<p');
  h.parseSource(code, 'App.jsx');
});

test('insertElement next to a non-container inserts a sibling', () => {
  const { line, column } = idOf(APP, '<p>First');
  const { code, offset } = h.insertElement(APP, 'App.jsx', line, column, '<button>Go</button>');
  assert.ok(code.includes('<p>First</p>\n      <button>Go</button>'));
  assert.equal(code.slice(offset, offset + 7), '<button');
});

test('component root cannot get siblings or be removed', () => {
  const { line, column } = idOf(APP, '<main');
  assert.throws(() => h.removeElement(APP, 'App.jsx', line, column), /root element/);
});

test('removeElement removes the whole line', () => {
  const { line, column } = idOf(APP, '<p>First');
  const { code } = h.removeElement(APP, 'App.jsx', line, column);
  assert.ok(!code.includes('First'));
  assert.equal(code.split('\n').length, APP.split('\n').length - 1);
});

test('moveElement swaps with the adjacent element sibling', () => {
  const { line, column } = idOf(APP, '<p>First');
  const { code, offset } = h.moveElement(APP, 'App.jsx', line, column, 'up');
  assert.ok(code.indexOf('<p>First</p>') < code.indexOf('<h1'));
  assert.equal(code.slice(offset, offset + 3), '<p>');
});

test('setAttribute adds, updates and removes literal attributes', () => {
  const { line, column } = idOf(APP, '<h1');
  let code = h.setAttribute(APP, 'App.jsx', line, column, 'data-oc-name', 'Title');
  assert.ok(code.includes('<h1 data-oc-name="Title" className="title">'));
  code = h.setAttribute(code, 'App.jsx', line, column, 'data-oc-name', 'Big "title"');
  assert.ok(code.includes(`data-oc-name={"Big \\"title\\""}`));
  code = h.setAttribute(code, 'App.jsx', line, column, 'data-oc-name', null);
  assert.equal(code, APP);
});

test('CSS edits respect breakpoints and preserve existing rules', () => {
  const bps = { tablet: 1024, mobile: 640, detected: false };
  let css = '/* header */\n.keep {\n  color: red;\n}\n';
  css = h.setElementStyle(css, 'a1', 'base', 'margin', '24px', bps);
  css = h.setElementStyle(css, 'a1', 'mobile', 'margin', '8px', bps);
  css = h.setElementStyle(css, 'a1', 'tablet', 'margin', '16px', bps);
  css = h.setElementStyle(css, 'a1', 'base', 'margin', '32px', bps);
  assert.ok(css.startsWith('/* header */\n.keep {\n  color: red;\n}'));
  const styles = h.readElementStyles(css, 'a1', bps);
  assert.deepEqual(styles, { base: { margin: '32px' }, tablet: { margin: '16px' }, mobile: { margin: '8px' } });
  assert.ok(css.indexOf('max-width: 1024px') < css.indexOf('max-width: 640px'), 'tablet media query must precede mobile');
  css = h.setElementStyle(css, 'a1', 'mobile', 'margin', '', bps);
  assert.ok(!css.includes('640px'));
});

test('detectBreakpoints picks project media queries', () => {
  const bps = h.detectBreakpoints(['@media (max-width: 900px) {}', '@media (max-width:480px){}']);
  assert.deepEqual(bps, { tablet: 900, mobile: 480, detected: true });
});
