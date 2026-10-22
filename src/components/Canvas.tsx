import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Box,
  CirclePause,
  Code2,
  Copy,
  CornerLeftUp,
  Heading,
  LayoutTemplate,
  MoveVertical,
  PackageOpen,
  Pencil,
  RefreshCw,
  Ruler,
  Sparkles,
  TextCursorInput,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  breakpointFor,
  PRESETS,
  screenToWorld,
  snapMove,
  snapResize,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  type FrameLayout,
  type Guide,
} from '../../shared/canvas';
import type { Breakpoint } from '../../shared/types';
import {
  cancelInstall,
  importDroppedFiles,
  insertElement,
  insertImages,
  installDependencies,
  moveSelected,
  refreshSourceInfo,
  removeSelected,
  restartPreview,
  revealInCode,
  selectElement,
} from '../lib/actions';
import { frameIdOf, registerFrame, sendLinkedSelect, sendMulti, sendToFrame, sendToPreview } from '../lib/bridge';
import {
  applyPreset,
  deleteFrame,
  displayRect,
  duplicateFrame,
  fitAll,
  fitSelection,
  layoutRedo,
  layoutUndo,
  moveFrame,
  reloadFrame,
  renameFrame,
  resizeFrame,
  setActiveFrame,
  setCamera,
  setStageSize,
  setSyncScroll,
  toggleFitPage,
  zoomBy,
  zoomToLevel,
} from '../lib/canvas';
import { cancelInlineEdit, commitInlineEdit, dismissInlineNotice, editSelectedText, INLINE_TAGS, requestInlineEdit, stopInlineEdit } from '../lib/inline-edit';
import { handleShortcut } from '../lib/shortcuts';
import { pageUrl, setRouteValues } from '../lib/pages';
import { routeParams } from '../../shared/source/routes';
import { Dock } from './Dock';
import { getState, pageOf, setState, useStore, type FrameRuntime, type Selection, type TreeNode } from '../lib/store';
import { StateCard } from '../ui/Canvas.jsx';
import { CanvasNav, FrameChrome, FrameRename, Guides, Minimap, SelectionBar, SizeTip, Stage, WorldFrame } from '../ui/FreeCanvas.jsx';
import { BuildOverlay, type SubtreeBox } from './BuildOverlay';
import { measureSubtree } from '../lib/bridge';
import { variantLetter } from '../../shared/variants';
import { Button, IconButton, Menu, MenuItem, Notice } from '../ui/primitives.jsx';

export const SCOPE_LABEL: Record<Breakpoint, string> = { base: 'Base', tablet: 'Tablet', mobile: 'Mobile' };

const EMPTY_RUNTIME: FrameRuntime = { ready: false, contentHeight: 0, tree: [] };
const setRuntime = (id: string, patch: Partial<FrameRuntime>) =>
  setState((s) => ({ frameRuntime: { ...s.frameRuntime, [id]: { ...EMPTY_RUNTIME, ...s.frameRuntime[id], ...patch } } }));

/* ---------- Space-to-pan (also reported by focused preview frames) ---------- */

let spaceListeners: ((down: boolean) => void)[] = [];
const setSpace = (down: boolean) => spaceListeners.forEach((fn) => fn(down));

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || !!target.closest('.monaco-editor'));
}

function useSpaceHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    spaceListeners.push(setHeld);
    const down = (e: KeyboardEvent) => {
      if (e.key !== ' ' || isTyping(e.target) || getState().mode !== 'visual') return;
      e.preventDefault();
      setHeld(true);
    };
    const up = (e: KeyboardEvent) => e.key === ' ' && setHeld(false);
    const blur = () => setHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      spaceListeners = spaceListeners.filter((fn) => fn !== setHeld);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return held;
}

/* ---------- Messages from the preview frames ---------- */

// Set when a frame becomes active because the user clicked inside it, so its fresh selection isn't overwritten.
let activatedByFrame = false;

function useBridgeMessages(stageRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.pendingSelectId && state.pendingSelectId !== prev.pendingSelectId) {
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => setState({ pendingSelectId: null }), 10000);
      }
      if (state.activeFrameId !== prev.activeFrameId) {
        stopInlineEdit(true);
        const tree = (state.activeFrameId && state.frameRuntime[state.activeFrameId]?.tree) || [];
        setState({ domTree: tree, hoverUid: null });
        if (activatedByFrame) activatedByFrame = false;
        else if (state.selection) sendToPreview('select', { id: state.selection.id, scroll: false, additive: 'keep' });
      }
      if (state.camera.zoom !== prev.camera.zoom) sendToPreview('zoom', { zoom: state.camera.zoom });
      if (state.multiSelect !== prev.multiSelect || state.activeFrameId !== prev.activeFrameId) {
        sendMulti(state.multiSelect.map((m) => m.id));
      }
    });

    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.source !== 'oc-bridge') return;
      const fid = frameIdOf(event.source);
      if (!fid) return;
      const state = getState();
      const active = state.activeFrameId === fid;
      switch (msg.type) {
        case 'ready': {
          sendToFrame(fid, 'mode', { mode: state.interact ? 'interact' : 'select' });
          sendToFrame(fid, 'zoom', { zoom: state.camera.zoom });
          const id = state.pendingSelectId ?? state.selection?.id;
          if (id) sendToFrame(fid, 'select', active ? { id, scroll: false, additive: 'keep' } : { id, linked: true });
          if (state.multiSelect.length) sendMulti(state.multiSelect.map((m) => m.id), fid);
          setRuntime(fid, { ready: true });
          break;
        }
        case 'location': {
          const path = (msg.payload as { path?: unknown })?.path;
          if (typeof path === 'string' && path.startsWith('/') && path.length < 300 && !state.visitedPaths.includes(path)) {
            setState({ visitedPaths: [...state.visitedPaths, path].slice(-50) });
          }
          break;
        }
        case 'tree': {
          const tree = msg.payload as TreeNode[];
          setRuntime(fid, { tree });
          if (active) setState({ domTree: tree });
          if (state.pendingSelectId) sendToFrame(fid, 'select', active ? { id: state.pendingSelectId, scroll: true } : { id: state.pendingSelectId, linked: true });
          break;
        }
        case 'select': {
          // Variant preview frames are read-only: show hover/selection inside the iframe only.
          if (fid.startsWith('variant:')) return;
          // A click inside another frame makes it active; anything else it reports is stale (it just lost focus).
          const payload = msg.payload as Selection | null;
          if (!active) {
            if (!msg.user) return;
            activatedByFrame = true;
            setState({ activeFrameId: fid, domTree: getState().frameRuntime[fid]?.tree ?? [] });
          }
          if (!payload) {
            if (state.pendingSelectId && active) return;
            setState({ selection: null, sourceInfo: null, sourceError: null, multiSelect: [] });
            sendLinkedSelect(fid, null);
            return;
          }
          const prevSel = state.selection;
          if (msg.additive === 'toggle' && prevSel) {
            const extras = state.multiSelect;
            if (prevSel.id === payload.id) {
              // Shift-clicking the primary again drops it and promotes the last other member.
              const next = extras[extras.length - 1];
              if (next) {
                setState({ multiSelect: extras.slice(0, -1) });
                sendToFrame(fid, 'select', { id: next.id, uid: next.uid, additive: 'keep' });
              }
              return;
            }
            if (extras.some((e) => e.id === payload.id)) {
              setState({ multiSelect: extras.filter((e) => e.id !== payload.id) });
              sendToFrame(fid, 'select', { id: prevSel.id, uid: prevSel.uid, additive: 'keep' });
              return;
            }
            setState({ multiSelect: [...extras, { id: prevSel.id, uid: prevSel.uid, name: prevSel.name }] });
          } else if (msg.additive !== 'keep' && (msg.user || prevSel?.id !== payload.id) && state.multiSelect.length) {
            setState({ multiSelect: [] });
          }
          const changed = state.selection?.id !== payload.id || !active;
          setState({ selection: payload, pendingSelectId: state.pendingSelectId === payload.id ? null : state.pendingSelectId });
          if (changed) sendLinkedSelect(fid, payload.id);
          if (state.selection?.id !== payload.id) {
            setState({ sourceInfo: null, sourceError: null });
            void refreshSourceInfo();
          }
          break;
        }
        case 'rect': {
          const sel = state.selection;
          if (active && sel && sel.id === msg.payload.id) setState({ selection: { ...sel, rect: msg.payload.rect } });
          break;
        }
        case 'hover':
          if (active) setState({ hoverUid: msg.payload?.uid ?? null });
          break;
        case 'key':
          handleShortcut(msg.payload.key, msg.payload.meta, msg.payload.shift, msg.payload.alt);
          break;
        case 'size':
          if (state.frameRuntime[fid]?.contentHeight !== msg.payload.height) setRuntime(fid, { contentHeight: msg.payload.height });
          break;
        case 'scroll':
          if (state.syncScroll) for (const f of state.frames) if (f.id !== fid) sendToFrame(f.id, 'scrollTo', { ratio: msg.payload.ratio });
          break;
        case 'wheel': {
          const frame = state.frames.find((f) => f.id === fid);
          if (!frame || !stageRef.current) break;
          const { camera } = state;
          const anchor = worldToScreen(camera, { x: frame.x + msg.payload.clientX, y: frame.y + msg.payload.clientY });
          setCamera(zoomAt(camera, wheelZoomFactor(msg.payload.deltaY, msg.payload.deltaMode), anchor));
          break;
        }
        case 'space':
          setSpace(!!msg.payload.down);
          break;
        case 'filedrag':
          window.dispatchEvent(new Event('oc-filedrag'));
          break;
        case 'inlineEditRequest':
          if (msg.payload.eligible) void requestInlineEdit(fid, msg.payload.id, msg.payload.uid, msg.payload.tag);
          break;
        case 'inlineEditCommit':
          void commitInlineEdit(fid, msg.payload.id, msg.payload.text);
          break;
        case 'inlineEditCancel':
          cancelInlineEdit(fid, !!msg.payload?.stale);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      unsubscribe();
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [stageRef]);
}

/* ---------- Status cards ---------- */

function StatusCard() {
  const status = useStore((s) => s.previewStatus);
  const project = useStore((s) => s.project)!;
  const installing = useStore((s) => s.installing);
  const installLog = useStore((s) => s.installLog);
  const vite = project.canPreview;

  if (installing) {
    return (
      <StateCard busy title="Installing dependencies…" log={installLog ? installLog.slice(-1500) : undefined} actions={<Button onClick={() => void cancelInstall()}>Cancel</Button>}>
        Running {project.packageManager} install in the project folder.
      </StateCard>
    );
  }
  if (status.state === 'starting') {
    return (
      <StateCard busy title="Starting preview…">
        Launching a local development server for this project.
      </StateCard>
    );
  }
  if (status.state === 'error') {
    const needsInstall = vite && ((!project.hasNodeModules && !project.managedPreview) || project.missingDependencies.length > 0);
    return (
      <StateCard
        icon={<AlertTriangle size={18} />}
        title="Preview unavailable"
        log={status.log ? status.log.slice(-2000) : undefined}
        actions={
          <>
            {needsInstall && (
              <Button variant="primary" onClick={() => void installDependencies()}>
                Install dependencies
              </Button>
            )}
            {vite && (
              <Button icon={<RefreshCw size={13} />} onClick={() => void restartPreview()}>
                Retry
              </Button>
            )}
            <Button onClick={() => setState({ mode: 'code' })}>Open code view</Button>
          </>
        }
      >
        {status.error}
      </StateCard>
    );
  }
  return (
    <StateCard
      icon={<CirclePause size={18} />}
      title="Preview stopped"
      actions={
        vite && (
          <Button variant="primary" onClick={() => void restartPreview()}>
            Start preview
          </Button>
        )
      }
    >
      {vite ? 'Start the development server to see this project.' : (project.warnings[0] ?? 'This project type cannot be previewed yet.')}
    </StateCard>
  );
}

function EmptyPageCard() {
  return (
    <StateCard
      icon={<LayoutTemplate size={18} />}
      title="This page is empty"
      actions={
        <>
          <Button variant="primary" icon={<LayoutTemplate size={13} />} onClick={() => void insertElement('section')}>
            Add section
          </Button>
          <Button icon={<Heading size={13} />} onClick={() => void insertElement('heading')}>
            Heading
          </Button>
          <Button icon={<Box size={13} />} onClick={() => void insertElement('div')}>
            Container
          </Button>
        </>
      }
    >
      Add your first element here, or use the tools on the left to insert text, images, buttons and layouts.
    </StateCard>
  );
}

/* ---------- Frame menu ---------- */

/** Shown inside a frame whose page has dynamic segments, until each one has an example value. */
function RouteValuesForm({ frame, route }: { frame: FrameLayout; route: string }) {
  const params = routeParams(route);
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...frame.routeValues }));
  return (
    <form
      className="route-values"
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        setRouteValues(frame.id, values);
      }}
    >
      <strong>This page needs an example value</strong>
      <span className="muted">
        <code>{route}</code> is a dynamic route. Enter {params.length === 1 ? 'a value' : 'values'} to preview it, for example a real slug from your content.
      </span>
      {params.map((name) => (
        <label key={name} className="route-values__field">
          <span>{name}</span>
          <input className="input" value={values[name] ?? ''} placeholder={`Example ${name}`} onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))} />
        </label>
      ))}
      <Button type="submit" variant="primary" disabled={params.some((n) => !(values[n] ?? '').trim())}>
        Preview this page
      </Button>
    </form>
  );
}

function FrameMenu({ frame, onClose, onRename }: { frame: FrameLayout; onClose: () => void; onRename: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [custom, setCustom] = useState({ width: String(frame.width), height: String(frame.height) });
  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('pointerdown', onDown));
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const applyCustom = () => {
    const w = Number(custom.width);
    const h = Number(custom.height);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      onClose();
      resizeFrame(frame.id, w, h, 'Set custom size');
    }
  };
  return (
    <div ref={ref} className="frame-menu" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <Menu style={{ right: 0, top: 'calc(100% + 6px)', minWidth: 220 }}>
        <MenuItem icon={<Pencil size={14} />} onClick={run(onRename)}>
          Rename
        </MenuItem>
        <MenuItem icon={<Copy size={14} />} onClick={run(() => duplicateFrame(frame.id))}>
          Duplicate
        </MenuItem>
        {frame.routeValues && Object.keys(frame.routeValues).length > 0 && (
          <MenuItem icon={<Pencil size={14} />} onClick={run(() => setRouteValues(frame.id, {}))}>
            Change example values
          </MenuItem>
        )}
        <div className="menu-sep" />
        <div className="menu-title">Size</div>
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((p) => (
          <MenuItem key={p} icon={<Ruler size={14} />} hint={`${PRESETS[p].width} × ${PRESETS[p].height}`} aria-checked={frame.preset === p} onClick={run(() => applyPreset(frame.id, p))}>
            {PRESETS[p].name}
          </MenuItem>
        ))}
        <form
          className="frame-menu__custom"
          onSubmit={(e) => {
            e.preventDefault();
            applyCustom();
          }}
        >
          <input className="frame-menu__num" aria-label="Custom width" inputMode="numeric" value={custom.width} onChange={(e) => setCustom((c) => ({ ...c, width: e.target.value }))} />
          <span>×</span>
          <input className="frame-menu__num" aria-label="Custom height" inputMode="numeric" value={custom.height} onChange={(e) => setCustom((c) => ({ ...c, height: e.target.value }))} />
          <Button size="sm" type="submit">
            Set
          </Button>
        </form>
        <MenuItem icon={<MoveVertical size={14} />} hint={frame.fitPage ? 'On' : 'Off'} onClick={run(() => toggleFitPage(frame.id))}>
          Fit page height
        </MenuItem>
        <div className="menu-sep" />
        <MenuItem icon={<RefreshCw size={14} />} onClick={run(() => reloadFrame(frame.id))}>
          Reload
        </MenuItem>
        <MenuItem className="menu-item is-danger" icon={<Trash2 size={14} />} disabled={getState().frames.length < 2} onClick={run(() => deleteFrame(frame.id))}>
          Delete frame
        </MenuItem>
      </Menu>
    </div>
  );
}

/* ---------- Contextual selection actions ---------- */

function SelectionActions({ frame, height }: { frame: FrameLayout; height: number }) {
  const selection = useStore((s) => s.selection);
  const sourceInfo = useStore((s) => s.sourceInfo);
  const camera = useStore((s) => s.camera);
  const editable = useStore((s) => s.project?.editable ?? false);
  const [ai, setAi] = useState(false);
  if (!selection) return null;
  const r = selection.rect;
  if (r.y + r.height < 0 || r.y > height) return null;
  const top = worldToScreen(camera, { x: frame.x + Math.max(r.x, 0), y: frame.y + Math.max(r.y, 0) });
  const bottom = worldToScreen(camera, { x: 0, y: frame.y + Math.min(r.y + r.height, height) });
  const frameTop = worldToScreen(camera, { x: 0, y: frame.y }).y;
  // Flip below when the bar would collide with the canvas edge or the frame's label above it.
  const below = top.y < 64 || top.y - 40 < frameTop + 4;
  const canEditText = INLINE_TAGS.has(selection.tag) && !!sourceInfo?.textEditable && editable;
  return (
    <SelectionBar x={top.x} y={below ? bottom.y + 8 : top.y - 40} below={below}>
      <IconButton size="sm" label="Select parent" disabled={!selection.parentId} onClick={() => selection.parentId && selectElement(selection.parentId)}>
        <CornerLeftUp size={13} />
      </IconButton>
      {canEditText && (
        <IconButton size="sm" label="Edit text (Enter)" onClick={editSelectedText}>
          <TextCursorInput size={13} />
        </IconButton>
      )}
      <IconButton size="sm" label="Move up (Alt+↑)" disabled={!editable} onClick={() => void moveSelected('up')}>
        <ArrowUp size={13} />
      </IconButton>
      <IconButton size="sm" label="Move down (Alt+↓)" disabled={!editable} onClick={() => void moveSelected('down')}>
        <ArrowDown size={13} />
      </IconButton>
      <IconButton size="sm" label="Open in code" disabled={!sourceInfo} onClick={() => sourceInfo && revealInCode(sourceInfo.file, sourceInfo.line)}>
        <Code2 size={13} />
      </IconButton>
      <span className="selection-bar__ai">
        <IconButton size="sm" label="AI edit" active={ai} onClick={() => setAi((v) => !v)}>
          <Sparkles size={13} />
        </IconButton>
        {ai && (
          <Menu style={{ left: 0, top: 'calc(100% + 6px)', width: 260 }}>
            <div style={{ padding: 6, lineHeight: 1.5 }}>
              <div className="menu-title" style={{ padding: '0 0 6px' }}>
                AI edit
              </div>
              <textarea className="textarea" placeholder="Describe a change…" disabled />
              <p className="muted" style={{ margin: '6px 0 0' }}>
                AI editing is not connected in this build. Visual and code edits work without it.
              </p>
            </div>
          </Menu>
        )}
      </span>
      <IconButton size="sm" label="Delete (Del)" className="is-danger" disabled={!editable} onClick={() => void removeSelected()}>
        <Trash2 size={13} />
      </IconButton>
    </SelectionBar>
  );
}

/* ---------- Canvas ---------- */

type Manip =
  | { kind: 'move'; id: string; startX: number; startY: number; originX: number; originY: number; x: number; y: number; moved: boolean }
  | { kind: 'resize'; id: string; edge: 'e' | 's' | 'se'; startX: number; startY: number; originW: number; originH: number; width: number; height: number; tipX: number; tipY: number };

export function Canvas({ hidden }: { hidden: boolean }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const status = useStore((s) => s.previewStatus);
  const project = useStore((s) => s.project)!;
  const frames = useStore((s) => s.frames);
  const projectConfig = useStore((s) => s.projectConfig);
  const activeFrameId = useStore((s) => s.activeFrameId);
  const camera = useStore((s) => s.camera);
  const runtime = useStore((s) => s.frameRuntime);
  const variants = useStore((s) => s.variants);
  const variantHighlightId = useStore((s) => s.variantHighlightId);
  const build = useStore((s) => s.build);
  const [buildBoxes, setBuildBoxes] = useState<SubtreeBox[]>([]);
  const interact = useStore((s) => s.interact);
  const tool = useStore((s) => s.tool);
  const syncScroll = useStore((s) => s.syncScroll);
  const canLayoutUndo = useStore((s) => s.layoutPast.length > 0);
  const canLayoutRedo = useStore((s) => s.layoutFuture.length > 0);
  const inlineNotice = useStore((s) => s.inlineNotice);
  const inlineEditing = useStore((s) => s.inlineEditing);
  const space = useSpaceHeld();
  const [manip, setManip] = useState<Manip | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [panning, setPanning] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [fileDrag, setFileDrag] = useState(false);

  useBridgeMessages(stageRef);

  useEffect(() => {
    if (build.phase !== 'padding' && build.phase !== 'layout' && build.phase !== 'skeleton') {
      setBuildBoxes([]);
      return;
    }
    const frameId = build.frameId || activeFrameId;
    if (!frameId || frameId.startsWith('variant:')) return;
    let cancelled = false;
    void measureSubtree(frameId, build.elementId).then((result) => {
      if (!cancelled) setBuildBoxes(result.boxes as SubtreeBox[]);
    });
    return () => {
      cancelled = true;
    };
  }, [build.phase, build.elementId, build.frameId, build.callId, activeFrameId]);

  // Files dragged from the OS: frames forward 'filedrag' because their documents swallow the drag events,
  // then an overlay above the frames receives the drop.
  useEffect(() => {
    const show = () => getState().previewStatus.state === 'running' && getState().project?.editable && setFileDrag(true);
    const onEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files') && stageRef.current?.contains(e.target as Node)) show();
    };
    const hide = () => setFileDrag(false);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('oc-filedrag', show);
    window.addEventListener('drop', hide);
    window.addEventListener('dragend', hide);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('oc-filedrag', show);
      window.removeEventListener('drop', hide);
      window.removeEventListener('dragend', hide);
    };
  }, []);

  const onFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setFileDrag(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const result = await importDroppedFiles(files, 'public');
    if (result) await insertImages(result);
  };

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setStage({ width: el.clientWidth, height: el.clientHeight });
      setStageSize(el.clientWidth, el.clientHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (status.state !== 'running') setState({ domTree: [], selection: null, sourceInfo: null, frameRuntime: {} });
  }, [status.state]);

  // Wheel pans; Ctrl/Cmd+wheel and pinch zoom around the cursor. Needs a non-passive listener.
  useEffect(() => {
    const el = stageRef.current;
    const root = el?.parentElement;
    if (!el || !root) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as Element | null;
      const inDock = !!target?.closest?.('.dock');
      // Plain wheel over the dock scrolls its panels; Ctrl+wheel there zooms the canvas instead of the app.
      if (!(target && el.contains(target)) && !(inDock && (e.ctrlKey || e.metaKey))) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const { camera: cam } = getState();
      if (e.ctrlKey || e.metaKey) {
        setCamera(zoomAt(cam, wheelZoomFactor(e.deltaY, e.deltaMode), { x: e.clientX - box.left, y: e.clientY - box.top }));
      } else {
        const unit = e.deltaMode === 1 ? 16 : 1;
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        setCamera({ ...cam, x: cam.x - dx * unit, y: cam.y - dy * unit });
      }
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, []);

  const running = status.state === 'running';
  const activeFrame = frames.find((f) => f.id === activeFrameId) ?? frames[0];
  const activeTree = (activeFrame && runtime[activeFrame.id]?.tree) || [];
  const isEmpty = running && activeTree.length === 1 && activeTree[0].children.length === 0;

  const effective = (f: FrameLayout): FrameLayout => {
    if (!manip || manip.id !== f.id) return f;
    return manip.kind === 'move' ? { ...f, x: manip.x, y: manip.y } : { ...f, width: manip.width, height: manip.height };
  };
  const rectOf = (f: FrameLayout) => displayRect(effective(f), runtime[f.id]);
  const scopeOf = (width: number) => breakpointFor(width, project.breakpoints);

  /* Panning with hand tool, Space, or middle mouse; clicking empty canvas clears the selection. */
  const onStagePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const onBackground = target.classList.contains('stage__viewport') || target.classList.contains('stage__dots') || target.classList.contains('stage__capture') || target.classList.contains('stage__chrome');
    const wantsPan = e.button === 1 || (e.button === 0 && (tool === 'hand' || space));
    if (!wantsPan && !onBackground) return;
    if (!wantsPan) {
      if (e.button === 0 && !interact && getState().selection) selectElement(null);
      return;
    }
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, cam: getState().camera };
    setPanning(true);
    const move = (ev: PointerEvent) => setCamera({ ...start.cam, x: start.cam.x + ev.clientX - start.x, y: start.cam.y + ev.clientY - start.y });
    const up = () => {
      setPanning(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const others = (id: string) => frames.filter((f) => f.id !== id).map((f) => displayRect(f, runtime[f.id]));

  const startMove = (frame: FrameLayout) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || renaming === frame.id) return;
    e.stopPropagation();
    const initial: Manip = { kind: 'move', id: frame.id, startX: e.clientX, startY: e.clientY, originX: frame.x, originY: frame.y, x: frame.x, y: frame.y, moved: false };
    let current = initial;
    const move = (ev: PointerEvent) => {
      const zoom = getState().camera.zoom;
      const dx = (ev.clientX - initial.startX) / zoom;
      const dy = (ev.clientY - initial.startY) / zoom;
      if (!current.moved && Math.hypot(ev.clientX - initial.startX, ev.clientY - initial.startY) < 3) return;
      const rect = { ...displayRect(frame, getState().frameRuntime[frame.id]), x: initial.originX + dx, y: initial.originY + dy };
      const snapped = snapMove(rect, others(frame.id), 6 / zoom, !ev.altKey);
      current = { ...initial, x: snapped.x, y: snapped.y, moved: true };
      setManip(current);
      setGuides(snapped.guides);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setManip(null);
      setGuides([]);
      if (current.kind === 'move' && current.moved) moveFrame(frame.id, current.x, current.y);
      setActiveFrame(frame.id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startResize = (frame: FrameLayout) => (e: ReactPointerEvent<HTMLDivElement>, edge: 'e' | 's' | 'se') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setActiveFrame(frame.id);
    const box = stageRef.current!.getBoundingClientRect();
    const shown = displayRect(frame, getState().frameRuntime[frame.id]);
    let current: Manip = { kind: 'resize', id: frame.id, edge, startX: e.clientX, startY: e.clientY, originW: frame.width, originH: frame.height, width: frame.width, height: frame.height, tipX: 0, tipY: 0 };
    const move = (ev: PointerEvent) => {
      const zoom = getState().camera.zoom;
      const w = edge === 's' ? frame.width : frame.width + (ev.clientX - e.clientX) / zoom;
      const h = edge === 'e' ? frame.height : frame.height + (ev.clientY - e.clientY) / zoom;
      const snapped = snapResize({ x: frame.x, y: frame.y, width: w, height: edge === 'e' ? shown.height : h }, others(frame.id), 6 / zoom, !ev.altKey);
      current = { ...(current as Extract<Manip, { kind: 'resize' }>), width: snapped.width, height: edge === 'e' ? frame.height : snapped.height, tipX: ev.clientX - box.left + 14, tipY: ev.clientY - box.top + 14 };
      setManip(current);
      setGuides(snapped.guides.filter((g) => (edge === 'e' ? g.axis === 'x' : edge === 's' ? g.axis === 'y' : true)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setManip(null);
      setGuides([]);
      if (current.kind === 'resize') resizeFrame(frame.id, current.width, current.height);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const showShadow = camera.zoom >= 0.3;
  const dots = Math.max(0, Math.min(1, (camera.zoom - 0.15) / 0.35));
  const screenRect = (f: FrameLayout) => {
    const r = rectOf(f);
    const p = worldToScreen(camera, r);
    return { x: p.x, y: p.y, width: r.width * camera.zoom, height: r.height * camera.zoom };
  };
  const toScreenGuide = (g: Guide) =>
    g.axis === 'x'
      ? { axis: g.axis, at: g.at * camera.zoom + camera.x, from: g.from * camera.zoom + camera.y, to: g.to * camera.zoom + camera.y }
      : { axis: g.axis, at: g.at * camera.zoom + camera.y, from: g.from * camera.zoom + camera.x, to: g.to * camera.zoom + camera.x };

  const resizing = manip?.kind === 'resize' ? manip : null;
  const viewWorld = stage.width ? { ...screenToWorld(camera, { x: 0, y: 0 }), width: stage.width / camera.zoom, height: stage.height / camera.zoom } : { x: 0, y: 0, width: 1, height: 1 };

  const notices = (
    <>
      {running && project.missingDependencies.length > 0 && (
        <Notice
          icon={<PackageOpen size={15} />}
          action={
            <Button variant="primary" size="sm" onClick={() => void installDependencies()}>
              Install dependencies
            </Button>
          }
        >
          Not installed: <strong>{project.missingDependencies.join(', ')}</strong>. Imports of these packages will fail in the preview.
        </Notice>
      )}
      {inlineNotice && (
        <Notice
          icon={<TextCursorInput size={15} />}
          action={
            <span style={{ display: 'flex', gap: 4 }}>
              {inlineNotice.file && (
                <Button
                  size="sm"
                  icon={<Code2 size={13} />}
                  onClick={() => {
                    dismissInlineNotice();
                    revealInCode(inlineNotice.file!, inlineNotice.line ?? 1);
                  }}
                >
                  Open in code
                </Button>
              )}
              <IconButton size="sm" label="Dismiss" onClick={dismissInlineNotice}>
                <X size={13} />
              </IconButton>
            </span>
          }
        >
          {inlineNotice.message}
        </Notice>
      )}
    </>
  );

  return (
    <Stage
      style={hidden ? { display: 'none' } : undefined}
      className={manip ? 'is-manipulating' : undefined}
      stageRef={stageRef}
      camera={camera}
      dots={dots}
      tool={space ? 'hand' : tool}
      panning={panning}
      onPointerDown={onStagePointerDown}
      notice={(inlineNotice || (running && project.missingDependencies.length > 0)) && notices}
      overlay={(!running || isEmpty) && !interact ? running ? <EmptyPageCard /> : <StatusCard /> : undefined}
      world={
        running && (
          <>
            {frames.map((f) => {
              const r = rectOf(f);
              const eff = effective(f);
              const page = pageOf(f, { projectConfig });
              const src = pageUrl(status.url!, page, f.routeValues);
              return (
                <WorldFrame key={f.id} x={r.x} y={r.y} width={r.width} height={r.height} active={f.id === activeFrame?.id} shadow={showShadow}>
                  {src === null ? (
                    <RouteValuesForm frame={f} route={page!.path} />
                  ) : (
                    <iframe
                      ref={(el) => registerFrame(f.id, el)}
                      key={src}
                      src={src}
                      title={`Preview: ${f.name}`}
                      data-frame-id={f.id}
                      style={{ width: eff.width, height: r.height }}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                    />
                  )}
                </WorldFrame>
              );
            })}
            {variants
              .filter((v) => v.status === 'ready')
              .map((v, i) => {
                const sourceFrame =
                  frames.find((f) => {
                    const page = pageOf(f, { projectConfig });
                    const file = page?.file;
                    return !!file && (file === v.source.file || v.source.elementId.startsWith(file));
                  }) || frames[0];
                if (!sourceFrame || !status.url) return null;
                const page = pageOf(sourceFrame, { projectConfig });
                const base = rectOf(sourceFrame);
                const gap = 48;
                const y = base.y + base.height + gap + i * (base.height + gap);
                const src = pageUrl(status.url, page, sourceFrame.routeValues, v.id);
                if (!src) return null;
                const fid = `variant:${v.id}`;
                const highlighted = variantHighlightId === v.id;
                return (
                  <div key={fid} className="variant-frame-wrap" style={{ position: 'absolute', left: base.x, top: y - 22, width: base.width, height: base.height + 22, pointerEvents: 'none' }}>
                    <div className={`variant-frame-label${highlighted ? ' is-active' : ''}`} style={{ position: 'relative', left: 0, top: 0 }}>
                      Variant {variantLetter(i)}: {v.label || 'Untitled'}
                    </div>
                    <div style={{ pointerEvents: 'auto', position: 'relative' }}>
                      <WorldFrame x={0} y={0} width={base.width} height={base.height} active={highlighted} shadow={showShadow}>
                        <iframe
                          ref={(el) => registerFrame(fid, el)}
                          key={src}
                          src={src}
                          title={`Variant ${variantLetter(i)}: ${v.label}`}
                          data-frame-id={fid}
                          data-variant={v.id}
                          style={{ width: sourceFrame.width, height: base.height }}
                          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                        />
                      </WorldFrame>
                    </div>
                  </div>
                );
              })}
            {build.phase !== 'idle' &&
              (() => {
                const target = frames.find((f) => f.id === (build.frameId || activeFrameId)) || activeFrame;
                if (!target) return null;
                const r = rectOf(target);
                return <BuildOverlay x={r.x} y={r.y} width={r.width} height={r.height} build={build} boxes={buildBoxes} />;
              })()}
          </>
        )
      }
      chrome={
        <>
          {frames.map((f) => {
            const eff = effective(f);
            const scope = scopeOf(eff.width);
            const rect = screenRect(f);
            return (
              <FrameChrome
                key={f.id}
                rect={rect}
                name={renaming === f.id ? <FrameRename value={f.name} onCommit={(v) => { setRenaming(null); renameFrame(f.id, v); }} onCancel={() => setRenaming(null)} /> : f.name}
                size={`${Math.round(eff.width)} × ${Math.round(rectOf(f).height)}${f.fitPage ? ' · fit' : ''}`}
                scope={SCOPE_LABEL[scope]}
                active={f.id === activeFrame?.id}
                fitPage={f.fitPage}
                onActivate={() => setActiveFrame(f.id)}
                onDragStart={startMove(f)}
                onRename={() => setRenaming(f.id)}
                onResizeStart={startResize(f)}
                menuOpen={menuFor === f.id}
                onMenu={() => setMenuFor((m) => (m === f.id ? null : f.id))}
                menu={menuFor === f.id && <FrameMenu frame={f} onClose={() => setMenuFor(null)} onRename={() => setRenaming(f.id)} />}
              />
            );
          })}
          <Guides lines={guides.map(toScreenGuide)} />
          {resizing && (
            <SizeTip x={resizing.tipX} y={resizing.tipY}>
              {Math.round(resizing.width)} × {Math.round(resizing.edge === 'e' ? rectOf(frames.find((f) => f.id === resizing.id)!).height : resizing.height)} · {SCOPE_LABEL[scopeOf(resizing.width)]}
            </SizeTip>
          )}
          {running && activeFrame && !interact && !manip && !inlineEditing && !panning && <SelectionActions frame={activeFrame} height={rectOf(activeFrame).height} />}
          {fileDrag && (
            <div
              className="stage-drop"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setFileDrag(false)}
              onDrop={(e) => void onFileDrop(e)}
            >
              <span className="stage-drop__label">Drop images to add them {getState().selection ? `inside ${getState().selection!.name}` : 'to the page'}</span>
            </div>
          )}
        </>
      }
      nav={
        <CanvasNav
          zoom={`${Math.round(camera.zoom * 100)}%`}
          onZoomIn={() => zoomBy(1.25)}
          onZoomOut={() => zoomBy(0.8)}
          onReset={() => zoomToLevel(1)}
          onFitAll={fitAll}
          onFitSelection={fitSelection}
          syncScroll={syncScroll}
          onSyncScroll={() => setSyncScroll(!syncScroll)}
          canUndo={canLayoutUndo}
          canRedo={canLayoutRedo}
          onUndo={layoutUndo}
          onRedo={layoutRedo}
          minimapOpen={minimapOpen}
          onToggleMinimap={() => setMinimapOpen((v) => !v)}
          minimap={
            <Minimap
              width={120}
              height={76}
              frames={frames.map((f) => ({ id: f.id, ...rectOf(f), active: f.id === activeFrame?.id }))}
              view={viewWorld}
              onNavigate={(p) => {
                const cam = getState().camera;
                setCamera({ ...cam, x: stage.width / 2 - p.x * cam.zoom, y: stage.height / 2 - p.y * cam.zoom });
              }}
            />
          }
        />
      }
      dock={!hidden && <Dock />}
    />
  );
}
