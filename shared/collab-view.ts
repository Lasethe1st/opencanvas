import type { InviteRole, Participant } from './collab';

/** What the app shows about the shared session it is in. */
export interface CollabView {
  /** `host` runs the AI here; `guest` writes to the host's chat. */
  status: 'off' | 'connecting' | 'host' | 'guest';
  room: string;
  you: Participant | null;
  roster: Participant[];
  /** Invite codes this host has made, newest first. */
  invites: { code: string; role: InviteRole }[];
  /** Whether the host's AI is working on a message right now (guests can't see aiTurnId). */
  working: boolean;
  /** Last problem to show, such as a bad invite or the host leaving. */
  error: string;
}

export const IDLE_COLLAB: CollabView = { status: 'off', room: '', you: null, roster: [], invites: [], working: false, error: '' };
