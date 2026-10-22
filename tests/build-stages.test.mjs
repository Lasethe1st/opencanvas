import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

test('reduceBuild walks structural tools and never Finishes before success', () => {
  let s = h.IDLE_BUILD;
  s = h.reduceBuild(s, { turnId: 't1', type: 'start', request: 'Add a hero' }, { frameId: 'f1' });
  assert.equal(s.phase, 'idle');
  assert.equal(s.frameId, 'f1');

  s = h.reduceBuild(s, { turnId: 't1', type: 'tool-start', callId: 'c1', tool: 'set_styles', summary: 'Styling' });
  assert.equal(s.phase, 'idle');

  s = h.reduceBuild(s, { turnId: 't1', type: 'tool-start', callId: 'c2', tool: 'insert_jsx', summary: 'Inserting' });
  assert.equal(s.phase, 'grid');

  s = h.reduceBuild(s, { turnId: 't1', type: 'tool-end', callId: 'c2', ok: false, summary: 'failed' });
  assert.equal(s.phase, 'failed');

  s = h.IDLE_BUILD;
  s = h.reduceBuild(s, { turnId: 't2', type: 'start', request: 'x' }, { frameId: 'f1' });
  s = h.reduceBuild(s, { turnId: 't2', type: 'tool-start', callId: 'c3', tool: 'insert_element', summary: 'Inserting section' });
  s = h.reduceBuild(s, { turnId: 't2', type: 'tool-end', callId: 'c3', ok: true, summary: 'ok', elementId: 'src/App.jsx:4:6' });
  assert.equal(s.phase, 'padding');
  assert.equal(s.explained, true);
  assert.equal(s.elementId, 'src/App.jsx:4:6');

  s = h.advanceBuildStage(s);
  assert.equal(s.phase, 'layout');
  s = h.advanceBuildStage(s);
  assert.equal(s.phase, 'skeleton');
  s = h.advanceBuildStage(s);
  assert.equal(s.phase, 'finished');
  s = h.advanceBuildStage(s);
  assert.equal(s.phase, 'idle');
});

test('reduceBuild stop and error never reach Finished', () => {
  let s = h.reduceBuild(h.IDLE_BUILD, { turnId: 't1', type: 'start', request: 'x' });
  s = h.reduceBuild(s, { turnId: 't1', type: 'tool-start', callId: 'c1', tool: 'write_file', summary: 'Writing' });
  assert.equal(s.phase, 'grid');
  s = h.reduceBuild(s, { turnId: 't1', type: 'done', stopped: true });
  assert.equal(s.phase, 'stopped');

  s = h.reduceBuild(h.IDLE_BUILD, { turnId: 't2', type: 'start', request: 'x' });
  s = h.reduceBuild(s, { turnId: 't2', type: 'tool-start', callId: 'c2', tool: 'propose_variant', summary: 'Proposing' });
  s = h.reduceBuild(s, { turnId: 't2', type: 'error', message: 'boom' });
  assert.equal(s.phase, 'failed');
});
