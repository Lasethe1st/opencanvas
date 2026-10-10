/** Editor-side half of the postMessage channel to the preview iframe. */
let frame: HTMLIFrameElement | null = null;

export function setPreviewFrame(el: HTMLIFrameElement | null) {
  frame = el;
}

export function getPreviewWindow(): Window | null {
  return frame?.contentWindow ?? null;
}

export function sendToPreview(type: string, payload: Record<string, unknown> = {}) {
  frame?.contentWindow?.postMessage({ source: 'oc-editor', type, ...payload }, '*');
}
