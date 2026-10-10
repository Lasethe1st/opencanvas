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

/** Mirrors a selection made in one frame into all the others. */
export function sendLinkedSelect(exceptId: string, id: string | null) {
  for (const fid of frames.keys()) if (fid !== exceptId) sendToFrame(fid, 'select', { id, linked: true });
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
