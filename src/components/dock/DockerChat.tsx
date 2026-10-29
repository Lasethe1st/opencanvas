import { GitBranch, MessageSquarePlus, Square, X } from 'lucide-react';
import { useRef } from 'react';
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
