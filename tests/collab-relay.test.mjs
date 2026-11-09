// Three people on one relay at once: a host and two editors, plus a viewer who may read but not write.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../server/relay.mjs';

const open = (port) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox = [];
    const waiters = [];
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      const i = waiters.findIndex((w) => w.pred(msg));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else inbox.push(msg);
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        ws,
        send: (m) => ws.send(JSON.stringify(m)),
        next: (pred, ms = 2000) => {
          const i = inbox.findIndex(pred);
          if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error('timed out waiting for a message')), ms);
            waiters.push({ pred, resolve: (m) => (clearTimeout(timer), res(m)) });
          });
        },
        close: () => ws.close(),
      });
  });
const t = (type) => (m) => m.t === type;

test('host, two editors and a viewer share one chat', async () => {
  const relay = createRelay({ port: 0, host: '127.0.0.1' });
  await relay.ready;
  const clients = [];
  try {
    const host = await open(relay.port);
    clients.push(host);
    host.send({ t: 'create', name: 'Host' });
    const created = await host.next(t('created'));
    assert.equal(created.you.role, 'owner');

    host.send({ t: 'invite', role: 'editor' });
    const editorCode = (await host.next(t('invite'))).code;
    host.send({ t: 'invite', role: 'viewer' });
    const viewerCode = (await host.next(t('invite'))).code;

    const ada = await open(relay.port);
    const ben = await open(relay.port);
    const vic = await open(relay.port);
    clients.push(ada, ben, vic);
    ada.send({ t: 'join', code: editorCode, name: 'Ada' });
    ben.send({ t: 'join', code: editorCode, name: 'Ben' });
    vic.send({ t: 'join', code: viewerCode, name: 'Vic' });
    const joined = await Promise.all([ada, ben, vic].map((c) => c.next(t('joined'))));
    assert.deepEqual(joined.map((j) => j.you.role), ['editor', 'editor', 'viewer']);
    assert.equal(new Set(joined.map((j) => j.you.color)).size, 3, 'everyone gets their own colour');

    // The host is told about each newcomer so it can send the chat so far.
    const snaps = [await host.next(t('need-snapshot')), await host.next(t('need-snapshot')), await host.next(t('need-snapshot'))];
    assert.deepEqual(snaps.map((s) => s.to.name).sort(), ['Ada', 'Ben', 'Vic']);

    // Ada and Ben type at the same moment: the host receives both, each attributed.
    ada.send({ t: 'say', text: 'make the hero bigger' });
    ben.send({ t: 'say', text: 'use a serif heading' });
    const said = [await host.next(t('say')), await host.next(t('say'))];
    assert.deepEqual(said.map((s) => `${s.from.name}:${s.text}`).sort(), ['Ada:make the hero bigger', 'Ben:use a serif heading']);

    // The host streams one AI event; every guest gets it, the host does not hear itself.
    host.send({ t: 'data', kind: 'ai-event', data: { type: 'text', delta: 'On it.' } });
    for (const c of [ada, ben, vic]) assert.equal((await c.next(t('data'))).data.delta, 'On it.');

    // A viewer may read but not write.
    vic.send({ t: 'say', text: 'hello?' });
    assert.match((await vic.next(t('error'))).message, /not write/);

    // A guest can't impersonate the host.
    ada.send({ t: 'data', kind: 'ai-event', data: { type: 'text', delta: 'fake' } });
    ada.send({ t: 'invite', role: 'editor' });
    assert.match((await ada.next(t('error'))).message, /Only the host/);

    // The roster follows people leaving, and the host can remove someone.
    ben.close();
    const roster = await host.next((m) => m.t === 'roster' && m.roster.length === 3 && !m.roster.some((p) => p.name === 'Ben'));
    assert.deepEqual(roster.roster.map((p) => p.name).sort(), ['Ada', 'Host', 'Vic']);
    host.send({ t: 'kick', id: joined[2].you.id });
    assert.match((await vic.next(t('closed'))).reason, /removed/);

    // Ending the session closes it for everyone left.
    host.close();
    assert.match((await ada.next(t('closed'))).reason, /ended/);
  } finally {
    clients.forEach((c) => c.close());
    await relay.close();
  }
});

test('an invite stops working once the session is gone, and bad codes are refused', async () => {
  const relay = createRelay({ port: 0, host: '127.0.0.1' });
  await relay.ready;
  const a = await open(relay.port);
  try {
    a.send({ t: 'join', code: 'NOPE.notarealsecret1', name: 'Eve' });
    assert.match((await a.next(t('error'))).message, /not valid/);
  } finally {
    a.close();
    await relay.close();
  }
});
