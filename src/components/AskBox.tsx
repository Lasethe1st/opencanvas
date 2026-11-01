import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowShrink02Icon, Cancel01Icon, ExpandIcon, MinusSignIcon, SentIcon } from '@hugeicons/core-free-icons';
import { setAsk, useAsk } from '../lib/ask-box';
import { openAiSettings, sendToAi } from '../lib/ai';
import { closeElementMenu } from '../lib/element-menu';
import { setState, useStore } from '../lib/store';
import { HomeChat } from './home/HomeChat';
import { LayerIcon, layerKind } from '../lib/layer-icons';

export const CHAT_W = 380;
/** The chat is titled with the element's class (".hero-title"); elements without one show their tag. */
function titleOf(target: { name: string; tag?: string } | null): string {
  if (!target) return 'Ask AI';
  const cls = /\s\.(\S+)$/.exec(target.name)?.[1];
  return cls ? `.${cls}` : target.tag ?? target.name;
}
export const CHAT_H = 480;

/** Fold the chat back into the dock. The thread is kept; the dock shows it's there and reopens it. */
export function minimizeAsk() {
  setAsk({ mode: 'none' });
  closeElementMenu();
}
export function maximizeAsk() {
  setAsk({ mode: 'max' });
  closeElementMenu();
}
export function closeAsk() {
  setAsk({ mode: 'none' });
  closeElementMenu();
}
/** Leave the maximised dialog for the dock chat, so the conversation stays in one place. */
export function restoreAsk() {
  setAsk({ mode: 'none' });
  closeElementMenu();
  setState({ dockMode: 'input' });
}

const iconBtn = 'grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

/** The chat itself: element context, the shared thread, and a field. Used in the bloom box and the maximised dialog. */
export function AskChat({ maximized = false }: { maximized?: boolean }) {
  const ask = useAsk();
  const ready = useStore((s) => !!s.aiStatus?.ready);
  const busy = useStore((s) => !!s.aiTurnId);
  const items = useStore((s) => s.aiChat);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, busy]);

  const send = () => {
    const request = text.trim();
    if (!request || !ready) return;
    const t = ask.target;
    setText('');
    void sendToAi(request, { references: t ? [{ kind: 'layer', name: t.name, id: t.id }] : [] });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-3.5 pb-1.5 pt-2.5">
        <span className="mr-auto flex min-w-0">
          <span className="ask-tag" data-kind={ask.target?.tag ? layerKind(ask.target.tag) : 'struct'} title={titleOf(ask.target)}>
            {ask.target?.tag && <LayerIcon tag={ask.target.tag} size={12} color="currentColor" className="shrink-0" />}
            <span className="truncate">{titleOf(ask.target)}</span>
          </span>
        </span>
        <button type="button" aria-label="Minimize" title="Minimize" className={iconBtn} onClick={minimizeAsk}>
          <HugeiconsIcon icon={MinusSignIcon} size={15} strokeWidth={2} />
        </button>
        {maximized ? (
          <button type="button" aria-label="Restore" title="Restore" className={iconBtn} onClick={restoreAsk}>
            <HugeiconsIcon icon={ArrowShrink02Icon} size={15} strokeWidth={2} />
          </button>
        ) : (
          <button type="button" aria-label="Maximize" title="Maximize" className={iconBtn} onClick={maximizeAsk}>
            <HugeiconsIcon icon={ExpandIcon} size={15} strokeWidth={2} />
          </button>
        )}
        <button type="button" aria-label="Close" title="Close" className={iconBtn} onClick={closeAsk}>
          <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={2} />
        </button>
      </div>
      <div ref={logRef} className="docker-chat__log min-h-0 flex-1 overflow-y-auto px-3 [scrollbar-width:thin]">
        {items.length ? (
          <HomeChat mentions />
        ) : (
          <p className="m-1 text-sm leading-relaxed text-muted-foreground">
            {ready ? 'Describe what you want changed. The AI knows which element you pointed at.' : 'Add an AI provider in Settings to chat here.'}
          </p>
        )}
      </div>
      <div className="p-3 pt-2">
        {ready ? (
          <div className="flex items-end gap-1.5 rounded-[18px] bg-muted/70 p-1.5 ps-3.5">
            <textarea
              autoFocus
              value={text}
              rows={1}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={busy ? 'Working… you can queue another' : 'Ask…'}
              aria-label="Message"
              className="max-h-[3lh] min-h-[1lh] flex-1 resize-none self-center [field-sizing:content] bg-transparent py-0 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="button" aria-label="Send" disabled={!text.trim()} className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background disabled:opacity-30" onClick={send}>
              <HugeiconsIcon icon={SentIcon} size={15} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button type="button" className="h-9 w-full rounded-full bg-foreground text-sm font-medium text-background" onClick={openAiSettings}>
            Set up AI
          </button>
        )}
      </div>
    </div>
  );
}

/** The maximised dialog. (The normal floating box is the context menu's bloom; minimising folds into the dock.) */
export function AskBox() {
  const ask = useAsk();

  useEffect(() => {
    if (ask.mode !== 'max') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && minimizeAsk();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask.mode]);

  if (ask.mode === 'max') {
    return createPortal(
      <div data-tw="" className="fixed inset-0 z-[300] grid place-items-start justify-items-center bg-overlay p-4 pt-[10vh] motion-safe:animate-[fade-in_0.15s_ease-out]" onPointerDown={(e) => e.target === e.currentTarget && minimizeAsk()}>
        <div role="dialog" aria-modal="true" aria-label="Ask AI" className="h-[min(600px,80vh)] w-full max-w-[640px] overflow-hidden rounded-[24px] border border-border bg-card/90 text-foreground shadow-[var(--shadow-lg)] backdrop-blur-[20px]">
          <AskChat maximized />
        </div>
      </div>,
      document.body,
    );
  }
  return null;
}
