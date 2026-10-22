/** Editor-side half of the postMessage channel to the preview frames. */
import { getState } from './store';

const frames = new Map<string, HTMLIFrameElement>();

export function registerFrame(id: string, el: HTMLIFrameElement | null) {
  if (el) frames.set(id, el);
  else frames.delete(id);
}

/** Which registered frame a message came from. */
export function frameIdOf(source: MessageEventSource | null): string | null {
  if (!source) return null;
  for (const [id, el] of frames) if (el.contentWindow === source) return id;
  return null;
}

export function frameIds(): string[] {
  return [...frames.keys()];
}

export function frameElement(id: string): HTMLIFrameElement | null {
  return frames.get(id) ?? null;
}

export function sendToFrame(id: string, type: string, payload: Record<string, unknown> = {}) {
  frames.get(id)?.contentWindow?.postMessage({ source: 'oc-editor', type, ...payload }, '*');
}

/**
 * Sends to every frame. The active frame gets the message as-is; the others mirror selection and
 * hover by source id only (runtime uids are per frame) and never scroll.
 */
export function sendToPreview(type: string, payload: Record<string, unknown> = {}) {
  const active = getState().activeFrameId;
  for (const id of frames.keys()) {
    if (id === active) sendToFrame(id, type, payload);
    else if (type === 'select') sendToFrame(id, 'select', { id: payload.id ?? null, linked: true });
    else if (type === 'hover') sendToFrame(id, 'hover', { id: payload.id ?? null });
    else sendToFrame(id, type, payload);
  }
}

/** Outlines the other members of a multi-selection: solid in the active frame, dashed elsewhere. */
export function sendMulti(ids: string[], only?: string) {
  const active = getState().activeFrameId;
  for (const fid of frames.keys()) if (!only || fid === only) sendToFrame(fid, 'multi', { ids, linked: fid !== active });
}

/** Amber dashed outlines for elements that use a design-system token (`data-oc` keys and/or source ids). */
export function highlightTokenDependents(opts: { keys?: string[]; ids?: string[]; label?: string } | null) {
  if (!opts) {
    sendToPreview('highlight-token', { keys: [], ids: [], label: '' });
    return;
  }
  sendToPreview('highlight-token', {
    keys: opts.keys ?? [],
    ids: opts.ids ?? [],
    label: opts.label ?? '',
  });
}

/** Mirrors a selection made in one frame into all the others. */
export function sendLinkedSelect(exceptId: string, id: string | null) {
  for (const fid of frames.keys()) if (fid !== exceptId) sendToFrame(fid, 'select', { id, linked: true });
}

/** Asks the bridge for layout boxes of an element's subtree (build overlay). */
export function measureSubtree(frameId: string, elementId: string | null): Promise<{ boxes: Array<{ x: number; y: number; width: number; height: number; padding?: { top: number; right: number; bottom: number; left: number }; kind: string; depth: number }> }> {
  const requestId = `measure-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return new Promise((resolve) => {
    const done = (payload: { boxes?: unknown }) => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve({ boxes: Array.isArray(payload?.boxes) ? (payload.boxes as never[]) : [] });
    };
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.source === 'oc-bridge' && msg.type === 'measure-subtree' && msg.requestId === requestId) done(msg.payload ?? {});
    };
    const timer = setTimeout(() => done({ boxes: [] }), 2000);
    window.addEventListener('message', onMessage);
    sendToFrame(frameId, 'measure-subtree', { requestId, id: elementId });
  });
}

/** The preview is cross-origin, so ask its bridge to reload; resetting src covers a page whose bridge is gone. */
export function reloadFrame(id: string) {
  const el = frames.get(id);
  if (!el) return;
  sendToFrame(id, 'reload');
  const src = el.src;
  const timer = setTimeout(() => {
    el.src = 'about:blank';
    el.src = src;
  }, 1500);
  const onLoad = () => clearTimeout(timer);
  el.addEventListener('load', onLoad, { once: true });
}
