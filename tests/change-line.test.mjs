import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

const home = {
  project: null,
  homeProjectRoot: 'C:/projects/email-collect',
  homeProjectName: 'Email Collect',
  homeActiveChatId: 'chat-1',
};

test('file tools use basename and tense, never a path or a tool name', () => {
  assert.equal(h.describeCall('write_file', { path: 'src/App.tsx' }, []), 'Editing App.tsx');
  assert.equal(h.describeChange('write_file', { path: 'src/App.tsx' }, true).title, 'Edited App.tsx');
  assert.equal(h.describeChange('set_styles', { id: 'src/App.jsx:12:6' }, false).title, 'Restyling CSS');
  assert.equal(h.describeChange('set_styles', { id: 'src/App.jsx:12:6' }, true).title, 'Restyled CSS');
  assert.equal(h.describeChange('set_styles', { path: 'src/open-canvas.css' }, false).title, 'Restyling open-canvas.css');
  assert.equal(h.describeChange('run_audit', {}, false).title, 'Debugging file');
  assert.equal(h.describeChange('run_audit', {}, true).title, 'Debugged file');
  assert.equal(h.describeCall('web_search', { query: 'https://example.com/secret' }, []), 'Browsing');
  assert.equal(h.describeChange('read_file', { path: 'src/App.tsx' }, false), null);
});

test('line counts skip zeros and keep a real +90 −25 edit', () => {
  const keep = 'const keep = true;\n';
  const removed = Array.from({ length: 25 }, (_, i) => `const removed_${i} = ${i};`).join('\n');
  const added = Array.from({ length: 90 }, (_, i) => `const added_${i} = ${i};`).join('\n');
  const delta = h.lineDelta(`${keep}${removed}\n`, `${keep}${added}\n`);
  assert.deepEqual(delta, { added: 90, removed: 25 });
  assert.equal(h.lineDelta('same\n', 'same\n').added, 0);
  assert.equal(h.lineDelta('same\n', 'same\n').removed, 0);
  assert.deepEqual(h.lineDelta('only\n', 'only\nextra\n'), { added: 1, removed: 0 });
  assert.equal(h.withDiff('Created src/App.tsx', { added: 0, removed: 0 }), 'Created src/App.tsx');
  const marked = h.withDiff('Created src/App.tsx', { added: 90, removed: 25, path: 'src/App.tsx' });
  const split = h.splitDiff([{ type: 'text', text: marked }]);
  assert.equal(split.content[0].text, 'Created src/App.tsx');
  assert.deepEqual(split.diff, { added: 90, removed: 25, path: 'src/App.tsx' });
  assert.equal(h.stripDiffMarker([{ type: 'text', text: marked }])[0].text, 'Created src/App.tsx');
});

test('a failed change strips paths and tool names', () => {
  const leaked = h.failedToolTitle('write_file', 'write_file failed on src/App.tsx');
  assert.equal(leaked.includes('src/'), false);
  assert.equal(leaked.includes('write_file'), false);
  assert.match(leaked, /App\.tsx/);
  assert.equal(h.failedToolTitle('write_file', 'The disk is full'), 'Failed: The disk is full');
  const row = h.changePresentation({ tool: 'write_file', summary: 'Editing App.tsx', state: 'running', file: 'src/App.tsx' });
  assert.equal(row.title, 'Editing App.tsx');
  const done = h.changePresentation({ tool: 'write_file', summary: 'Edited App.tsx', state: 'done', file: 'App.tsx' });
  assert.equal(done.title, 'Edited App.tsx');
  const restyle = h.changePresentation({ tool: 'set_styles', summary: 'Styling 3 elements', state: 'done', elementId: 'src/App.jsx:15:8' });
  assert.equal(restyle.title, 'Restyled CSS');
});

test('chat rows keep one file and its counts, and running work is one job per turn', () => {
  const chat = [
    { turnId: 't', type: 'tool-start', callId: 'a', tool: 'write_file', summary: 'Editing App.tsx', file: 'App.tsx', path: 'src/App.tsx' },
    { turnId: 't', type: 'tool-end', callId: 'a', ok: true, summary: 'Edited App.tsx', file: 'App.tsx', added: 90, removed: 25 },
    { turnId: 't', type: 'tool-start', callId: 'b', tool: 'set_styles', summary: 'Restyling CSS', file: 'CSS' },
    { turnId: 't', type: 'tool-end', callId: 'b', ok: true, summary: 'Restyled CSS', file: 'CSS' },
  ].reduce(h.reduceAiChat, []);
  assert.equal(chat.length, 2);
  assert.equal(chat[0].file, 'App.tsx');
  assert.equal(chat[0].added, 90);
  assert.equal(chat[0].removed, 25);
  assert.equal(chat[1].file, 'CSS');
  assert.equal(chat[1].added, undefined);
  assert.equal(h.changePresentation(chat[0]).title, 'Edited App.tsx');
  assert.equal(h.changePresentation(chat[1]).title, 'Restyled CSS');

  let jobs = h.reduceRunningJobs([], { turnId: 't', type: 'start', request: 'Edit App.tsx' }, home);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].projectName, 'Email Collect');
  assert.equal(jobs[0].place, 'home');
  assert.equal(jobs[0].chatId, 'chat-1');
  jobs = h.reduceRunningJobs(jobs, { turnId: 't', type: 'tool-start', callId: 'a', tool: 'write_file', summary: 'Editing App.tsx', file: 'App.tsx' }, home);
  assert.equal(jobs[0].line, 'Editing App.tsx');
  jobs = h.reduceRunningJobs(jobs, { turnId: 't2', type: 'start', request: 'Restyle' }, { ...home, homeProjectName: 'Notes', homeActiveChatId: 'chat-2' });
  assert.equal(jobs.length, 2);
  jobs = h.reduceRunningJobs(jobs, { turnId: 't2', type: 'tool-start', callId: 's', tool: 'set_styles', summary: 'Restyling CSS', file: 'CSS' }, home);
  assert.equal(jobs.find((job) => job.turnId === 't2').line, 'Restyling CSS');
  jobs = h.reduceRunningJobs(jobs, { turnId: 't2', type: 'tool-start', callId: 'w', tool: 'web_search', summary: 'Browsing' }, home);
  assert.equal(jobs.find((job) => job.turnId === 't2').line, 'Browsing…');
  jobs = h.reduceRunningJobs(jobs, { turnId: 't', type: 'done', stopped: false }, home);
  assert.deepEqual(jobs.map((job) => job.turnId), ['t2']);
  jobs = h.reduceRunningJobs(jobs, { turnId: 't2', type: 'tool-start', callId: 'r', tool: 'read_file', summary: 'Reading src/App.tsx' }, home);
  assert.equal(jobs[0].line, 'Browsing…');
});
