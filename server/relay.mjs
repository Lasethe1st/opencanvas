/**
 * Open Canvas collaboration relay.
 *
 *   node server/relay.mjs            (PORT=8787 by default)
 *
 * Rooms live in memory. The host creates one and mints invite codes; guests join with a code. The relay checks roles
 * (a viewer can't send chat), hands guests' messages to the host, and fans the host's data out to everyone. It never
 * touches an AI key: the host's own app runs the model.
 *
 * Put it behind TLS (wss://) anywhere real people connect.
 */
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const COLORS = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899'];
const MAX_SAY = 8000;
const MAX_NAME = 32;
const MAX_MEMBERS = 12;
const GUEST_MSGS_PER_SEC = 20;

const cleanName = (n) => (typeof n === 'string' ? n : '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
const roomId = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
};
const splitInvite = (code) => {
  const m = /^([A-Z0-9]{4,12})\.([A-Za-z0-9_-]{8,64})$/.exec(typeof code === 'string' ? code.trim() : '');
  return m ? { room: m[1], secret: m[2] } : null;
};

export function createRelay({ port = 8787, host = '0.0.0.0', maxRooms = 200, maxPayload = 512 * 1024 } = {}) {
  /** @type {Map<string, {id:string, hostId:string, members:Map<string,{ws:any,p:any,tokens:number}>, invites:Map<string,string>, joined:number}>} */
  const rooms = new Map();
  const wss = new WebSocketServer({ port, host, maxPayload });
  const ready = new Promise((resolve) => wss.once('listening', resolve));
  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const rosterOf = (room) => [...room.members.values()].map((m) => m.p);
  const broadcastRoster = (room) => room.members.forEach((m) => send(m.ws, { t: 'roster', roster: rosterOf(room) }));
  const hostOf = (room) => room.members.get(room.hostId);

  const refill = setInterval(() => rooms.forEach((r) => r.members.forEach((m) => (m.tokens = GUEST_MSGS_PER_SEC))), 1000);
  const beat = setInterval(() => wss.clients.forEach((ws) => (ws.isAlive === false ? ws.terminate() : ((ws.isAlive = false), ws.ping()))), 30000);

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    /** @type {{room:any, id:string}|null} */
    let me = null;

    const leave = (reason = 'left') => {
      if (!me) return;
      const { room, id } = me;
      me = null;
      if (id === room.hostId) {
        room.members.forEach((m, mid) => {
          if (mid !== id) {
            send(m.ws, { t: 'closed', reason: 'The host ended the session.' });
            m.ws.close();
          }
        });
        rooms.delete(room.id);
      } else if (room.members.delete(id)) {
        broadcastRoster(room);
      }
      void reason;
    };

    ws.on('close', () => leave());
    ws.on('error', () => leave());
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return send(ws, { t: 'error', message: 'Bad message.' });
      }
      if (!msg || typeof msg.t !== 'string') return send(ws, { t: 'error', message: 'Bad message.' });

      if (msg.t === 'create') {
        if (me) return send(ws, { t: 'error', message: 'Already in a session.' });
        if (rooms.size >= maxRooms) return send(ws, { t: 'error', message: 'The server is full. Try again later.' });
        const name = cleanName(msg.name) || 'Host';
        let id = roomId();
        while (rooms.has(id)) id = roomId();
        const hostId = randomBytes(6).toString('hex');
        const p = { id: hostId, name, role: 'owner', color: COLORS[0] };
        const room = { id, hostId, members: new Map([[hostId, { ws, p, tokens: Infinity }]]), invites: new Map(), joined: 1 };
        rooms.set(id, room);
        me = { room, id: hostId };
        return send(ws, { t: 'created', room: id, you: p });
      }

      if (msg.t === 'join') {
        if (me) return send(ws, { t: 'error', message: 'Already in a session.' });
        const parts = splitInvite(msg.code);
        const room = parts && rooms.get(parts.room);
        const role = room && room.invites.get(parts.secret);
        if (!room || !role) return send(ws, { t: 'error', message: 'That invite is not valid any more.' });
        if (room.members.size >= MAX_MEMBERS) return send(ws, { t: 'error', message: 'This session is full.' });
        const id = randomBytes(6).toString('hex');
        const p = { id, name: cleanName(msg.name) || 'Guest', role, color: COLORS[room.joined % COLORS.length] };
        room.joined += 1;
        room.members.set(id, { ws, p, tokens: GUEST_MSGS_PER_SEC });
        me = { room, id };
        send(ws, { t: 'joined', room: room.id, you: p, roster: rosterOf(room) });
        broadcastRoster(room);
        const h = hostOf(room);
        if (h) send(h.ws, { t: 'need-snapshot', to: p });
        return;
      }

      if (!me) return send(ws, { t: 'error', message: 'Join a session first.' });
      const { room, id } = me;
      const self = room.members.get(id);
      const isHost = id === room.hostId;

      switch (msg.t) {
        case 'invite': {
          if (!isHost) return send(ws, { t: 'error', message: 'Only the host can invite people.' });
          if (msg.role !== 'editor' && msg.role !== 'viewer') return send(ws, { t: 'error', message: 'Unknown role.' });
          const secret = randomBytes(12).toString('base64url');
          room.invites.set(secret, msg.role);
          return send(ws, { t: 'invite', code: `${room.id}.${secret}`, role: msg.role });
        }
        case 'revoke': {
          if (!isHost) return;
          const parts = splitInvite(msg.code);
          if (parts && parts.room === room.id) room.invites.delete(parts.secret);
          return;
        }
        case 'kick': {
          if (!isHost || msg.id === id) return;
          const target = room.members.get(msg.id);
          if (!target) return;
          send(target.ws, { t: 'closed', reason: 'The host removed you from the session.' });
          room.members.delete(msg.id);
          target.ws.close();
          return broadcastRoster(room);
        }
        case 'say': {
          if (isHost) return;
          if (self.tokens-- <= 0) return send(ws, { t: 'error', message: 'Slow down a little.' });
          if (self.p.role !== 'editor') return send(ws, { t: 'error', message: 'You can read this chat but not write in it.' });
          const text = typeof msg.text === 'string' ? msg.text.trim() : '';
          if (!text) return;
          if (text.length > MAX_SAY) return send(ws, { t: 'error', message: 'That message is too long.' });
          const h = hostOf(room);
          return h && send(h.ws, { t: 'say', from: self.p, text });
        }
        case 'data': {
          if (!isHost || typeof msg.kind !== 'string') return;
          const out = { t: 'data', kind: msg.kind, data: msg.data };
          if (typeof msg.to === 'string') {
            const target = room.members.get(msg.to);
            return target && send(target.ws, out);
          }
          return room.members.forEach((m, mid) => mid !== id && send(m.ws, out));
        }
        default:
          return send(ws, { t: 'error', message: 'Unknown message.' });
      }
    });
  });

  return {
    /** Resolves once the server is accepting connections (the port is known from then on). */
    ready,
    get port() {
      return wss.address().port;
    },
    rooms: () => rooms.size,
    close: () =>
      new Promise((resolve) => {
        clearInterval(refill);
        clearInterval(beat);
        wss.clients.forEach((c) => c.terminate());
        wss.close(() => resolve(undefined));
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const relay = createRelay({ port: Number(process.env.PORT) || 8787 });
  await relay.ready;
  console.log(`Open Canvas relay listening on :${relay.port}`);
}
