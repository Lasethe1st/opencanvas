import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

test('reduceAgentGraph walks start → step → tools → question → done', () => {
  let g = h.EMPTY_AGENT_GRAPH;
  g = h.reduceAgentGraph(g, { turnId: 't1', type: 'start', request: 'Add a hero' });
  assert.equal(g.rootId, 't1');
  assert.equal(g.nodes.t1.status, 'running');

  g = h.reduceAgentGraph(g, { turnId: 't1', type: 'step', stepId: 't1:step:0', index: 0, label: 'Step 1' });
  assert.equal(g.nodes['t1:step:0'].kind, 'step');
  assert.equal(g.activeNodeId, 't1:step:0');

  g = h.reduceAgentGraph(g, {
    turnId: 't1',
    type: 'tool-start',
    callId: 'c1',
    tool: 'insert_jsx',
    summary: 'Insert hero in src/App.jsx',
    startedAt: 1000,
  });
  assert.equal(g.nodes.c1.parentId, 't1:step:0');
  assert.equal(g.nodes.c1.filePath, 'src/App.jsx');
  assert.equal(g.nodes.c1.status, 'running');

  g = h.reduceAgentGraph(g, {
    turnId: 't1',
    type: 'tool-end',
    callId: 'c1',
    ok: true,
    summary: 'Inserted',
    endedAt: 1200,
  });
  assert.equal(g.nodes.c1.status, 'completed');

  g = h.reduceAgentGraph(g, {
    turnId: 't1',
    type: 'question',
    question: { id: 'q1', question: 'Which layout?', options: ['A', 'B'], allowText: true },
  });
  assert.equal(g.nodes.q1.status, 'waiting');
  assert.equal(g.nodes.q1.kind, 'wait');

  g = h.reduceAgentGraph(g, { turnId: 't1', type: 'resolved', id: 'q1', answer: 'A' });
  assert.equal(g.nodes.q1.status, 'completed');

  g = h.reduceAgentGraph(g, { turnId: 't1', type: 'done', stopped: false });
  assert.equal(g.nodes.t1.status, 'completed');
  assert.equal(g.nodes['t1:end'].status, 'completed');
});

test('reduceAgentGraph cancel and error mark running nodes', () => {
  let g = h.EMPTY_AGENT_GRAPH;
  g = h.reduceAgentGraph(g, { turnId: 't2', type: 'start', request: 'x' });
  g = h.reduceAgentGraph(g, { turnId: 't2', type: 'tool-start', callId: 'c2', tool: 'set_styles', summary: 'Style' });
  g = h.reduceAgentGraph(g, { turnId: 't2', type: 'done', stopped: true });
  assert.equal(g.nodes.c2.status, 'cancelled');
  assert.equal(g.nodes['t2:end'].status, 'cancelled');

  g = h.EMPTY_AGENT_GRAPH;
  g = h.reduceAgentGraph(g, { turnId: 't3', type: 'start', request: 'y' });
  g = h.reduceAgentGraph(g, { turnId: 't3', type: 'tool-start', callId: 'c3', tool: 'set_styles', summary: 'Style' });
  g = h.reduceAgentGraph(g, { turnId: 't3', type: 'error', message: 'boom' });
  assert.equal(g.nodes.c3.status, 'cancelled');
  assert.equal(g.nodes['t3:end'].status, 'failed');
  assert.equal(g.nodes.t3.status, 'failed');
});

test('fileFromSummary extracts project paths', () => {
  assert.equal(h.fileFromSummary('Edited src/components/Hero.tsx'), 'src/components/Hero.tsx');
  assert.equal(h.fileFromSummary('no path here'), null);
});
