import { create } from 'zustand';
import { breakpointFor, type Camera, type FrameLayout, type Guide } from '../../shared/canvas';
import type { Breakpoint, FileChange, FileNode, PreviewStatus, ProjectInfo, SourceElementInfo } from '../../shared/types';

export interface TreeNode {
  id: string;
  uid: string;
  tag: string;
  name: string;
  children: TreeNode[];
}

export interface Selection {
  id: string;
  uid: string;
  tag: string;
  name: string;
  parentId: string | null;
  computed: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
}

export interface HistoryEntry {
  label: string;
  changes: FileChange[];
  selectId?: string | null;
}

export interface LayoutEntry {
  label: string;
  frames: FrameLayout[];
  activeFrameId: string | null;
}

/** What each preview frame last reported about itself. */
export interface FrameRuntime {
  ready: boolean;
  contentHeight: number;
  tree: TreeNode[];
}

export interface Buffer {
  content: string;
  saved: string;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  message: string;
}

export type Tool = 'select' | 'hand';
export type LeftTab = 'layers' | 'files' | 'frames';

/** Shown instead of entering inline text editing when the source can't be edited safely. */
export interface InlineNotice {
  message: string;
  file: string | null;
  line: number | null;
}

interface State {
  project: ProjectInfo | null;
  fileTree: FileNode | null;
  activeFile: string | null;
  openFiles: string[];
  buffers: Record<string, Buffer>;
  mode: 'visual' | 'code';
  interact: boolean;
  tool: Tool;
  frames: FrameLayout[];
  activeFrameId: string | null;
  camera: Camera;
  syncScroll: boolean;
  frameRuntime: Record<string, FrameRuntime>;
  guides: Guide[];
  layoutPast: LayoutEntry[];
  layoutFuture: LayoutEntry[];
  previewStatus: PreviewStatus;
  installing: boolean;
  installLog: string;
  domTree: TreeNode[];
  selection: Selection | null;
  sourceInfo: SourceElementInfo | null;
  sourceError: string | null;
  hoverUid: string | null;
  pendingSelectId: string | null;
  inlineEditing: boolean;
  inlineNotice: InlineNotice | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  busy: boolean;
  toasts: Toast[];
  leftTab: LeftTab;
  leftWidth: number;
  rightWidth: number;
  exportOpen: boolean;
  revealLine: { file: string; line: number } | null;
}

export const initialState: State = {
  project: null,
  fileTree: null,
  activeFile: null,
  openFiles: [],
  buffers: {},
  mode: 'visual',
  interact: false,
  tool: 'select',
  frames: [],
  activeFrameId: null,
  camera: { x: 0, y: 0, zoom: 0.25 },
  syncScroll: false,
  frameRuntime: {},
  guides: [],
  layoutPast: [],
  layoutFuture: [],
  previewStatus: { state: 'stopped' },
  installing: false,
  installLog: '',
  domTree: [],
  selection: null,
  sourceInfo: null,
  sourceError: null,
  hoverUid: null,
  pendingSelectId: null,
  inlineEditing: false,
  inlineNotice: null,
  past: [],
  future: [],
  busy: false,
  toasts: [],
  leftTab: readLeftTab(),
  leftWidth: 260,
  rightWidth: 300,
  exportOpen: false,
  revealLine: null,
};

function readLeftTab(): LeftTab {
  try {
    const tab = localStorage.getItem('oc-left-tab');
    return tab === 'files' || tab === 'frames' ? tab : 'layers';
  } catch {
    return 'layers';
  }
}

export const useStore = create<State>(() => initialState);

export const setState = useStore.setState;
export const getState = useStore.getState;

useStore.subscribe((s, prev) => {
  if (s.leftTab !== prev.leftTab) {
    try {
      localStorage.setItem('oc-left-tab', s.leftTab);
    } catch {
      /* storage unavailable */
    }
  }
});

let toastId = 0;
export function toast(message: string, kind: Toast['kind'] = 'info') {
  const id = ++toastId;
  setState((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 6000 : 3200);
}

export function hasUnsaved(state: State = getState()): boolean {
  return Object.values(state.buffers).some((b) => b.content !== b.saved);
}

export function findPath(nodes: TreeNode[], uid: string): TreeNode[] | null {
  for (const node of nodes) {
    if (node.uid === uid) return [node];
    const sub = findPath(node.children, uid);
    if (sub) return [node, ...sub];
  }
  return null;
}

export function activeFrame(state: State = getState()): FrameLayout | null {
  return state.frames.find((f) => f.id === state.activeFrameId) ?? state.frames[0] ?? null;
}

/** The breakpoint scope edits apply to: inferred from the active frame's width. */
export function activeBreakpoint(state: State = getState()): Breakpoint {
  const frame = activeFrame(state);
  if (!frame || !state.project) return 'base';
  return breakpointFor(frame.width, state.project.breakpoints);
}

export function useActiveBreakpoint(): Breakpoint {
  return useStore((s) => activeBreakpoint(s));
}
