import { InputPanel } from './Dock';

export const CALM_CHAT_WIDTH = 320;

/**
 * The easy canvas's conversation with the AI. A docked column on the page background, like the home right panel:
 * the canvas becomes the inset, rounded card beside it. The centre bar stays where it is and sends into this thread.
 */
export function CalmChatPanel({ open }: { open: boolean }) {
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
        {open && <InputPanel />}
      </div>
    </aside>
  );
}
