/**
 * Shared chat from the app's side. One person hosts: their app runs the AI with their own keys and streams every
 * event to the relay. Everyone else is a guest: they send messages to the host and fold the host's events into
 * their own copy of the chat, so all of them watch the same conversation live. The relay is in server/relay.mjs.
 */
import type { AiEvent, AiChatItem } from '../../shared/ai';
import { reduceAiChat } from '../../shared/ai-chat';
import { IDLE_COLLAB, type CollabView } from '../../shared/collab-view';
import type { ClientMsg, InviteRole, Participant, ServerMsg } from '../../shared/collab';
import { getState, setState } from './store';

const SERVER_KEY = 'oc.collab.server';
const NAME_KEY = 'oc.collab.name';
export const DEFAULT_SERVER = 'ws://localhost:8787';

export const savedServer = (): string => {
  try {
    return localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER;
  } catch {
    return DEFAULT_SERVER;
  }
};
export const savedName = (): string => {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
};
const remember = (server: string, name: string) => {
  try {
    localStorage.setItem(SERVER_KEY, server);
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage blocked */
  }
};

let socket: WebSocket | null = null;
/** Set by lib/ai.ts: how the host runs a guest's message through its AI. */
let runGuestMessage: ((text: string, from: Participant) => void) | null = null;
export const onGuestMessage = (fn: typeof runGuestMessage) => void (runGuestMessage = fn);

const view = () => getState().collab;
const patch = (next: Partial<CollabView>) => setState({ collab: { ...view(), ...next } });
const send = (msg: ClientMsg) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(msg));

export const isHost = () => view().status === 'host';
export const isGuest = () => view().status === 'guest';

/** The host's chat as it stands, for someone who has just joined. */
function snapshotFor(to: Participant) {
  const s = getState();
  send({ t: 'data', kind: 'snapshot', to: to.id, data: { chat: s.aiChat, working: !!s.aiTurnId } });
}

/** Host: pass an AI event on to every guest. Called from lib/ai.ts for each event the local AI produces. */
export function broadcastAiEvent(event: AiEvent) {
  if (isHost()) send({ t: 'data', kind: 'ai-event', data: event });
}

function onMessage(msg: ServerMsg) {
  switch (msg.t) {
    case 'created':
      return patch({ status: 'host', room: msg.room, you: msg.you, roster: [msg.you], error: '' });
    case 'joined':
      return patch({ status: 'guest', room: msg.room, you: msg.you, roster: msg.roster, error: '' });
    case 'roster':
      return patch({ roster: msg.roster });
    case 'invite':
      return patch({ invites: [{ code: msg.code, role: msg.role }, ...view().invites] });
    case 'need-snapshot':
      return snapshotFor(msg.to);
    case 'say':
      return runGuestMessage?.(msg.text, msg.from);
    case 'data': {
      if (!isGuest()) return;
      if (msg.kind === 'snapshot') {
        const d = msg.data as { chat?: AiChatItem[]; working?: boolean };
        setState({ aiChat: Array.isArray(d.chat) ? d.chat : [] });
        return patch({ working: !!d.working });
      }
      if (msg.kind === 'ai-event') {
        const event = msg.data as AiEvent;
        setState({ aiChat: reduceAiChat(getState().aiChat, event) });
        if (event.type === 'start') patch({ working: true });
        if (event.type === 'done') patch({ working: false });
      }
      return;
    }
    case 'error':
      return patch({ error: msg.message });
    case 'closed':
      return end(msg.reason);
  }
}

/** Drop the connection and go back to a normal, private chat. */
function end(reason = '') {
  const s = socket;
  socket = null;
  s?.close();
  setState({ collab: { ...IDLE_COLLAB, error: reason } });
}

function connect(server: string, first: ClientMsg): Promise<void> {
  end();
  patch({ status: 'connecting', error: '' });
  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(server);
    } catch {
      end('That server address isn’t valid. It should look like wss://example.com.');
      return resolve();
    }
    socket = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify(first));
      resolve();
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(String(e.data)) as ServerMsg);
      } catch {
        /* a malformed frame is ignored */
      }
    };
    ws.onerror = () => {
      if (socket === ws) end('Couldn’t reach the server. Check the address and that it’s running.');
      resolve();
    };
    ws.onclose = () => {
      if (socket === ws) end(view().status === 'connecting' ? 'Couldn’t reach the server.' : 'The connection to the session was lost.');
    };
  });
}

/** Host a new shared chat. The AI keeps running on this computer. */
export function startSession(server: string, name: string) {
  remember(server.trim(), name.trim());
  return connect(server.trim(), { t: 'create', name });
}

/** Join someone's shared chat with an invite code. */
export function joinSession(server: string, code: string, name: string) {
  remember(server.trim(), name.trim());
  setState({ aiChat: [] });
  return connect(server.trim(), { t: 'join', code: code.trim(), name });
}

export const leaveSession = () => end();
export const createInvite = (role: InviteRole) => send({ t: 'invite', role });
export const revokeInvite = (code: string) => {
  send({ t: 'revoke', code });
  patch({ invites: view().invites.filter((i) => i.code !== code) });
};
export const kickMember = (id: string) => send({ t: 'kick', id });
/** Guest: write in the host's chat. */
export const sayToHost = (text: string) => send({ t: 'say', text });

/** Accepts a bare code, or `server#code` as the host copies it. Returns the server to use and the code. */
export function parseInvite(input: string, fallbackServer: string): { server: string; code: string } {
  const text = input.trim();
  const i = text.lastIndexOf('#');
  return i > 0 ? { server: text.slice(0, i).trim() || fallbackServer, code: text.slice(i + 1).trim() } : { server: fallbackServer, code: text };
}

/** What the host shares: the server and the code together, so a guest only pastes one thing. */
export const inviteText = (code: string) => `${savedServer()}#${code}`;
