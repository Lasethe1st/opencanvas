import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

test('normalizeWorkspace clamps sizes and fills defaults', () => {
  const ws = h.normalizeWorkspace(
    {
      focusedPaneId: 'a',
      activePageId: 'home',
      layout: {
        type: 'split',
        id: 's1',
        direction: 'row',
        sizes: [0.05, 2],
        children: [
          { type: 'leaf', id: 'a', pageId: 'home' },
          { type: 'leaf', id: 'b', pageId: 'agent' },
        ],
      },
    },
    'home',
  );
  assert.equal(ws.version, 1);
  assert.equal(ws.layout.type, 'split');
  assert.ok(ws.layout.sizes[0] >= 0.15);
  assert.ok(ws.layout.sizes[1] <= 0.85);
  const sum = ws.layout.sizes.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('splitPane / closePane / maximize restore round-trip', () => {
  let layout = h.leafLayout('home', 'pane-1');
  layout = h.splitPane(layout, 'pane-1', 'row', 'agent');
  assert.equal(layout.type, 'split');
  assert.equal(layout.children.length, 2);

  const closed = h.closePane(layout, layout.children[1].id);
  assert.equal(closed.type, 'leaf');
  assert.equal(closed.pageId, 'home');

  const again = h.splitPane(h.leafLayout('home', 'p1'), 'p1', 'column', 'code');
  const designIds = h.collectDesignPaneIds(again, (id) => (id === 'home' ? 'design' : 'code'));
  assert.deepEqual(designIds, ['p1']);
});

test('setLeafPage updates only the target leaf', () => {
  const split = {
    type: 'split',
    id: 's',
    direction: 'row',
    sizes: [0.5, 0.5],
    children: [
      { type: 'leaf', id: 'a', pageId: 'home' },
      { type: 'leaf', id: 'b', pageId: 'home' },
    ],
  };
  const next = h.setLeafPage(split, 'b', 'agent');
  assert.equal(next.children[0].pageId, 'home');
  assert.equal(next.children[1].pageId, 'agent');
});
