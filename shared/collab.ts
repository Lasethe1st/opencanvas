/**
 * Live collaboration: several people, several computers, one chat.
 *
 * The host (the project's owner) runs the AI on their own machine with their own keys. A relay server only passes
 * messages between people — it never sees an API key and never runs a model. Guests join with an invite code that
 * carries a role, send their messages to the host, and receive the host's AI events as they stream.
 */

export type CollabRole = 'owner' | 'editor' | 'viewer';
/** What an invite can grant. The owner role is only ever the host's. */
export type InviteRole = Exclude<CollabRole, 'owner'>;

export interface Participant {
  id: string;
  name: string;
  role: CollabRole;
  /** A hue for the avatar and the name above their messages. */
  color: string;
}

/** Who wrote a message; stored on the chat's user items so a late joiner sees the whole conversation attributed. */
export type Sender = Pick<Participant, 'id' | 'name' | 'color'>;

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  /** Host: mint an invite code for a role. */
  | { t: 'invite'; role: InviteRole }
  /** Host: stop a code from being used again. */
  | { t: 'revoke'; code: string }
  /** Host: remove someone. */
  | { t: 'kick'; id: string }
  /** Guest: a chat message for the host's AI. Viewers are refused by the relay. */
  | { t: 'say'; text: string }
  /** Host: send data to everyone, or to one person when `to` is set. */
  | { t: 'data'; kind: string; data: unknown; to?: string };

export type ServerMsg =
  | { t: 'created'; room: string; you: Participant }
  | { t: 'joined'; room: string; you: Participant; roster: Participant[] }
  | { t: 'invite'; code: string; role: InviteRole }
  | { t: 'roster'; roster: Participant[] }
  /** To the host: a guest said something. */
  | { t: 'say'; from: Participant; text: string }
  /** To the host: someone just joined and needs the chat so far. */
  | { t: 'need-snapshot'; to: Participant }
  /** To a guest: the host's data (AI events, the snapshot). */
  | { t: 'data'; kind: string; data: unknown }
  | { t: 'error'; message: string }
  | { t: 'closed'; reason: string };

export const MAX_SAY_CHARS = 8000;
export const MAX_NAME_CHARS = 32;

/** Hues for people's avatars, handed out in join order. */
export const COLLAB_COLORS = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899'];

export const cleanName = (name: unknown): string =>
  (typeof name === 'string' ? name : '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_CHARS);

/** An invite code is `room.secret`. */
export function splitInvite(code: unknown): { room: string; secret: string } | null {
  if (typeof code !== 'string') return null;
  const m = /^([A-Z0-9]{4,12})\.([A-Za-z0-9_-]{8,64})$/.exec(code.trim());
  return m ? { room: m[1], secret: m[2] } : null;
}
