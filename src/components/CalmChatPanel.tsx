import { useCallback, useEffect, useMemo, useRef } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, MessageAdd01Icon } from '@hugeicons/core-free-icons';
import { api } from '../lib/api';
import { newAiChat, openAiSettings, sendToAi, stopAi } from '../lib/ai';
import { getState, setState, useStore } from '../lib/store';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HomeChat, typedText } from './home/HomeChat';
import { HomePrompt, type MentionOption } from './home/HomePrompt';
import { HomeActionPills } from './home/HomeActionPills';
import { HomeComposerExtras } from './home/HomeComposerExtras';
import { mentionables, referencesIn } from './assistant-shapes';
import { InputPanel } from './Dock';

export const CALM_CHAT_WIDTH = 320;

/** Canvas @: this page's layers and the project's pages, in the home picker. The label carries the @ so the name reads as a mention. */
function useCanvasMentions(): MentionOption[] {
  const tree = useStore((s) => s.domTree);
  const pages = useStore((s) => s.projectConfig?.pages);
  return useMemo(() => {
    const seen = new Set<string>();
    return mentionables()
      .filter((m) => !!m.name && !seen.has(`${m.kind}:${m.name}`) && !!seen.add(`${m.kind}:${m.name}`))
      .map((m): MentionOption => ({ id: `${m.kind}:${m.id ?? m.name}`, label: `@${m.name}`, detail: m.kind === 'page' ? 'Page' : `<${m.tag ?? 'div'}>`, kind: 'file' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, pages]);
}

/**
 * The easy canvas's conversation with the AI, laid out like an active chat on the home page: the same thread, then the same
 * composer card. A docked column on the page background; the canvas becomes the inset card beside it.
 */
function ChatBody() {
  const aiChat = useStore((s) => s.aiChat);
  const aiReady = useStore((s) => !!s.aiStatus?.ready);
  const aiTurnId = useStore((s) => s.aiTurnId);
  const draft = useStore((s) => s.dockDraft);
  const mentions = useCanvasMentions();
  const hasThread = aiChat.length > 0;
  const logRef = useRef<HTMLDivElement>(null);

  // Keep the newest text in view while the AI writes, unless you've scrolled up to read.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    let pinned = true;
    const onScroll = () => {
      pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    };
    const follow = () => {
      if (pinned) log.scrollTop = log.scrollHeight;
    };
    follow();
    log.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(follow);
    for (const child of log.children) ro.observe(child);
    const mo = new MutationObserver(() => {
      for (const child of log.children) ro.observe(child);
      follow();
    });
    mo.observe(log, { childList: true, subtree: true, characterData: true });
    return () => {
      log.removeEventListener('scroll', onScroll);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  // Your sent messages, newest first, for the Up arrow.
  const history = useMemo(() => {
    const seen = new Set<string>();
    return [...aiChat]
      .reverse()
      .flatMap((i) => (i.kind === 'user' && i.text ? [typedText(i.text).trim()] : []))
      .filter((t) => t && !seen.has(t) && !!seen.add(t))
      .slice(0, 50);
  }, [aiChat]);

  const send = useCallback(async () => {
    const text = getState().dockDraft.trim();
    if (!text || getState().aiTurnId) return;
    const references = referencesIn(text).map((r) => ({ kind: r.kind, name: r.name, id: r.id, path: r.path }));
    if (await sendToAi(text, { references })) {
      if (getState().dockDraft.trim() === text) setState({ dockDraft: '' });
    }
  }, []);

  // Pull a message back into the input to change and resend, like home: everything from it on is dropped.
  const editLast = useCallback((id: string) => {
    const items = getState().aiChat;
    const idx = items.findIndex((i) => i.id === id);
    const item = items[idx];
    if (!item || item.kind !== 'user') return;
    stopAi();
    const kept = items.slice(0, idx);
    const turns = kept.flatMap((i) => ((i.kind === 'user' || i.kind === 'assistant') && i.text.trim() ? [{ role: i.kind, text: i.text }] : []));
    setState({ aiChat: kept, aiTurnId: null, aiStopped: null, dockDraft: typedText(item.text) });
    void api.ai.reset().then(() => api.ai.hydrate(turns));
  }, []);

  return (
    <>
      <div ref={logRef} className="calm-chat__log">
        {hasThread ? (
          <div className="px-3 pt-2">
            <HomeChat mentions split onEditLast={editLast} />
          </div>
        ) : (
          <div className="calm-chat__empty">
            <p className="m-0">Ask for a change below. Type @ to point at a layer or page. Everything the AI does in one reply is a single undo step.</p>
            <HomeActionPills
              disabled={!aiReady}
              onPick={(starter) => {
                setState({ dockDraft: starter });
                requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.calm-chat__composer textarea')?.focus());
              }}
            />
          </div>
        )}
      </div>
      <div className="calm-chat__composer">
        <HomePrompt
          value={draft}
          onChange={(value) => setState({ dockDraft: value })}
          onSubmit={() => void send()}
          disabled={!aiReady}
          sending={!!aiTurnId}
          mentions={mentions}
          onMention={() => undefined}
          history={history}
          webSearch={false}
        />
        <HomeComposerExtras />
        {!aiReady && (
          <p className="m-0 px-1 pt-2 text-xs text-muted-foreground">
            Connect AI to chat here.{' '}
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={openAiSettings}>
              Open Settings
            </button>
          </p>
        )}
      </div>
    </>
  );
}

export function CalmChatPanel({ open }: { open: boolean }) {
  const aiReady = useStore((s) => !!s.aiStatus?.ready);
  const hasThread = useStore((s) => s.aiChat.length > 0);
  return (
    <aside
      data-tw=""
      aria-hidden={!open}
      inert={!open}
      aria-label={open ? 'Conversation with the AI' : undefined}
      className="panel panel--left calm-chat"
      style={{ width: open ? CALM_CHAT_WIDTH : 0 }}
    >
      <div className="calm-chat__inner" style={{ width: CALM_CHAT_WIDTH }}>
        {open && (
          <TooltipProvider>
            <div className="calm-chat__actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="size-8 rounded-full p-0 text-muted-foreground hover:text-foreground [&_svg]:size-4" aria-label="New chat" disabled={!hasThread} onClick={() => void newAiChat()}>
                    <HugeiconsIcon icon={MessageAdd01Icon} strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">New chat</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="size-8 rounded-full p-0 text-muted-foreground hover:text-foreground [&_svg]:size-4" aria-label="Close" onClick={() => setState({ dockMode: null })}>
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close</TooltipContent>
              </Tooltip>
            </div>
            {aiReady || hasThread ? <ChatBody /> : <InputPanel />}
          </TooltipProvider>
        )}
      </div>
    </aside>
  );
}
