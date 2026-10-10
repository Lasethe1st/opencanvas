import type { SourceElementInfo } from '../../shared/types';
import { errorMessage, refreshSourceInfo, runEdit } from './actions';
import { api } from './api';
import { reloadFrame, sendToFrame } from './bridge';
import { getState, setState } from './store';

export const INLINE_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'label', 'li']);

const REASONS: Record<string, string> = {
  nested: 'This text contains other elements, such as links or emphasis. Edit it in code so the markup stays intact.',
  expression: 'This text comes from a JavaScript expression, so it can only be changed in code.',
  'self-closing': 'This element has no content in the source to edit.',
};

interface Session {
  frameId: string;
  id: string;
  file: string;
  sourceText: string;
  committing?: boolean;
}

let session: Session | null = null;

function deny(message: string, info?: { file: string; line?: number | null } | null) {
  setState({ inlineNotice: { message, file: info?.file ?? null, line: info?.line ?? null } });
}

/** Why a selected element can't be edited inline, or null when it can. */
export function inlineBlocker(info: SourceElementInfo): string | null {
  if (!INLINE_TAGS.has(info.tag)) return `Inline editing works on headings, paragraphs, links, buttons, labels, list items and spans, not <${info.tag}>.`;
  if (!info.textEditable) return REASONS[info.textReason] ?? REASONS.nested;
  const buffer = getState().buffers[info.file];
  if (buffer && buffer.content !== buffer.saved) return `${info.file} has unsaved changes in the code editor. Save or discard them before editing text on the canvas.`;
  return null;
}

/** A frame asked to edit an element's text: validate against the current source before allowing it. */
export async function requestInlineEdit(frameId: string, id: string, uid: string, tag: string) {
  const state = getState();
  if (session || state.busy || state.interact || !state.project?.editable) return;
  if (!INLINE_TAGS.has(tag)) return;
  let info: SourceElementInfo | { error: string };
  try {
    info = await api.inspect(id);
  } catch (err) {
    deny(errorMessage(err));
    return;
  }
  if ('error' in info) {
    deny(info.error);
    return;
  }
  const blocker = inlineBlocker(info);
  if (blocker) {
    deny(blocker, info);
    return;
  }
  session = { frameId, id, file: info.file, sourceText: info.text ?? '' };
  setState({ inlineEditing: true, inlineNotice: null });
  sendToFrame(frameId, 'inlineEditStart', { id, uid });
}

/** Starts inline editing on the current selection (from the selection bar or Enter). */
export function editSelectedText() {
  const { selection, activeFrameId } = getState();
  if (!selection || !activeFrameId) return;
  void requestInlineEdit(activeFrameId, selection.id, selection.uid, selection.tag);
}

function finish(frameId: string, ok: boolean) {
  session = null;
  setState({ inlineEditing: false });
  sendToFrame(frameId, 'inlineEditResult', { ok });
}

export async function commitInlineEdit(frameId: string, id: string, text: string) {
  const current = session;
  if (!current || current.frameId !== frameId || current.id !== id) {
    finish(frameId, false);
    return;
  }
  current.committing = true;
  // Revalidate: the file may have changed on disk or in the code editor while the caret was in the text.
  const info = await api.inspect(id).catch((err) => ({ error: errorMessage(err) }));
  if ('error' in info) {
    finish(frameId, false);
    deny(info.error);
    return;
  }
  const blocker = inlineBlocker(info);
  if (blocker || (info.text ?? '') !== current.sourceText) {
    finish(frameId, false);
    deny(blocker ?? 'The source changed while you were editing, so your text was not applied. Try again.', info);
    return;
  }
  if (text === info.text) {
    finish(frameId, true);
    return;
  }
  const ok = await runEdit({ type: 'setText', id, text }, 'Edit text');
  finish(frameId, ok);
  if (ok) void refreshSourceInfo();
}

export function cancelInlineEdit(frameId: string, stale = false) {
  if (session?.frameId !== frameId) return;
  const { file } = session;
  session = null;
  setState({ inlineEditing: false });
  if (stale) deny('The page updated while you were editing, so the text was not applied. Try again.', { file });
}

/** Ends any open inline edit (e.g. when switching frames or modes). */
export function stopInlineEdit(commit = true) {
  if (session) sendToFrame(session.frameId, 'inlineEditStop', { commit });
}

/**
 * The file under the caret changed on disk mid-edit (another tool, or a hot reload landing late).
 * The frame's DOM may no longer match React, so drop the draft and reload that frame.
 */
export async function handleExternalChange(paths: string[]) {
  const current = session;
  if (!current || current.committing || !paths.includes(current.file)) return;
  // Watcher events can trail our own earlier writes; only a real change to this element's text matters.
  const info = await api.inspect(current.id).catch(() => null);
  if (session !== current || current.committing) return;
  if (info && !('error' in info) && (info.text ?? '') === current.sourceText) return;
  session = null;
  setState({ inlineEditing: false });
  sendToFrame(current.frameId, 'inlineEditStop', { commit: false });
  setTimeout(() => reloadFrame(current.frameId), 50);
  deny('The file changed while you were editing, so the text was not applied. Try again.', { file: current.file });
}

export function dismissInlineNotice() {
  setState({ inlineNotice: null });
}

export function inlineSessionActive() {
  return !!session;
}
