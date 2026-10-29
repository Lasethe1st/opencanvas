import { Sparkles, X } from 'lucide-react';
import { useRef } from 'react';
import { selectElement } from '../lib/actions';
import { sendToAi } from '../lib/ai';
import { activePage } from '../lib/pages';
import { getState, setState, useStore } from '../lib/store';
import { assistantShapes, insertMention, referencesIn } from './assistant-shapes';
import { Shapeshift, type ShapeshiftHandle, type ShapeshiftResult } from './shapeshift';

/** The assistant docker: bottom-centre of the canvas. Chat with the AI about this project, @ layers and pages, or run quick commands. */
export function CanvasShapeshift() {
  const handle = useRef<ShapeshiftHandle>(null);
  const selection = useStore((s) => s.selection);
  const ready = useStore((s) => !!s.aiStatus?.ready);
  const busy = useStore((s) => !!s.aiTurnId);
  const pageName = useStore((s) => (s.projectConfig ? activePage()?.name : null));

  const placeholder = !ready
    ? 'Set up AI in Settings to chat here'
    : selection
      ? `Ask about ${selection.name}…`
      : pageName
        ? `Ask AI to change ${pageName}, or type @ or /`
        : 'Ask AI to change this page, or type @ or /';

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
      setState({ dockDraft: request, dockMode: 'input' });
      return;
    }
    const references = referencesIn(request).map((r) => ({ kind: r.kind, name: r.name, id: r.id, path: r.path }));
    setState({ dockMode: 'input' });
    void sendToAi(request, { references });
  };

  return (
    <div className="canvas-shapeshift assistant-docker" data-tw="" data-busy={busy || undefined} onPointerDown={(e) => e.stopPropagation()}>
      {selection && (
        <div className="assistant-docker__context" title="The AI knows this element is selected">
          <Sparkles size={12} aria-hidden />
          <span className="assistant-docker__context-name">{selection.name}</span>
          <code>{`<${selection.tag}>`}</code>
          <button type="button" aria-label="Deselect" onClick={() => selectElement(null)}>
            <X size={11} />
          </button>
        </div>
      )}
      <Shapeshift
        ref={handle}
        shapes={assistantShapes}
        hotkey={false}
        width={540}
        label="Ask AI or run a command"
        placeholder={placeholder}
        listAll={false}
        sendLabel="Send"
        icon={<Sparkles />}
        onSubmit={onSubmit}
        classNames={{
          shell: 'shadow-none',
          list: '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          panel: '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        }}
      />
    </div>
  );
}
