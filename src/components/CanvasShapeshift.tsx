import { friendlyTag } from '../lib/element-names';
import { X } from '../lib/hugeicons';
import { layerKind } from '../lib/layer-icons';
import { useQuickPills } from '../lib/prefs';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Waveform } from '../lib/home-icons';
import { VoiceOrbSession } from './home/VoiceOrbSession';
import { useEffect, useRef, useState } from 'react';
import { getAsk, setAsk } from '../lib/ask-box';
import { closeElementMenu } from '../lib/element-menu';
import { selectElement } from '../lib/actions';
import { sendToAi } from '../lib/ai';
import { useExperienceLevel } from '../lib/experience';
import { useCalm } from '../lib/calm';
import { activePage } from '../lib/pages';
import { getState, setState, useStore } from '../lib/store';
import { InputPanel } from './Dock';
import { DockRow } from './dock/DockRow';
import { assistantShapes, insertMention, referencesIn } from './assistant-shapes';
import { Shapeshift, type ShapeshiftHandle, type ShapeshiftResult } from './shapeshift';

/** Same spring as the right-click menu's bloom (bloom-menu: visualDuration 0.28, bounce 0.12). */
const BLOOM = { type: 'spring', visualDuration: 0.28, bounce: 0.12, opacity: { duration: 0.18 }, filter: { duration: 0.2 } } as const;

/** The chat blooms to one fixed height, so text streaming in never resizes the dock. */
function chatHeight() {
  return Math.round(Math.min(360, window.innerHeight * 0.5));
}

/** The assistant docker: bottom-centre of the canvas. Chat with the AI about this project, @ layers and pages, or run quick commands. */
export function CanvasShapeshift({ variant = 'dock' }: { variant?: 'dock' | 'panel' } = {}) {
  const panel = variant === 'panel';
  const handle = useRef<ShapeshiftHandle>(null);
  const [focused, setFocused] = useState(false);
  const [voice, setVoice] = useState(false);
  const quickPills = useQuickPills();
  const level = useExperienceLevel();
  const showPills = level === 'beginner' || quickPills;
  const selection = useStore((s) => s.selection);
  const ready = useStore((s) => !!s.aiStatus?.ready);
  const busy = useStore((s) => !!s.aiTurnId);
  const chatOpen = useStore((s) => s.dockMode === 'input');
  // In the easy canvas the thread shows in the left panel, so the bar never blooms upward there.
  const calm = useCalm();
  const bloomChat = chatOpen && !calm;
  const pageName = useStore((s) => (s.projectConfig ? activePage()?.name : null));

  // One conversation, one place: opening it in the dock closes the floating Ask AI box.
  useEffect(() => {
    if (!chatOpen || getAsk().mode === 'none') return;
    setAsk({ mode: 'none' });
    closeElementMenu();
  }, [chatOpen]);

  // Voice, as on the home page: the orb listens, the AI answers aloud, and the exchange lands in the chat.
  const endVoice = () => {
    const before = chatLenAtStart.current;
    setVoice(false);
    if (!panel && getState().aiChat.length > before) setState({ dockMode: 'input' });
  };
  const chatLenAtStart = useRef(0);
  const startVoice = () => {
    chatLenAtStart.current = getState().aiChat.length;
    setVoice(true);
  };

  const placeholder = panel && ready && !selection
    ? 'Ask AI, or type @ or /'
    : !ready
    ? 'Select something to edit by hand — connect AI in Settings when ready'
    : selection
      ? `Ask about ${selection.name}…`
      : pageName
        ? `Ask AI to change ${pageName}, or type @ or /`
        : 'Ask AI to change this page, or type @ or /';

  // The selected element rides inside the field as an inline chip, so nothing floats above the dock.
  const contextChip = selection ? (
        <span className="assistant-docker__context" data-kind={layerKind(selection.tag)} title={`The AI knows ${selection.name} (<${selection.tag}>) is selected`}>
          <span>{friendlyTag(selection.tag)}</span>
          <button type="button" aria-label="Deselect" onClick={() => selectElement(null)}>
            <X size={11} />
          </button>
        </span>
  ) : undefined;

  const onSubmit = ({ shape, data, text }: ShapeshiftResult) => {
    if (shape?.id === 'mention') {
      // Enter takes the top result and keeps the field going.
      const top = (data as { items: Parameters<typeof insertMention>[1][] } | undefined)?.items[0];
      if (top) setTimeout(() => handle.current?.setText(insertMention(text, top)), 0);
      else setTimeout(() => handle.current?.setText(text), 0);
      return;
    }
    if (shape) return; // commands run from their own onSubmit
    const request = text.trim();
    if (!request) return;
    if (!getState().aiStatus?.ready) {
      // No AI provider yet: the dock's hand-off panel can copy it as a prompt for another agent.
      setState({ dockDraft: request, ...(panel ? {} : { dockMode: 'input' as const }) });
      return;
    }
    const references = referencesIn(request).map((r) => ({ kind: r.kind, name: r.name, id: r.id, path: r.path }));
    if (!panel) setState({ dockMode: 'input' });
    void sendToAi(request, { references });
  };

  const wrap = (children: React.ReactNode) => (panel ? <>{children}</> : <DockRow tucked={chatOpen || focused || voice || !showPills}>{children}</DockRow>);
  // The calm chat panel has its own composer, so the bar steps aside while it is open.
  if (calm && !panel && chatOpen) return null;
  return wrap(
    <>
    <div className={`canvas-shapeshift assistant-docker${panel ? ' assistant-docker--panel' : ''}`} onFocus={() => setFocused(true)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setFocused(false)} data-tw="" data-busy={busy || undefined} data-chat={bloomChat || undefined} onPointerDown={(e) => e.stopPropagation()}>
      <Shapeshift
        ref={handle}
        shapes={assistantShapes}
        hotkey={false}
        width={420}
        lead={contextChip}
        trailing={panel ? undefined : (
          <button type="button" aria-label="Voice input" title={ready ? 'Talk to the AI' : 'Set up AI in Settings to talk'} disabled={!ready || voice} onClick={startVoice} className={`flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-[opacity,scale,background-color,color] duration-150 active:scale-95 disabled:cursor-default disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring ${voice ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'}`}>
            <Waveform className="size-4" />
          </button>
        )}
        label="Ask AI or run a command"
        placeholder={placeholder}
        listAll={false}
        above={
          panel ? undefined : <AnimatePresence initial={false}>
            {bloomChat && (
              <motion.div
                key="chat"
                className="assistant-docker__chat"
                initial={{ height: 0, opacity: 0, filter: 'blur(6px)' }}
                animate={{ height: chatHeight(), opacity: 1, filter: 'blur(0px)' }}
                exit={{ height: 0, opacity: 0, filter: 'blur(6px)' }}
                transition={BLOOM}
              >
                <InputPanel />
              </motion.div>
            )}
          </AnimatePresence>
        }
        sendLabel="Send"
        onSubmit={onSubmit}
        classNames={{
          shell: 'shadow-none',
          bar: 'h-9 ps-3.5 pe-1',
          list: '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          panel: '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        }}
      />
    </div>
    {voice && createPortal(
      <div data-tw="" className="fixed inset-x-0 z-[300] flex justify-center" style={{ bottom: 88 }} onPointerDown={(e) => e.stopPropagation()}>
        <div data-bloom-menu="" className="oc-pop rounded-[28px] border border-[color:var(--frost-border)] bg-[var(--frost-bg)] px-10 py-4 shadow-[var(--shadow-md)]" style={{ WebkitBackdropFilter: 'var(--frost-filter)', backdropFilter: 'var(--frost-filter)', transformOrigin: 'bottom center' }}>
          <VoiceOrbSession onClose={endVoice} />
        </div>
      </div>,
      document.body,
    )}
    </>,
  );
}
