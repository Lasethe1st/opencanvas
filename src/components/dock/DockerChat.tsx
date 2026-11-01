import { GitBranch, MessageSquarePlus, Square, X } from '../../lib/hugeicons';
import { useEffect, useRef } from 'react';
import { providerMeta } from '../../../shared/ai';
import { newAiChat, openAiSettings, stopAi } from '../../lib/ai';
import { setState, useStore } from '../../lib/store';
import { IconButton } from '../../ui/primitives.jsx';
import { HomeChat } from '../home/HomeChat';
import { showAgentActivity } from './AiChat';

/** The assistant docker's conversation: the same thread as the home chat — replies as plain text, yours in a bubble. */
export function DockerChat() {
  const items = useStore((s) => s.aiChat);
  const busy = useStore((s) => !!s.aiTurnId);
  const status = useStore((s) => s.aiStatus);
  const waiting = items.some((i) => (i.kind === 'question' || i.kind === 'approval') && i.answer === null);
  const logRef = useRef<HTMLDivElement>(null);
  const model = status?.settings.model;
  const provider = status ? providerMeta(status.settings.provider).label : '';

  // The box has a fixed height, so a streaming reply scrolls inside it instead of pushing the dock around.
  // Keep the newest text in view unless the person has scrolled up to read.
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

  return (
    <div className="docker-chat" data-tw="">
      <div className="docker-chat__head">
        {model ? (
          <button type="button" className="docker-chat__model" onClick={openAiSettings} title="Change in Settings › AI">
            {provider} · {model}
          </button>
        ) : (
          <span className="docker-chat__model">Assistant</span>
        )}
        <IconButton label="Show activity" size="sm" tipSide="top" onClick={() => void showAgentActivity()}>
          <GitBranch size={14} />
        </IconButton>
        <IconButton label="New chat" size="sm" tipSide="top" disabled={!items.length} onClick={() => void newAiChat()}>
          <MessageSquarePlus size={14} />
        </IconButton>
        <IconButton label="Close" size="sm" tipSide="top" onClick={() => setState({ dockMode: null })}>
          <X size={14} />
        </IconButton>
      </div>
      <div ref={logRef} className="docker-chat__log">
        {items.length ? (
          <HomeChat mentions />
        ) : (
          <p className="docker-chat__empty">Ask for a change in the bar below. Select an element to point at it, or type @ to mention a layer or page. Everything the AI does in one reply is a single undo step.</p>
        )}
      </div>
      {busy && !waiting && (
        <div className="docker-chat__foot">
          <span>Working on it…</span>
          <button type="button" onClick={stopAi}>
            <Square size={10} fill="currentColor" aria-hidden /> Stop
          </button>
        </div>
      )}
    </div>
  );
}
