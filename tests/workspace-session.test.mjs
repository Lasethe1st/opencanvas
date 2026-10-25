import assert from 'node:assert/strict';
import test from 'node:test';

/** Mirrors src/lib/workspace-session tab helpers (pure; kept here so harness need not pull the renderer). */
function upsertTab(tabs, tab) {
  const i = tabs.findIndex((t) => t.root === tab.root);
  if (i >= 0) {
    const next = tabs.slice();
    next[i] = tab;
    return next;
  }
  return [...tabs, tab];
}
function removeTab(tabs, root) {
  return tabs.filter((t) => t.root !== root);
}
function pushClosed(closed, root, max = 8) {
  return [root, ...closed.filter((r) => r !== root)].slice(0, max);
}
function reorderTabs(tabs, from, to) {
  if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return tabs;
  const next = tabs.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
function sessionHasUnsaved(session) {
  if (!session) return false;
  return Object.values(session.buffers).some((b) => b.content !== b.saved);
}

test('tab upsert / remove / reopen / reorder', () => {
  let tabs = [];
  tabs = upsertTab(tabs, { root: '/a', name: 'A' });
  tabs = upsertTab(tabs, { root: '/b', name: 'B' });
  tabs = upsertTab(tabs, { root: '/a', name: 'A2' });
  assert.deepEqual(tabs, [
    { root: '/a', name: 'A2' },
    { root: '/b', name: 'B' },
  ]);

  tabs = removeTab(tabs, '/a');
  assert.deepEqual(tabs, [{ root: '/b', name: 'B' }]);

  let closed = [];
  closed = pushClosed(closed, '/a');
  closed = pushClosed(closed, '/c');
  closed = pushClosed(closed, '/a');
  assert.deepEqual(closed.slice(0, 2), ['/a', '/c']);

  tabs = [
    { root: '/a', name: 'A' },
    { root: '/b', name: 'B' },
    { root: '/c', name: 'C' },
  ];
  assert.deepEqual(
    reorderTabs(tabs, 0, 2).map((t) => t.root),
    ['/b', '/c', '/a'],
  );
});

test('sessionHasUnsaved gates close confirmation', () => {
  assert.equal(sessionHasUnsaved(null), false);
  assert.equal(sessionHasUnsaved({ buffers: { 'a.js': { content: 'x', saved: 'x' } } }), false);
  assert.equal(sessionHasUnsaved({ buffers: { 'a.js': { content: 'x', saved: 'y' } } }), true);
});

test('session isolation: mutating A does not affect B snapshot', () => {
  const sessionA = {
    root: '/a',
    buffers: { 'a.js': { content: 'one', saved: 'one' } },
    leftTab: 'layers',
  };
  const sessionB = {
    root: '/b',
    buffers: { 'b.js': { content: 'two', saved: 'two' } },
    leftTab: 'pages',
  };
  const bag = { '/a': structuredClone(sessionA), '/b': structuredClone(sessionB) };
  bag['/a'].buffers['a.js'].content = 'changed';
  bag['/a'].leftTab = 'files';
  assert.equal(bag['/b'].buffers['b.js'].content, 'two');
  assert.equal(bag['/b'].leftTab, 'pages');
  assert.equal(sessionHasUnsaved(bag['/a']), true);
  assert.equal(sessionHasUnsaved(bag['/b']), false);
});
