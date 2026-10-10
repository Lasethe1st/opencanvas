import {
  clamp,
  defaultLayout,
  duplicateFrame as duplicateLayout,
  fitCamera,
  frameId,
  MAX_FRAME,
  MIN_FRAME,
  normalizeLayout,
  placeFrame,
  presetFrame,
  PRESETS,
  unionRect,
  zoomAt,
  zoomTo,
  type Camera,
  type FrameLayout,
  type FramePreset,
  type Rect,
} from '../../shared/canvas';
import type { ProjectInfo } from '../../shared/types';
import { reloadFrame } from './bridge';
import { getState, setState, toast, useStore, type FrameRuntime } from './store';

const STORAGE_PREFIX = 'oc-canvas:v1:';
const HISTORY_LIMIT = 100;

/* ---------- Stage size (set by the canvas component) ---------- */

let stage = { width: 0, height: 0 };
let fitWhenMeasured = false;

export function setStageSize(width: number, height: number) {
  const first = stage.width === 0 && width > 0;
  stage = { width, height };
  if (first && fitWhenMeasured) {
    fitWhenMeasured = false;
    fitAll();
  }
}

export const stageSize = () => stage;

/* ---------- Persistence ---------- */

export function storageKey(root: string) {
  return STORAGE_PREFIX + root.replace(/\\/g, '/').toLowerCase();
}

export function loadLayout(project: ProjectInfo) {
  let raw: unknown = null;
  try {
    const stored = localStorage.getItem(storageKey(project.root));
    raw = stored ? JSON.parse(stored) : null;
  } catch {
    raw = null;
  }
  const layout = raw ? normalizeLayout(raw, project.breakpoints) : defaultLayout(project.breakpoints);
  setState({
    frames: layout.frames,
    activeFrameId: layout.activeFrameId,
    camera: layout.camera,
    syncScroll: layout.syncScroll,
    layoutPast: [],
    layoutFuture: [],
    frameRuntime: {},
  });
  if (!raw) {
    if (stage.width > 0) fitAll();
    else fitWhenMeasured = true;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
useStore.subscribe((s, prev) => {
  if (!s.project || !s.frames.length) return;
  if (s.frames === prev.frames && s.camera === prev.camera && s.activeFrameId === prev.activeFrameId && s.syncScroll === prev.syncScroll) return;
  if (saveTimer) clearTimeout(saveTimer);
  const root = s.project.root;
  saveTimer = setTimeout(() => {
    const { frames, activeFrameId, camera, syncScroll } = getState();
    try {
      localStorage.setItem(storageKey(root), JSON.stringify({ version: 1, frames, activeFrameId, camera, syncScroll }));
    } catch {
      /* storage full or unavailable: layout simply isn't remembered */
    }
  }, 250);
});

/* ---------- Layout history (separate from source history) ---------- */

/** Replaces the frame list as one undoable layout step. */
export function commitLayout(label: string, frames: FrameLayout[], activeFrameId = getState().activeFrameId) {
  setState((s) => ({
    layoutPast: [...s.layoutPast, { label, frames: s.frames, activeFrameId: s.activeFrameId }].slice(-HISTORY_LIMIT),
    layoutFuture: [],
    frames,
    activeFrameId: frames.some((f) => f.id === activeFrameId) ? activeFrameId : frames[0]?.id ?? null,
  }));
}

export function layoutUndo() {
  const { layoutPast } = getState();
  const entry = layoutPast[layoutPast.length - 1];
  if (!entry) return;
  setState((s) => ({
    layoutPast: s.layoutPast.slice(0, -1),
    layoutFuture: [{ label: entry.label, frames: s.frames, activeFrameId: s.activeFrameId }, ...s.layoutFuture],
    frames: entry.frames,
    activeFrameId: entry.activeFrameId,
  }));
  toast(`Undid layout: ${entry.label}`);
}

export function layoutRedo() {
  const entry = getState().layoutFuture[0];
  if (!entry) return;
  setState((s) => ({
    layoutFuture: s.layoutFuture.slice(1),
    layoutPast: [...s.layoutPast, { label: entry.label, frames: s.frames, activeFrameId: s.activeFrameId }],
    frames: entry.frames,
    activeFrameId: entry.activeFrameId,
  }));
  toast(`Redid layout: ${entry.label}`);
}

/* ---------- Frames ---------- */

/** On-canvas rect of a frame; fit-page frames follow the page height their preview reports. */
export function displayRect(frame: FrameLayout, runtime?: FrameRuntime): Rect {
  const height = frame.fitPage && runtime?.contentHeight ? clamp(runtime.contentHeight, MIN_FRAME.height, MAX_FRAME.height) : frame.height;
  return { x: frame.x, y: frame.y, width: frame.width, height };
}

const rects = () => {
  const { frames, frameRuntime } = getState();
  return frames.map((f) => displayRect(f, frameRuntime[f.id]));
};

const updateFrame = (id: string, patch: Partial<FrameLayout>) => getState().frames.map((f) => (f.id === id ? { ...f, ...patch } : f));

export function setActiveFrame(id: string) {
  if (getState().activeFrameId === id) return;
  setState({ activeFrameId: id });
}

export function addFrame(preset: Exclude<FramePreset, 'custom'>) {
  const { project, frames } = getState();
  const at = placeFrame(rects(), PRESETS[preset]);
  const frame = presetFrame(preset, at, project?.breakpoints);
  commitLayout(`Add ${frame.name} frame`, [...frames, frame], frame.id);
  focusRect(displayRect(frame));
}

export function addCustomFrame(width: number, height: number, name = 'Custom') {
  const size = { width: clamp(Math.round(width), MIN_FRAME.width, MAX_FRAME.width), height: clamp(Math.round(height), MIN_FRAME.height, MAX_FRAME.height) };
  const at = placeFrame(rects(), size);
  const frame: FrameLayout = { id: frameId(), name, ...at, ...size, preset: 'custom', fitPage: false };
  commitLayout(`Add ${name} frame`, [...getState().frames, frame], frame.id);
  focusRect(displayRect(frame));
}

export function duplicateFrame(id: string) {
  const { frames } = getState();
  const frame = frames.find((f) => f.id === id);
  if (!frame) return;
  const copy = { ...duplicateLayout(frame, frames), ...placeFrame(rects(), frame) };
  commitLayout(`Duplicate ${frame.name}`, [...frames, copy], copy.id);
}

export function deleteFrame(id: string) {
  const { frames, activeFrameId } = getState();
  const frame = frames.find((f) => f.id === id);
  if (!frame) return;
  if (frames.length === 1) {
    toast('The canvas needs at least one frame.', 'error');
    return;
  }
  const rest = frames.filter((f) => f.id !== id);
  commitLayout(`Delete ${frame.name}`, rest, activeFrameId === id ? rest[0].id : activeFrameId);
}

export function renameFrame(id: string, name: string) {
  const frame = getState().frames.find((f) => f.id === id);
  const clean = name.trim();
  if (!frame || !clean || clean === frame.name) return;
  commitLayout(`Rename ${frame.name}`, updateFrame(id, { name: clean }));
}

export function resizeFrame(id: string, width: number, height: number, label = 'Resize frame') {
  const w = clamp(Math.round(width), MIN_FRAME.width, MAX_FRAME.width);
  const h = clamp(Math.round(height), MIN_FRAME.height, MAX_FRAME.height);
  const frame = getState().frames.find((f) => f.id === id);
  if (!frame || (frame.width === w && frame.height === h)) return;
  commitLayout(label, updateFrame(id, { width: w, height: h, preset: 'custom' }));
}

export function applyPreset(id: string, preset: Exclude<FramePreset, 'custom'>) {
  const { project } = getState();
  const sized = presetFrame(preset, { x: 0, y: 0 }, project?.breakpoints);
  commitLayout(`Set ${PRESETS[preset].name} size`, updateFrame(id, { width: sized.width, height: sized.height, preset }));
}

export function toggleFitPage(id: string) {
  const frame = getState().frames.find((f) => f.id === id);
  if (!frame) return;
  commitLayout(frame.fitPage ? 'Fixed viewport height' : 'Fit page height', updateFrame(id, { fitPage: !frame.fitPage }));
}

export function moveFrame(id: string, x: number, y: number) {
  const frame = getState().frames.find((f) => f.id === id);
  if (!frame || (frame.x === x && frame.y === y)) return;
  commitLayout(`Move ${frame.name}`, updateFrame(id, { x, y }));
}

export { reloadFrame };

export function setSyncScroll(on: boolean) {
  setState({ syncScroll: on });
}

/* ---------- Camera ---------- */

export function setCamera(camera: Camera) {
  setState({ camera });
}

const center = () => ({ x: stage.width / 2, y: stage.height / 2 });

export function zoomBy(factor: number, anchor = center()) {
  setCamera(zoomAt(getState().camera, factor, anchor));
}

export function zoomToLevel(zoom: number) {
  setCamera(zoomTo(getState().camera, zoom, center()));
}

export function focusRect(rect: Rect, maxZoom = 1) {
  if (!stage.width) return;
  setCamera(fitCamera(rect, stage, 72, maxZoom));
}

export function fitAll() {
  const bounds = unionRect(rects());
  if (bounds) focusRect(bounds);
}

export function fitFrame(id: string) {
  const { frames, frameRuntime } = getState();
  const frame = frames.find((f) => f.id === id);
  if (frame) focusRect(displayRect(frame, frameRuntime[id]));
}

/** Fits the selected element in the active frame, or the active frame when nothing is selected. */
export function fitSelection() {
  const { selection, frames, activeFrameId } = getState();
  const frame = frames.find((f) => f.id === activeFrameId);
  if (!frame) return;
  if (!selection) {
    fitFrame(frame.id);
    return;
  }
  const r = selection.rect;
  focusRect({ x: frame.x + r.x, y: frame.y + r.y, width: Math.max(r.width, 1), height: Math.max(r.height, 1) }, 2);
}
