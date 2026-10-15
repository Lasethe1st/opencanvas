import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const SAVE = {
  id: 'abc123',
  short_id: '997d6DW',
  url: 'https://savee.com/i/997d6DW/',
  name: 'Swiss poster',
  source_url: 'https://example.com/poster',
  media: { type: 'image', width: 1200, height: 900, thumbnail: null, original: null },
  detected_aesthetics: 'swiss',
  colors: [
    { color: '#F24E1E', amount: 0.4 },
    { color: '111111', amount: 0.3 },
  ],
};

/** A small stand-in for savee.com's OAuth server and mcp.savee.com, with knobs for failure cases. */
async function mockSavee(t) {
  const state = {
    log: [],
    registrations: [],
    authorize: null,
    tokenRequests: [],
    revoked: [],
    validTokens: new Set(),
    issued: 0,
    deny: false,
    searchStatus: 200,
    subscriptionLapsed: false,
    refreshFails: false,
    mcpCalls: [],
    challenge: null,
  };
  let base = '';
  const json = (res, status, body, headers = {}) => res.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(body));
  const issue = () => {
    state.issued++;
    const access = `at-${state.issued}`;
    state.validTokens.add(access);
    return { access_token: access, refresh_token: `rt-${state.issued}`, token_type: 'Bearer', expires_in: 3600 };
  };
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const url = new URL(req.url, base);
    state.log.push(`${req.method} ${url.pathname}`);

    if (url.pathname === '/.well-known/oauth-protected-resource') return json(res, 200, { resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['profile:read', 'saves:read', 'boards:read', 'search:read', 'saves:write'] });
    if (url.pathname === '/.well-known/oauth-authorization-server')
      return json(res, 200, {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        registration_endpoint: `${base}/register`,
        revocation_endpoint: `${base}/revoke`,
        code_challenge_methods_supported: ['S256'],
      });
    if (url.pathname === '/register') {
      const reg = JSON.parse(body);
      state.registrations.push(reg);
      return json(res, 201, { client_id: `client-${state.registrations.length}`, redirect_uris: reg.redirect_uris });
    }
    if (url.pathname === '/authorize') {
      state.authorize = Object.fromEntries(url.searchParams);
      state.challenge = url.searchParams.get('code_challenge');
      const back = new URL(url.searchParams.get('redirect_uri'));
      back.searchParams.set('state', url.searchParams.get('state'));
      if (state.deny) back.searchParams.set('error', 'access_denied');
      else back.searchParams.set('code', 'code-xyz');
      return res.writeHead(302, { Location: back.toString() }).end();
    }
    if (url.pathname === '/token') {
      const p = Object.fromEntries(new URLSearchParams(body));
      state.tokenRequests.push(p);
      if (!p.resource) return json(res, 400, { error: 'invalid_target' });
      if (p.grant_type === 'authorization_code') {
        const expected = b64url(createHash('sha256').update(p.code_verifier ?? '').digest());
        if (p.code !== 'code-xyz' || expected !== state.challenge) return json(res, 400, { error: 'invalid_grant' });
        return json(res, 200, issue());
      }
      if (p.grant_type === 'refresh_token') {
        if (state.refreshFails) return json(res, 400, { error: 'invalid_grant' });
        return json(res, 200, issue());
      }
      return json(res, 400, { error: 'unsupported_grant_type' });
    }
    if (url.pathname === '/revoke') {
      state.revoked.push(JSON.parse(body));
      return json(res, 200, {});
    }
    if (url.pathname === '/img/1.jpg') return res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    if (url.pathname === '/mcp') {
      const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
      if (!token || !state.validTokens.has(token)) {
        return res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"` }).end();
      }
      if (state.subscriptionLapsed) return json(res, 402, { error: { message: 'An active subscription with API access is required.' } });
      const msg = JSON.parse(body);
      state.mcpCalls.push(msg);
      const reply = (result) => json(res, 200, { jsonrpc: '2.0', id: msg.id, result });
      const text = (value) => reply({ content: [{ type: 'text', text: JSON.stringify(value) }] });
      if (msg.method === 'tools/list')
        return reply({
          tools: [
            { name: 'search', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' }, cursor: { type: 'string' } } } },
            { name: 'list_boards', inputSchema: { type: 'object', properties: {} } },
            { name: 'list_board_saves', inputSchema: { type: 'object', properties: { board_id: { type: 'string' }, limit: { type: 'number' } } } },
          ],
        });
      const { name, arguments: args } = msg.params;
      if (name === 'get_current_user') return text({ username: 'mira', plan: 'pro' });
      if (name === 'search') {
        if (state.searchStatus === 429) return res.writeHead(429, { 'Retry-After': '120' }).end();
        return text({ data: [{ ...SAVE, media: { ...SAVE.media, thumbnail: `${base}/img/1.jpg` } }], next_cursor: null, has_more: false, echo: args });
      }
      if (name === 'list_boards') return reply({ content: [], structuredContent: { data: [{ id: 'b1', name: 'Posters', save_count: 12 }] } });
      if (name === 'list_board_saves') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify({ data: [SAVE] }) }] } })}\n\n`);
        return res.end();
      }
      return json(res, 200, { jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: `Unknown tool ${name}` } });
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  return { base, state };
}

function memoryStore() {
  const data = new Map();
  return { data, available: () => true, get: (k) => data.get(k) ?? null, set: (k, v) => data.set(k, v), delete: (k) => data.delete(k) };
}

/** A client whose "browser" follows the authorize redirect back to the loopback callback. */
function client(base, store = memoryStore()) {
  const opened = [];
  const c = new h.SaveeClient({
    fetcher: (url, init) => fetch(url, init),
    store,
    mcpUrl: `${base}/mcp`,
    signInTimeoutMs: 5000,
    openExternal: async (url) => {
      opened.push(url);
      const res = await fetch(url);
      await res.text();
    },
  });
  return { c, store, opened };
}

test('sign-in discovers the server, registers, uses PKCE S256 with resource, and stores tokens', async (t) => {
  const { base, state } = await mockSavee(t);
  const { c, store, opened } = client(base);
  assert.equal(c.connected, false);
  const user = await c.connect();
  assert.equal(user, 'mira');
  assert.equal(c.connected, true);
  assert.equal(c.user, 'mira');

  assert.deepEqual(state.log.slice(0, 3), ['POST /mcp', 'GET /.well-known/oauth-protected-resource', 'GET /.well-known/oauth-authorization-server']);
  const reg = state.registrations[0];
  assert.match(reg.redirect_uris[0], /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  assert.equal(reg.token_endpoint_auth_method, 'none');
  assert.equal(opened.length, 1);
  assert.equal(state.authorize.code_challenge_method, 'S256');
  assert.equal(state.authorize.resource, `${base}/mcp`);
  assert.equal(state.authorize.scope, 'profile:read saves:read boards:read search:read', 'write scopes are never requested');
  assert.ok(state.authorize.state.length >= 16);
  assert.equal(state.tokenRequests[0].resource, `${base}/mcp`);
  assert.equal(state.tokenRequests[0].client_id, 'client-1');
  assert.equal(store.get('savee:access'), 'at-1');
  assert.equal(store.get('savee:refresh'), 'rt-1');
});

test('search maps saves to results using the argument names from the tool schema', async (t) => {
  const { base, state } = await mockSavee(t);
  const { c } = client(base);
  await c.connect();
  const results = await c.search('  swiss poster ');
  assert.deepEqual(results, [
    {
      id: 'abc123',
      title: 'Swiss poster',
      url: 'https://savee.com/i/997d6DW/',
      sourceUrl: 'https://example.com/poster',
      imageUrl: `${base}/img/1.jpg`,
      width: 1200,
      height: 900,
      colors: ['#F24E1E', '#111111'],
      tags: ['swiss'],
    },
  ]);
  const call = state.mcpCalls.find((m) => m.params?.name === 'search');
  assert.deepEqual(call.params.arguments, { query: 'swiss poster', limit: 30 });
  await assert.rejects(c.search('a'), /at least 2 characters/);

  const image = await c.image(`${base}/img/1.jpg`);
  assert.equal(image.mimeType, 'image/jpeg');
  await assert.rejects(c.image(`${base}/img/other.jpg`), /didn’t come from Savee/);
});

test('boards come from structured content and board saves from an event stream', async (t) => {
  const { base, state } = await mockSavee(t);
  const { c } = client(base);
  await c.connect();
  assert.deepEqual(await c.boards(), [{ id: 'b1', name: 'Posters', count: 12 }]);
  const items = await c.boardItems('b1');
  assert.equal(items[0].title, 'Swiss poster');
  assert.deepEqual(state.mcpCalls.find((m) => m.params?.name === 'list_board_saves').params.arguments, { board_id: 'b1', limit: 30 });
  assert.deepEqual(state.mcpCalls.find((m) => m.params?.name === 'list_boards').params.arguments, {}, 'unknown optional arguments are left out');
});

test('an expired access token is refreshed once, with the resource, and the call retried', async (t) => {
  const { base, state } = await mockSavee(t);
  const { c, store } = client(base);
  await c.connect();
  state.validTokens.delete('at-1');
  const boards = await c.boards();
  assert.equal(boards.length, 1);
  const refresh = state.tokenRequests.find((p) => p.grant_type === 'refresh_token');
  assert.equal(refresh.refresh_token, 'rt-1');
  assert.equal(refresh.resource, `${base}/mcp`);
  assert.equal(store.get('savee:access'), 'at-2');
});

test('a refresh that fails signs out with a plain message', async (t) => {
  const { base, state } = await mockSavee(t);
  const { c } = client(base);
  await c.connect();
  state.validTokens.clear();
  state.refreshFails = true;
  await assert.rejects(c.boards(), /Connect Savee again/);
  assert.equal(c.connected, false);
});

test('search rate limits say when to retry and explain the weekly budget', async (t) => {
  const { base, state } = await mockSavee(t);
  const { c } = client(base);
  await c.connect();
  state.searchStatus = 429;
  await assert.rejects(c.search('poster'), (err) => {
    assert.equal(err.code, 'rate-limit');
    assert.match(err.message, /in 2 minutes/);
    assert.match(err.message, /200 a week/);
    return true;
  });
});

test('a lapsed subscription is reported plainly', async (t) => {
  const { base, state } = await mockSavee(t);
  const { c } = client(base);
  await c.connect();
  state.subscriptionLapsed = true;
  await assert.rejects(c.boards(), (err) => err.code === 'subscription' && /subscription with API access/.test(err.message));
});

test('declining in the browser cancels the sign-in and stores nothing', async (t) => {
  const { base, state } = await mockSavee(t);
  state.deny = true;
  const { c, store } = client(base);
  await assert.rejects(c.connect(), /didn’t approve/);
  assert.equal(store.data.size, 0);
  assert.equal(c.connecting, false);
});

test('disconnect revokes the refresh token and forgets the sign-in', async (t) => {
  const { base, state } = await mockSavee(t);
  const { c, store } = client(base);
  await c.connect();
  await c.disconnect();
  assert.deepEqual(state.revoked, [{ token: 'rt-1', token_type_hint: 'refresh_token', client_id: 'client-1' }]);
  assert.equal(store.data.size, 0);
  assert.equal(c.connected, false);
});

test('the Savee provider reports its real state and refuses to search until connected', async (t) => {
  const { base } = await mockSavee(t);
  const { c } = client(base);
  h.setProviders([h.saveeProvider(c)]);
  t.after(() => h.setProviders([h.saveeProvider(null)]));
  assert.equal(h.listProviders()[0].status, 'needs-auth');
  await assert.rejects(h.searchProvider('savee', 'poster'), /isn’t connected/);
  const info = await h.connectProvider('savee');
  assert.equal(info.status, 'connected');
  assert.equal(info.account, 'mira');
  assert.equal((await h.searchProvider('savee', 'poster')).length, 1);
  assert.equal((await h.disconnectProvider('savee')).status, 'needs-auth');

  h.setProviders([h.saveeProvider(null)]);
  assert.equal(h.listProviders()[0].status, 'unavailable');
});

test('helpers: PKCE pair and WWW-Authenticate parsing', () => {
  const { verifier, challenge } = h.pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, b64url(createHash('sha256').update(verifier).digest()));
  assert.equal(h.resourceMetadataUrl('Bearer realm="x", resource_metadata="https://mcp.savee.com/.well-known/oauth-protected-resource"'), 'https://mcp.savee.com/.well-known/oauth-protected-resource');
  assert.equal(h.resourceMetadataUrl(null), null);
  assert.equal(h.toResult({ name: 'no id' }), null);
  assert.equal(h.toBoard({ id: 'b', title: 'T' }).name, 'T');
});
