/** In-app AI from the editor's side: the conversation lives in the store, the model and keys in the main process. */
import type { AiEvent } from '../../shared/ai';
import { reduceAiChat } from '../../shared/ai-chat';
import type { AiTurnContext } from '../../shared/api';
import { errorMessage } from './actions';
import { api } from './api';
import { activePage } from './pages';
import { activeFrame, getState, setState, toast } from './store';

export function handleAiEvent(event: AiEvent) {
  const s = getState();
  if (event.type === 'start') {
    if (!s.project) return;
    setState({ aiTurnId: event.turnId, aiChat: reduceAiChat(s.aiChat, event) });
    return;
  }
  // Events from a turn that belonged to a project that has since been closed.
  if (event.turnId !== s.aiTurnId) return;
  setState({ aiChat: reduceAiChat(s.aiChat, event), ...(event.type === 'done' ? { aiTurnId: null } : {}) });
  // The AI is waiting on the user, so bring the conversation into view.
  if ((event.type === 'question' || event.type === 'approval') && s.dockMode !== 'input') setState({ dockMode: 'input' });
}

export async function refreshAiStatus() {
  try {
    setState({ aiStatus: await api.ai.status() });
  } catch {
    /* the status shows again on the next refresh */
  }
}

function turnContext(): AiTurnContext {
  const s = getState();
  const page = activePage();
  return {
    selection: s.selection ? { id: s.selection.id, name: s.selection.name, tag: s.selection.tag } : null,
    page: page ? { name: page.name, path: page.path } : null,
    frameWidth: activeFrame(s)?.width ?? null,
  };
}

/** Sends the request to the in-app AI. Resolves false when it couldn't start. */
export async function sendToAi(request: string): Promise<boolean> {
  const text = request.trim();
  if (!text || getState().aiTurnId) return false;
  try {
    await api.ai.send(text, turnContext());
    if (getState().dockDraft.trim() === text) setState({ dockDraft: '' });
    return true;
  } catch (err) {
    toast(errorMessage(err), 'error');
    void refreshAiStatus();
    return false;
  }
}

export const stopAi = () => void api.ai.cancel();

export async function newAiChat() {
  if (getState().aiTurnId) await api.ai.cancel();
  await api.ai.reset();
  setState({ aiChat: [], aiTurnId: null });
}

export const answerAi = (id: string, answer: string) => void api.ai.answer(id, answer);
export const approveAi = (id: string, allow: boolean) => void api.ai.approve(id, allow);

export function openAiSettings() {
  setState({ settingsOpen: true, settingsTab: 'ai' });
}
