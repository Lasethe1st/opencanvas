import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Copy01Icon, Tick02Icon, UserGroupIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useStore } from '../../lib/store';
import {
  createInvite,
  inviteText,
  joinSession,
  kickMember,
  leaveSession,
  parseInvite,
  revokeInvite,
  savedName,
  savedServer,
  startSession,
} from '../../lib/collab';
import type { Participant } from '../../../shared/collab';

const initials = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

/** A person as a coloured circle. */
function Avatar({ p, className }: { p: Pick<Participant, 'name' | 'color'>; className?: string }) {
  return (
    <span
      title={p.name}
      className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-[var(--home-card)]', className)}
      style={{ background: p.color }}
    >
      {initials(p.name)}
    </span>
  );
}

const field =
  'h-9 w-full rounded-[var(--r-lg)] border border-[color:var(--line)] bg-transparent px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30';

/** Top right of the home pane: share this chat, or see who is in it. */
export function HomeCollab({ className }: { className?: string }) {
  const collab = useStore((s) => s.collab);
  const [name, setName] = useState(savedName);
  const [server, setServer] = useState(savedServer);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const on = collab.status === 'host' || collab.status === 'guest';
  const host = collab.status === 'host';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const start = () => void startSession(server, name.trim() || 'Host');
  const join = () => {
    const inv = parseInvite(code, server);
    void joinSession(inv.server, inv.code, name.trim() || 'Guest');
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          data-home-collab=""
          aria-label={on ? 'Shared chat' : 'Share this chat'}
          className={cn('h-9 rounded-[var(--pill)] bg-muted px-3 text-xs font-medium text-foreground hover:bg-secondary [&_svg]:size-4', on && 'gap-0 ps-2', className)}
        >
          {on ? (
            <span className="flex items-center -space-x-1.5">
              {collab.roster.slice(0, 3).map((p) => (
                <Avatar key={p.id} p={p} />
              ))}
              {collab.roster.length > 3 && <span className="ps-3 text-xs tabular-nums text-muted-foreground">+{collab.roster.length - 3}</span>}
            </span>
          ) : (
            <>
              <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />
              Share
            </>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[120] w-[320px] max-w-[calc(100vw-24px)] rounded-3xl border border-[color:var(--line)] bg-popover p-4 text-popover-foreground shadow-[var(--shadow-md)] outline-none"
        >
          {!on ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="m-0 text-sm font-medium">Chat with others</p>
                <p className="m-0 mt-1 text-xs text-muted-foreground">
                  You host it: the AI runs on your computer with your keys, and everyone in the session sees the conversation live.
                </p>
              </div>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={32} />
              <input className={field} value={server} onChange={(e) => setServer(e.target.value)} placeholder="ws://localhost:8787" aria-label="Relay server" spellCheck={false} />
              <Button className="h-9 rounded-[var(--pill)]" onClick={start} disabled={collab.status === 'connecting'}>
                Start a shared chat
              </Button>
              <div className="h-px bg-foreground/[0.08]" />
              <p className="m-0 text-xs text-muted-foreground">Have an invite? Paste it to join someone else’s chat.</p>
              <div className="flex gap-2">
                <input className={field} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite" aria-label="Invite" spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && code.trim() && join()} />
                <Button variant="secondary" className="h-9 shrink-0 rounded-[var(--pill)]" onClick={join} disabled={!code.trim() || collab.status === 'connecting'}>
                  Join
                </Button>
              </div>
              {collab.error && <p className="m-0 text-xs text-destructive">{collab.error}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-sm font-medium">{host ? 'You’re hosting' : 'In a shared chat'}</p>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {collab.roster.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 text-[13px]">
                    <Avatar p={p} className="ring-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {p.name}
                      {p.id === collab.you?.id && <span className="text-muted-foreground"> (you)</span>}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{p.role === 'owner' ? 'Host' : p.role === 'editor' ? 'Can write' : 'View only'}</span>
                    {host && p.id !== collab.you?.id && (
                      <Button variant="ghost" className="size-6 p-0 text-muted-foreground hover:text-foreground [&_svg]:size-3.5" aria-label={`Remove ${p.name}`} onClick={() => kickMember(p.id)}>
                        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {host && (
                <>
                  <div className="h-px bg-foreground/[0.08]" />
                  <div className="flex gap-2">
                    <Button variant="secondary" className="h-8 flex-1 rounded-[var(--pill)] text-xs" onClick={() => createInvite('editor')}>
                      Invite to write
                    </Button>
                    <Button variant="secondary" className="h-8 flex-1 rounded-[var(--pill)] text-xs" onClick={() => createInvite('viewer')}>
                      Invite to watch
                    </Button>
                  </div>
                  {collab.invites.map((i) => (
                    <div key={i.code} className="flex items-center gap-2 rounded-[var(--r-lg)] bg-muted px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[11px]" data-invite={i.code}>{inviteText(i.code)}</div>
                        <div className="text-[11px] text-muted-foreground">{i.role === 'editor' ? 'Can write' : 'View only'}</div>
                      </div>
                      <Button variant="ghost" className="size-7 shrink-0 p-0 [&_svg]:size-4" aria-label="Copy invite" onClick={() => void copy(inviteText(i.code))}>
                        <HugeiconsIcon icon={copied === inviteText(i.code) ? Tick02Icon : Copy01Icon} strokeWidth={2} />
                      </Button>
                      <Button variant="ghost" className="size-7 shrink-0 p-0 [&_svg]:size-4" aria-label="Cancel invite" onClick={() => revokeInvite(i.code)}>
                        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                      </Button>
                    </div>
                  ))}
                </>
              )}
              {collab.error && <p className="m-0 text-xs text-destructive">{collab.error}</p>}
              <Button variant="ghost" className="h-8 rounded-[var(--pill)] text-xs text-destructive hover:text-destructive" onClick={leaveSession}>
                {host ? 'End session' : 'Leave'}
              </Button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
