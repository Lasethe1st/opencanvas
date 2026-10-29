import { ArrowUp, Check, CircleAlert, Crosshair, GitBranch, Loader2, MessageSquarePlus, ShieldQuestion, Square, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { providerMeta, type AiChatItem } from '../../../shared/ai';
import { setLeafPage } from '../../../shared/workspace-layout';
import { selectElement } from '../../lib/actions';
import { answerAi, approveAi, newAiChat, openAiSettings, sendToAi, stopAi } from '../../lib/ai';
import { createPage } from '../../lib/pages';
import { getState, setState, useStore } from '../../lib/store';
import { scheduleWorkspaceSave } from '../../lib/workspace';
import { AgentOrb } from '@/components/ui/agent-orb';
import { Button, IconButton, cx } from '../../ui/primitives.jsx';

export async function showAgentActivity() {
  const s = getState();
  let page = s.projectConfig?.pages.find((p) => (p.viewType ?? 'design') === 'agent');
  if (!page) {
    await createPage('Agent activity', 'agent');
    page = getState().projectConfig?.pages.find((p) => (p.viewType ?? 'design') === 'agent');
  }
  if (!page) return;
  const ws = getState().workspace;
  const paneId = ws.focusedPaneId;
  setState({
    workspace: {
      ...ws,
      layout: paneId ? setLeafPage(ws.layout, paneId, page.id) : ws.layout,
      activePageId: page.id,
    },
    dockMode: null,
  });
  scheduleWorkspaceSave();
}

const TOOL_LABELS: Record<string, string> = {
  git_commit: 'Save a version (commit)',
  git_publish: 'Publish to GitHub',
  go_live: 'Put the site online',
  import_files: 'Import files into the project',
  run_command: 'Run a command',
};

/** The in-app AI conversation inside the dock's Ask AI panel. */
export function AiChat({ bare = false }: { bare?: boolean } = {}) {
  const items = useStore((s) => s.aiChat);
  const turnId = useStore((s) => s.aiTurnId);
  const status = useStore((s) => s.aiStatus);
  const draft = useStore((s) => s.dockDraft);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pinned = useRef(true);
  const busy = !!turnId;
  const ready = !!status?.ready;
  const waiting = items.some((i) => (i.kind === 'question' || i.kind === 'approval') && i.answer === null);
  const last = items[items.length - 1];
  const thinking = busy && !waiting && !(last?.kind === 'assistant' || (last?.kind === 'tool' && last.state === 'running'));

  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && pinned.current) log.scrollTop = log.scrollHeight;
  }, [items, thinking]);

  const send = async () => {
    if (!draft.trim() || !ready) return;
    pinned.current = true;
    await sendToAi(draft);
  };

  const model = status?.settings.model;
  const provider = status ? providerMeta(status.settings.provider).label : '';

  return (
    <div className="dock-pane ai-chat">
      <div className="dock-head">
        <h2 className="dock-head__title">Ask AI</h2>
        {model && (
          <button type="button" className="ai-chat__model" onClick={openAiSettings} title="Change in Settings › AI">
            {provider} · {model}
          </button>
        )}
        <IconButton label="Show activity" size="sm" tipSide="top" onClick={() => void showAgentActivity()}>
          <GitBranch size={14} />
        </IconButton>
        <IconButton label="New chat" size="sm" tipSide="top" disabled={!items.length} onClick={() => void newAiChat().then(() => inputRef.current?.focus())}>
          <MessageSquarePlus size={14} />
        </IconButton>
      </div>

      <div
        ref={logRef}
        className="ai-log"
        aria-label="Conversation"
        tabIndex={items.length ? 0 : undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {!items.length && <p className="dock-empty">Ask for a change in the bar below. Select an element first to point at it, or type @ to mention a layer or page. Everything the AI does in one reply is a single undo step.</p>}
        {items.map((item) => (
          <ChatItem key={item.id} item={item} />
        ))}
        {thinking && (
          <div className="ai-thinking">
            <span aria-hidden>
              <AgentOrb variant="S1" size={18} style={{ color: 'currentColor' }} />
            </span>
            Thinking…
          </div>
        )}
      </div>
      <p className="sr-only" role="status">
        {waiting ? 'The AI is waiting for your answer.' : busy ? 'The AI is working.' : items.length ? 'The AI is done.' : ''}
      </p>

      {bare && busy && !waiting && (
        <div className="ai-working">
          <span>Working on it…</span>
          <Button size="sm" variant="ghost" icon={<Square size={11} fill="currentColor" />} onClick={stopAi}>
            Stop
          </Button>
        </div>
      )}
      {!bare && (
      <div className="ai-composer">
        <textarea
          ref={inputRef}
          className="ai-composer__input"
          autoFocus
          rows={2}
          aria-label="Message the AI"
          placeholder={ready ? (items.length ? 'Ask for another change…' : 'e.g. Add a pricing section with three plans') : (status?.reason ?? 'Set up AI in Settings first.')}
          value={draft}
          onChange={(e) => setState({ dockDraft: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {busy ? (
          <IconButton label="Stop" size="sm" tipSide="top" className="ai-composer__send" onClick={stopAi}>
            <Square size={12} fill="currentColor" />
          </IconButton>
        ) : (
          <IconButton label="Send (Enter)" size="sm" tipSide="top" className="ai-composer__send is-primary" disabled={!draft.trim() || !ready} onClick={() => void send()}>
            <ArrowUp size={14} />
          </IconButton>
        )}
      </div>
      )}
      {!bare && !ready && status?.reason && (
        <p className="dock-note">
          {status.reason}{' '}
          <button type="button" className="git-link" onClick={openAiSettings}>
            Open Settings
          </button>
        </p>
      )}
    </div>
  );
}

function ChatItem({ item }: { item: AiChatItem }) {
  switch (item.kind) {
    case 'user':
      return <div className="ai-msg ai-msg--user">{item.text}</div>;
    case 'assistant':
      return <div className="ai-msg ai-msg--assistant">{item.text}</div>;
    case 'error':
      return (
        <div className="ai-error" role="alert">
          <CircleAlert size={14} aria-hidden />
          <span>{item.text}</span>
        </div>
      );
    case 'tool':
      return (
        <div className={cx('ai-tool', `is-${item.state}`)}>
          {item.state === 'running' ? <Loader2 size={13} className="ai-spin" aria-label="Running" /> : item.state === 'done' ? <Check size={13} aria-label="Done" /> : <X size={13} aria-label="Failed" />}
          <span className="ai-tool__summary">{item.summary}</span>
          {item.state === 'done' && item.elementId && (
            <button type="button" className="ai-tool__show" onClick={() => selectElement(item.elementId!)} title="Select this element on the canvas">
              <Crosshair size={12} aria-hidden />
              Show
            </button>
          )}
        </div>
      );
    case 'question':
      return <QuestionCard item={item} />;
    case 'approval':
      return <ApprovalCard item={item} />;
  }
}

function QuestionCard({ item }: { item: Extract<AiChatItem, { kind: 'question' }> }) {
  const { question, answer } = item;
  const [text, setText] = useState('');
  const first = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const open = answer === null;

  useEffect(() => {
    if (!open) return;
    const target = first.current ?? textRef.current;
    // Take focus only when the user isn't typing somewhere else.
    if (!document.activeElement || document.activeElement === document.body || document.activeElement.closest('.dock')) target?.focus({ preventScroll: true });
  }, [open]);

  return (
    <fieldset className={cx('ai-card', !open && 'is-answered')} disabled={!open}>
      <legend className="ai-card__title">{question.question}</legend>
      {open ? (
        <>
          {question.options.length > 0 && (
            <div
              className="ai-card__options"
              onKeyDown={(e) => {
                const n = Number(e.key);
                if (n >= 1 && n <= question.options.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  e.preventDefault();
                  answerAi(question.id, question.options[n - 1]);
                }
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  const buttons = [...e.currentTarget.querySelectorAll('button')];
                  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
                  if (i < 0) return;
                  e.preventDefault();
                  const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
                  buttons[(i + step + buttons.length) % buttons.length].focus();
                }
              }}
            >
              {question.options.map((option, i) => (
                <button key={option} ref={i === 0 ? first : undefined} type="button" className="ai-option" onClick={() => answerAi(question.id, option)}>
                  <kbd aria-hidden>{i + 1}</kbd>
                  {option}
                </button>
              ))}
            </div>
          )}
          {question.allowText && (
            <form
              className="ai-card__text"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) answerAi(question.id, text.trim());
              }}
            >
              <input ref={textRef} aria-label="Your own answer" placeholder={question.options.length ? 'Or type your own answer' : 'Type your answer'} value={text} onChange={(e) => setText(e.target.value)} />
              <Button size="sm" type="submit" disabled={!text.trim()}>
                Answer
              </Button>
            </form>
          )}
        </>
      ) : (
        <p className="ai-card__answer">{answer}</p>
      )}
    </fieldset>
  );
}

function ApprovalCard({ item }: { item: Extract<AiChatItem, { kind: 'approval' }> }) {
  const { approval, answer } = item;
  const deny = useRef<HTMLButtonElement>(null);
  const open = answer === null;

  useEffect(() => {
    if (open && (!document.activeElement || document.activeElement === document.body || document.activeElement.closest('.dock'))) deny.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div className={cx('ai-card ai-card--approval', !open && 'is-answered')} role="group" aria-label="Permission needed">
      <div className="ai-card__title">
        <ShieldQuestion size={14} aria-hidden />
        {TOOL_LABELS[approval.tool] ?? approval.tool}
      </div>
      {approval.command && (
        <div className="ai-card__command">
          <code>{approval.command}</code>
          {approval.cwd && <span className="ai-card__cwd">in {approval.cwd}</span>}
        </div>
      )}
      <p className="ai-card__summary">{approval.summary}</p>
      {open ? (
        <div className="dock-actions">
          <Button ref={deny} size="sm" variant="ghost" onClick={() => approveAi(approval.id, false)}>
            Don’t allow
          </Button>
          <Button size="sm" variant="primary" onClick={() => approveAi(approval.id, true)}>
            Allow
          </Button>
        </div>
      ) : (
        <p className="ai-card__answer">{answer === 'Allowed' ? 'You allowed this.' : answer === 'Declined' ? 'You didn’t allow this.' : answer}</p>
      )}
    </div>
  );
}
