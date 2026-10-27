import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

const KEY = 'sk-test-0123456789abcdefSECRET';
const enc = new TextEncoder();

/** A Response whose body arrives in the given chunks, to exercise split events. */
function streamResponse(chunks, init = {}) {
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' }, ...init });
}

const sse = (objects) => objects.map((o) => `data: ${typeof o === 'string' ? o : JSON.stringify(o)}\n\n`).join('');

/** Splits text into pieces of `size` characters, so JSON and events break mid-way. */
const pieces = (text, size = 7) => text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g'));

async function collect(gen) {
  const out = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

/** Local HTTP server that answers each request with the next scripted handler. */
async function mockServer(t, handlers) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    requests.push({ method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
    const handler = handlers.shift();
    if (!handler) {
      res.writeHead(500).end('no more scripted responses');
      return;
    }
    await handler(req, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

const writeSse = (events, size = 9) => async (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const p of pieces(events, size)) {
    res.write(p);
    await new Promise((r) => setImmediate(r));
  }
  res.end();
};

/* ---------- SSE ---------- */

test('readSse handles CRLF, comments, multi-line data and events split across chunks', async () => {
  const text = ': keep-alive\r\nevent: delta\r\ndata: {"a":\r\ndata: 1}\r\n\r\ndata: second\n\ndata: tail-without-blank-line';
  const events = await collect(h.readSse(streamResponse(pieces(text, 5)).body));
  assert.deepEqual(events, [
    { event: 'delta', data: '{"a":\n1}' },
    { event: 'message', data: 'second' },
    { event: 'message', data: 'tail-without-blank-line' },
  ]);
});

/* ---------- Provider adapters ---------- */

test('Anthropic stream: text deltas and a tool call whose JSON arrives in pieces', async (t) => {
  const events = sse([
    { type: 'message_start', message: { id: 'm1' } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Making it ' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'blue.' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'set_styles', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"ids":["src/App.jsx:' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '3:5"],"styles":{"color"' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: ':"blue"}}' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'message_stop' },
  ]);
  const server = await mockServer(t, [writeSse(events)]);
  let streamed = '';
  const res = await h.streamChat(
    {
      settings: { provider: 'anthropic', model: 'claude-test', baseUrl: server.url },
      key: KEY,
      system: 'sys',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Make the title blue' }] }],
      tools: [{ name: 'set_styles', description: 'd', inputSchema: { type: 'object' } }],
      onText: (d) => (streamed += d),
    },
    fetch,
  );
  assert.equal(streamed, 'Making it blue.');
  assert.equal(res.text, 'Making it blue.');
  assert.deepEqual(res.toolCalls, [{ id: 'tu_1', name: 'set_styles', args: { ids: ['src/App.jsx:3:5'], styles: { color: 'blue' } } }]);
  const req = server.requests[0];
  assert.equal(req.url, '/v1/messages');
  assert.equal(req.headers['x-api-key'], KEY);
  assert.equal(req.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.body.system, 'sys');
  assert.equal(req.body.stream, true);
  assert.equal(req.body.tools[0].input_schema.type, 'object');
});

test('OpenAI-compatible stream: interleaved tool calls accumulate by index', async (t) => {
  const chunk = (delta, finish = null) => ({ choices: [{ index: 0, delta, finish_reason: finish }] });
  const events = sse([
    chunk({ role: 'assistant', content: 'On it.' }),
    chunk({ tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'set_text', arguments: '' } }] }),
    chunk({ tool_calls: [{ index: 1, id: 'call_b', type: 'function', function: { name: 'set_styles', arguments: '{"ids":["x' } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: '{"id":"a:1:1",' } }] }),
    chunk({ tool_calls: [{ index: 1, function: { arguments: '"],"styles":{}}' } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: '"text":"Hi"}' } }] }),
    chunk({}, 'tool_calls'),
    '[DONE]',
  ]);
  const server = await mockServer(t, [writeSse(events, 13)]);
  const res = await h.streamChat(
    { settings: { provider: 'openai', model: 'gpt-test', baseUrl: `${server.url}/v1` }, key: KEY, system: 'sys', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: [] },
    fetch,
  );
  assert.equal(res.text, 'On it.');
  assert.deepEqual(
    res.toolCalls.map((c) => [c.id, c.name, c.args]),
    [
      ['call_a', 'set_text', { id: 'a:1:1', text: 'Hi' }],
      ['call_b', 'set_styles', { ids: ['x'], styles: {} }],
    ],
  );
  const req = server.requests[0];
  assert.equal(req.url, '/v1/chat/completions');
  assert.equal(req.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(req.body.messages[0], { role: 'system', content: 'sys' });
});

test('provider errors are readable and never contain the key', async (t) => {
  const server = await mockServer(t, [
    (_req, res) => res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}` } })),
  ]);
  await assert.rejects(
    h.streamChat({ settings: { provider: 'openai', model: 'm', baseUrl: server.url }, key: KEY, system: '', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], tools: [] }, fetch),
    (err) => {
      const shown = h.redact(err.message, [KEY]);
      assert.doesNotMatch(shown, /0123456789abcdef/);
      assert.match(shown, /key/i);
      return true;
    },
  );
});

test('a local server that is not running gets a "start it" message', async () => {
  await assert.rejects(
    h.streamChat({ settings: { provider: 'ollama', model: 'llama', baseUrl: 'http://127.0.0.1:9/v1' }, key: null, system: '', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], tools: [] }, fetch),
    /Ollama/,
  );
});

test('listModels reads OpenAI-compatible /models', async (t) => {
  const server = await mockServer(t, [(_req, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'b-model' }, { id: 'a-model' }] }))]);
  const models = await h.listModels({ provider: 'lmstudio', model: '', baseUrl: `${server.url}/v1` }, null, fetch);
  assert.deepEqual(models.map((m) => m.id).sort(), ['a-model', 'b-model']);
  assert.equal(server.requests[0].url, '/v1/models');
});

test('Gemini uses the Google OpenAI-compatible model endpoint', async (t) => {
  const server = await mockServer(t, [(_req, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'gemini-2.5-flash' }] }))]);
  const models = await h.listModels(
    { provider: 'gemini', model: '', baseUrl: `${server.url}/v1beta/openai` },
    KEY,
    fetch,
  );
  assert.deepEqual(models.map((m) => m.id), ['gemini-2.5-flash']);
  assert.equal(server.requests[0].url, '/v1beta/openai/models');
  assert.equal(server.requests[0].headers.authorization, `Bearer ${KEY}`);
});

/* ---------- Agent loop ---------- */

const openaiTurn = ({ text = '', calls = [] }) => {
  const chunk = (delta, finish = null) => ({ choices: [{ index: 0, delta, finish_reason: finish }] });
  const events = [];
  if (text) events.push(chunk({ content: text }));
  calls.forEach((c, i) => events.push(chunk({ tool_calls: [{ index: i, id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }] })));
  events.push(chunk({}, calls.length ? 'tool_calls' : 'stop'), '[DONE]');
  return sse(events);
};

/** An agent wired to scripted model replies and fake tools. */
function makeAgent(replies, tools = [], extra = {}) {
  const events = [];
  const bodies = [];
  const waiters = [];
  const fetcher = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    const next = replies.shift();
    if (!next) throw new Error('no more scripted replies');
    if (typeof next === 'function') return next(init);
    return streamResponse(pieces(next, 11));
  };
  const agent = new h.AiAgent({
    fetcher,
    settings: () => ({ provider: 'openai', model: 'test-model', baseUrl: 'https://api.example.test/v1' }),
    key: () => KEY,
    secrets: () => [KEY],
    tools: () => tools,
    projectContext: () => '# Open project: Test',
    emit: (ev) => {
      events.push(ev);
      for (const w of [...waiters]) if (w.match(ev)) waiters.splice(waiters.indexOf(w), 1) && w.resolve(ev);
    },
    ...extra,
  });
  const waitFor = (match) => {
    const found = events.find(match);
    return found ? Promise.resolve(found) : new Promise((resolve) => waiters.push({ match, resolve }));
  };
  return { agent, events, bodies, waitFor };
}

const tool = (name, run) => ({ name, title: name, description: name, inputSchema: { type: 'object', properties: {} }, run });

test('agent runs a tool call, feeds the result back and finishes with text', async () => {
  const ran = [];
  const tools = [
    tool('set_styles', async (args) => {
      ran.push(args);
      return [{ type: 'text', text: 'Styled 1 element.' }];
    }),
    tool('undo', async () => [{ type: 'text', text: 'should not be offered' }]),
  ];
  const { agent, events, bodies, waitFor } = makeAgent(
    [openaiTurn({ text: 'Making it blue.', calls: [{ id: 'c1', name: 'set_styles', args: { ids: ['src/App.jsx:3:5'], styles: { color: 'blue' } } }] }), openaiTurn({ text: 'Done: the title is blue.' })],
    tools,
  );
  const turnId = agent.send('Make the title blue', { selection: { id: 'src/App.jsx:3:5', name: 'h1', tag: 'h1' }, page: { name: 'Home', path: '/' }, frameWidth: 1440 });
  const done = await waitFor((e) => e.type === 'done');
  assert.equal(done.stopped, false);
  assert.deepEqual(ran, [{ ids: ['src/App.jsx:3:5'], styles: { color: 'blue' } }]);
  assert.ok(events.every((e) => e.turnId === turnId));
  const end = events.find((e) => e.type === 'tool-end');
  assert.equal(end.ok, true);
  assert.equal(end.elementId, 'src/App.jsx:3:5');

  assert.ok(!bodies[0].tools.some((t) => t.function.name === 'undo'), 'undo is not offered to the in-app AI');
  assert.ok(bodies[0].tools.some((t) => t.function.name === 'ask_user'));
  assert.match(bodies[0].messages[1].content, /Selected element: <h1>/);
  assert.match(bodies[0].messages[1].content, /Make the title blue$/);
  const toolMsg = bodies[1].messages.find((m) => m.role === 'tool');
  assert.equal(toolMsg.tool_call_id, 'c1');
  assert.equal(toolMsg.content, 'Styled 1 element.');

  const chat = events.reduce(h.reduceAiChat, []);
  assert.deepEqual(
    chat.map((i) => i.kind),
    ['user', 'assistant', 'tool', 'assistant'],
  );
  assert.equal(chat[2].state, 'done');
  assert.equal(chat[3].text, 'Done: the title is blue.');
});

test('ask_user pauses the turn until the user answers', async () => {
  const { agent, bodies, waitFor } = makeAgent([
    openaiTurn({ calls: [{ id: 'q1', name: 'ask_user', args: { question: 'How many plans?', options: ['Two', 'Three'] } }] }),
    openaiTurn({ text: 'Three plans it is.' }),
  ]);
  agent.send('Add pricing');
  const asked = await waitFor((e) => e.type === 'question');
  assert.deepEqual(asked.question.options, ['Two', 'Three']);
  assert.equal(asked.question.allowText, true);
  assert.equal(bodies.length, 1, 'the model is not called again until the answer arrives');
  agent.answer(asked.question.id, 'Three');
  await waitFor((e) => e.type === 'done');
  const toolMsg = bodies[1].messages.find((m) => m.role === 'tool');
  assert.equal(toolMsg.content, 'The user answered: Three');
});

test('gated tools ask for permission; declining skips the tool, allowing runs it', async () => {
  let commits = 0;
  const tools = [
    tool('git_commit', async () => {
      commits++;
      return [{ type: 'text', text: 'Committed.' }];
    }),
  ];
  const call = { id: 'g1', name: 'git_commit', args: { message: 'Pricing section' } };
  const { agent, bodies, waitFor, events } = makeAgent([openaiTurn({ calls: [call] }), openaiTurn({ text: 'Okay, not committed.' }), openaiTurn({ calls: [{ ...call, id: 'g2' }] }), openaiTurn({ text: 'Committed.' })], tools);

  agent.send('Commit this');
  const first = await waitFor((e) => e.type === 'approval');
  assert.equal(first.approval.tool, 'git_commit');
  assert.match(first.approval.summary, /Pricing section/);
  agent.approve(first.approval.id, false);
  await waitFor((e) => e.type === 'done');
  assert.equal(commits, 0);
  assert.match(bodies[1].messages.find((m) => m.role === 'tool').content, /^Error: The user declined/);

  events.length = 0;
  agent.send('Commit it after all');
  const second = await waitFor((e) => e.type === 'approval');
  agent.approve(second.approval.id, true);
  await waitFor((e) => e.type === 'done');
  assert.equal(commits, 1);
});

test('run_command is only offered with a terminal, and always asks first', async () => {
  const runs = [];
  let outcome = { sessionId: 's1', title: 'AI · npm', exitCode: 0, status: 'exited', output: 'x'.repeat(20_000) + `\nkey ${KEY}\nbuilt ok` };
  const runCommand = async (command, opts) => {
    runs.push({ command, ...opts });
    return outcome;
  };
  const call = (id, args) => ({ id, name: 'run_command', args });
  const { agent, bodies, waitFor, events } = makeAgent(
    [
      openaiTurn({ calls: [call('r1', { command: 'rm -rf src', reason: 'Clean up' })] }),
      openaiTurn({ text: 'Okay, I will not.' }),
      openaiTurn({ calls: [call('r2', { command: 'npm run build', reason: 'Check the build' })] }),
      openaiTurn({ text: 'The build passed.' }),
      openaiTurn({ calls: [call('r3', { command: 'npm test', reason: 'Run tests' })] }),
      openaiTurn({ text: 'Tests took too long.' }),
    ],
    [],
    { runCommand, commandCwd: () => 'C:/work/site' },
  );

  agent.send('Clean the project');
  const first = await waitFor((e) => e.type === 'approval');
  assert.ok(bodies[0].tools.some((t) => t.function.name === 'run_command'));
  assert.equal(first.approval.command, 'rm -rf src');
  assert.equal(first.approval.cwd, 'C:/work/site');
  assert.match(first.approval.summary, /Clean up/);
  agent.approve(first.approval.id, false);
  await waitFor((e) => e.type === 'done');
  assert.equal(runs.length, 0, 'declined commands never run');
  assert.match(bodies[1].messages.find((m) => m.role === 'tool').content, /declined/);

  events.length = 0;
  agent.send('Build it');
  agent.approve((await waitFor((e) => e.type === 'approval')).approval.id, true);
  await waitFor((e) => e.type === 'done');
  assert.deepEqual(runs.map((r) => [r.command, r.longRunning]), [['npm run build', false]]);
  const built = bodies[3].messages.filter((m) => m.role === 'tool').at(-1).content;
  assert.match(built, /^Exited with code 0\./);
  assert.match(built, /built ok$/);
  assert.ok(!built.includes(KEY), 'secrets are removed from command output');
  assert.ok(built.length < h.COMMAND_OUTPUT_LIMIT + 200, 'only the tail of long output goes back to the model');

  events.length = 0;
  outcome = { sessionId: 's2', title: 'AI · npm', exitCode: null, status: 'timed-out', output: 'still going' };
  agent.send('Test it');
  agent.approve((await waitFor((e) => e.type === 'approval')).approval.id, true);
  await waitFor((e) => e.type === 'done');
  const end = events.find((e) => e.type === 'tool-end');
  assert.equal(end.ok, false);
  assert.match(end.summary, /2 minutes/);
  assert.match(bodies[5].messages.filter((m) => m.role === 'tool').at(-1).content, /Stopped after 2 minutes/);

  const other = makeAgent([openaiTurn({ text: 'Hi.' })]);
  other.agent.send('Hello');
  await other.waitFor((e) => e.type === 'done');
  assert.ok(!other.bodies[0].tools.some((t) => t.function.name === 'run_command'), 'not offered without a terminal');
});

test('Stop ends a turn waiting on a question, and reset forgets the conversation', async () => {
  const { agent, bodies, waitFor, events } = makeAgent([openaiTurn({ calls: [{ id: 'q', name: 'ask_user', args: { question: 'Which?', options: ['A', 'B'] } }] }), openaiTurn({ text: 'Fresh start.' })]);
  agent.send('Do something');
  await waitFor((e) => e.type === 'question');
  agent.cancel();
  const done = await waitFor((e) => e.type === 'done');
  assert.equal(done.stopped, true);
  assert.equal(agent.busy, false);
  const chat = events.reduce(h.reduceAiChat, []);
  assert.equal(chat.find((i) => i.kind === 'question').answer, 'Stopped');

  agent.reset();
  events.length = 0;
  agent.send('New request');
  await waitFor((e) => e.type === 'done');
  assert.equal(bodies[1].messages.filter((m) => m.role === 'user').length, 1, 'history was cleared');
});

test('a second request while one is running is refused by the editor, not the agent', async () => {
  // The agent accepts only one turn; follow-ups are queued in the renderer (sendToAi).
  let release;
  const gate = new Promise((r) => (release = r));
  const { agent, waitFor } = makeAgent([async () => (await gate, streamResponse([openaiTurn({ text: 'ok' })]))]);
  const first = agent.send('First');
  assert.equal(typeof first, 'string');
  assert.equal(agent.busy, true);
  release();
  await waitFor((e) => e.type === 'done');
});

test('model errors reach the chat with secrets removed', async () => {
  const { agent, waitFor } = makeAgent([async () => new Response(JSON.stringify({ error: { message: `bad key ${KEY}` } }), { status: 401, headers: { 'content-type': 'application/json' } })]);
  agent.send('Hi');
  const err = await waitFor((e) => e.type === 'error');
  assert.doesNotMatch(err.message, /0123456789abcdef/);
  await waitFor((e) => e.type === 'done');
});

/* ---------- Undo grouping ---------- */

test('mergeChanges keeps the first before and the last after for each file', () => {
  const merged = h.mergeChanges(
    [
      { path: 'a.css', before: 'a0', after: 'a1' },
      { path: 'b.jsx', before: 'b0', after: 'b1' },
    ],
    [
      { path: 'a.css', before: 'a1', after: 'a2' },
      { path: 'c.jsx', before: null, after: 'c1' },
    ],
  );
  assert.deepEqual(merged, [
    { path: 'a.css', before: 'a0', after: 'a2' },
    { path: 'b.jsx', before: 'b0', after: 'b1' },
    { path: 'c.jsx', before: null, after: 'c1' },
  ]);
});

test('one AI reply with several edits reverts in one step', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-ai-undo-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'a.css'), 'a2');
  const merged = h.mergeChanges([{ path: 'a.css', before: 'a0', after: 'a1' }], [{ path: 'a.css', before: 'a1', after: 'a2' }]);
  h.revertChanges(root, merged, 'undo');
  assert.equal(fs.readFileSync(path.join(root, 'a.css'), 'utf8'), 'a0');
});

/* ---------- Keys and settings ---------- */

const fakeCipher = (available = true) => ({
  available: () => available,
  encrypt: (s) => Buffer.from(`enc:${Buffer.from(s).toString('hex')}`),
  decrypt: (b) => Buffer.from(b.toString().slice(4), 'hex').toString(),
});

test('SecretStore keeps keys encrypted on disk and lists them for redaction', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-secrets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'secrets.json');
  const store = new h.SecretStore(file, fakeCipher());
  store.set(h.aiKeyName('openai'), KEY);
  assert.equal(store.has('ai:openai'), true);
  assert.equal(store.get('ai:openai'), KEY);
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /0123456789abcdef/);
  assert.ok(new h.SecretStore(file, fakeCipher()).secrets().includes(KEY));
  store.delete('ai:openai');
  assert.equal(store.has('ai:openai'), false);

  const locked = new h.SecretStore(path.join(dir, 'other.json'), fakeCipher(false));
  assert.throws(() => locked.set('ai:openai', KEY), /keyring|secure/i);
});

test('redact removes known secrets and key-shaped strings', () => {
  const out = h.redact(`failed with ${KEY} and Bearer abcdefghijklmnop1234 and "access_token": "zzzzzzzzzzzz" and custom-secret-value`, ['custom-secret-value']);
  assert.doesNotMatch(out, /0123456789abcdef|abcdefghijklmnop1234|zzzzzzzzzzzz|custom-secret-value/);
});

test('AI status reasons and base URL validation', () => {
  assert.match(h.aiNotReadyReason({ provider: 'anthropic', model: 'x', baseUrl: 'https://api.anthropic.com' }, false), /Anthropic API key/);
  assert.match(h.aiNotReadyReason({ provider: 'ollama', model: '', baseUrl: 'http://localhost:11434/v1' }, false), /Choose a model/);
  assert.equal(h.aiNotReadyReason({ provider: 'ollama', model: 'llama3.1', baseUrl: 'http://localhost:11434/v1' }, false), null);
  assert.match(h.aiNotReadyReason({ provider: 'custom', model: 'm', baseUrl: '' }, false), /server URL/);

  assert.equal(h.validateBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1');
  assert.equal(h.validateBaseUrl('http://127.0.0.1:1234/v1'), 'http://127.0.0.1:1234/v1');
  assert.throws(() => h.validateBaseUrl('http://example.com/v1'), /https/);
  assert.throws(() => h.validateBaseUrl('https://user:pass@example.com'), /key field/);
  assert.throws(() => h.validateBaseUrl('not a url'), /full URL/);
  assert.equal(h.normalizeAiSettings({ provider: 'nope', baseUrl: 'http://evil.example' }).provider, 'anthropic');
  assert.equal(h.normalizeAiSettings({ provider: 'openai', baseUrl: 'http://evil.example' }).baseUrl, 'https://api.openai.com/v1');
});

test('reduceAiChat ignores whitespace-only text and marks unfinished tools when stopped', () => {
  const t = 'turn';
  const chat = [
    { turnId: t, type: 'start', request: 'Go' },
    { turnId: t, type: 'text', delta: '\n\n' },
    { turnId: t, type: 'tool-start', callId: 'c', tool: 'set_styles', summary: 'Styling 1 element' },
    { turnId: t, type: 'done', stopped: true },
  ].reduce(h.reduceAiChat, []);
  assert.deepEqual(
    chat.map((i) => i.kind),
    ['user', 'tool'],
  );
  assert.equal(chat[1].state, 'failed');
});
