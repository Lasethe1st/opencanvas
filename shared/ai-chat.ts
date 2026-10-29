import type { AiChatItem, AiEvent } from './ai';

/** Folds one streamed AI event into the editor's conversation. Pure, so the dock and tests share it. */
export function reduceAiChat(items: AiChatItem[], event: AiEvent): AiChatItem[] {
  const { turnId } = event;
  switch (event.type) {
    case 'start':
      return [...items, { kind: 'user', id: `${turnId}:user`, text: event.request }];
    case 'text': {
      const last = items[items.length - 1];
      if (last?.kind === 'assistant' && last.id.startsWith(`${turnId}:`)) {
        return [...items.slice(0, -1), { ...last, text: last.text + event.delta }];
      }
      if (!event.delta.trim()) return items;
      // Close any open thinking block when the visible reply starts.
      const closed = items.map((item): AiChatItem => (item.kind === 'thinking' && item.id.startsWith(`${turnId}:`) && !item.done ? { ...item, done: true } : item));
      return [...closed, { kind: 'assistant', id: `${turnId}:a${closed.length}`, text: event.delta }];
    }
    case 'reasoning': {
      const last = items[items.length - 1];
      if (last?.kind === 'thinking' && last.id.startsWith(`${turnId}:`) && !last.done) {
        return [...items.slice(0, -1), { ...last, text: last.text + event.delta }];
      }
      if (!event.delta.trim()) return items;
      return [...items, { kind: 'thinking', id: `${turnId}:think${items.length}`, text: event.delta, done: false }];
    }
    case 'step':
      // Graph-only; chat stays a flat tool/text timeline.
      return items;
    case 'tool-start': {
      const closed = items.map((item): AiChatItem => (item.kind === 'thinking' && item.id.startsWith(`${turnId}:`) && !item.done ? { ...item, done: true } : item));
      return [...closed, { kind: 'tool', id: `${turnId}:${event.callId}`, tool: event.tool, summary: event.summary, state: 'running' }];
    }
    case 'tool-end': {
      const id = `${turnId}:${event.callId}`;
      return items.map((item) => (item.kind === 'tool' && item.id === id ? { ...item, state: event.ok ? 'done' : 'failed', summary: event.summary, elementId: event.elementId ?? null } : item));
    }
    case 'question':
      return [...items, { kind: 'question', id: event.question.id, question: event.question, answer: null }];
    case 'approval':
      return [...items, { kind: 'approval', id: event.approval.id, approval: event.approval, answer: null }];
    case 'resolved':
      return items.map((item) => ((item.kind === 'question' || item.kind === 'approval') && item.id === event.id ? { ...item, answer: event.answer } : item));
    case 'error':
      return [...items, { kind: 'error', id: `${turnId}:e${items.length}`, text: event.message }];
    case 'done': {
      const trimmed = items.map((item): AiChatItem => {
        if (item.kind === 'assistant' && item.id.startsWith(`${turnId}:`)) return { ...item, text: item.text.trimEnd() };
        if (item.kind === 'thinking' && item.id.startsWith(`${turnId}:`)) return { ...item, text: item.text.trimEnd(), done: true };
        if (item.kind === 'tool' && item.state === 'running' && item.id.startsWith(`${turnId}:`)) return { ...item, state: 'failed', summary: `${item.summary} (stopped)` };
        if ((item.kind === 'question' || item.kind === 'approval') && item.answer === null) return { ...item, answer: event.stopped ? 'Stopped' : 'No answer' };
        return item;
      });
      return trimmed.filter((item) => (item.kind !== 'assistant' && item.kind !== 'thinking') || item.text);
    }
  }
}
