/** In-app AI from the editor's side: the conversation lives in the store, the model and keys in the main process. */
import type { AiEvent } from '../../shared/ai';
import { reduceAiChat } from '../../shared/ai-chat';
import { EMPTY_AGENT_GRAPH, reduceAgentGraph } from '../../shared/agent-graph';
import type { AiTurnContext } from '../../shared/api';
import { IDLE_BUILD, reduceBuild } from '../../shared/build-stages';
import { errorMessage } from './actions';
import { api } from './api';
import { activePage } from './pages';
import { activeFrame, getState, setState, toast } from './store';

/** Follow-ups while a turn is running — drained when the current turn finishes. */
const pendingRequests: string[] = [];
/** Blocks overlapping send() calls before aiTurnId is set from the start event. */
let sendLock = false;

function isBusyMessage(err: unknown): boolean {
  return /still working on your last request/i.test(errorMessage(err));
}

function drainQueue() {
  const next = pendingRequests.shift();
  if (next) void sendToAi(next);
}

export function handleAiEvent(event: AiEvent) {
  const s = getState();
  const frameId = s.activeFrameId;
  const inProject = !!s.project;
  if (event.projectRoot && s.project && event.projectRoot !== s.project.root) return;
  if (event.type === 'start') {
    setState({
      aiTurnId: event.turnId,
      aiChat: reduceAiChat(s.aiChat, event),
      agentGraph: reduceAgentGraph(s.agentGraph, event),
      selectedAgentNodeId: event.turnId,
      ...(inProject ? { build: reduceBuild(s.build, event, { frameId }) } : {}),
    });
    return;
  }
  // Events from a turn that belonged to a project that has since been closed / a different turn.
  if (event.turnId !== s.aiTurnId) return;
  const build = inProject ? reduceBuild(s.build, event, { frameId }) : s.build;
  const done = event.type === 'done';
  const agentGraph = reduceAgentGraph(s.agentGraph, event);
  setState({
    aiChat: reduceAiChat(s.aiChat, event),
    agentGraph,
    ...(s.followAgentNode && agentGraph.activeNodeId ? { selectedAgentNodeId: agentGraph.activeNodeId } : {}),
    ...(inProject ? { build } : {}),
    ...(done ? { aiTurnId: null } : {}),
  });
  // The AI is waiting on the user, so bring the conversation into view (in-project dock only).
  if (inProject && (event.type === 'question' || event.type === 'approval') && s.dockMode !== 'input') setState({ dockMode: 'input' });
  if (inProject && done && (build.phase === 'stopped' || build.phase === 'failed')) {
    setTimeout(() => {
      if (getState().build.turnId === event.turnId) setState({ build: IDLE_BUILD });
    }, 800);
  }
  if (done) {
    sendLock = false;
    drainQueue();
  }
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

/** Sends the request to the in-app AI. Queues while a turn is already running. */
export async function sendToAi(request: string): Promise<boolean> {
  const text = request.trim();
  if (!text) return false;

  if (getState().aiTurnId || sendLock) {
    pendingRequests.push(text);
    if (getState().dockDraft.trim() === text) setState({ dockDraft: '' });
    return true;
  }

  sendLock = true;
  try {
    await api.ai.send(text, turnContext());
    if (getState().dockDraft.trim() === text) setState({ dockDraft: '' });
    return true;
  } catch (err) {
    sendLock = false;
    if (isBusyMessage(err)) {
      pendingRequests.push(text);
      if (getState().dockDraft.trim() === text) setState({ dockDraft: '' });
      return true;
    }
    toast(errorMessage(err), 'error');
    void refreshAiStatus();
    return false;
  }
}

export const stopAi = () => {
  pendingRequests.length = 0;
  sendLock = false;
  void api.ai.cancel();
};

export async function newAiChat() {
  pendingRequests.length = 0;
  sendLock = false;
  if (getState().aiTurnId) await api.ai.cancel();
  await api.ai.reset();
  setState({ aiChat: [], aiTurnId: null, agentGraph: EMPTY_AGENT_GRAPH, selectedAgentNodeId: null });
}

export const answerAi = (id: string, answer: string) => void api.ai.answer(id, answer);
export const approveAi = (id: string, allow: boolean) => void api.ai.approve(id, allow);

export function openAiSettings() {
  setState({ settingsOpen: true, settingsTab: 'ai' });
}
