import { create } from 'zustand';
import type { Breakpoint, FileChange, FileNode, PreviewStatus, ProjectInfo, SourceElementInfo } from '../../shared/types';

export type Viewport = 'desktop' | 'tablet' | 'mobile';

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

export interface Buffer {
  content: string;
  saved: string;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  message: string;
}

export const VIEWPORT_BREAKPOINT: Record<Viewport, Breakpoint> = { desktop: 'base', tablet: 'tablet', mobile: 'mobile' };

interface State {
  project: ProjectInfo | null;
  fileTree: FileNode | null;
  activeFile: string | null;
  openFiles: string[];
  buffers: Record<string, Buffer>;
  mode: 'visual' | 'code';
  interact: boolean;
  viewport: Viewport;
  zoom: number | 'fit';
  previewStatus: PreviewStatus;
  installing: boolean;
  installLog: string;
  domTree: TreeNode[];
  selection: Selection | null;
  sourceInfo: SourceElementInfo | null;
  sourceError: string | null;
  hoverUid: string | null;
  pendingSelectId: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  busy: boolean;
  toasts: Toast[];
  leftTab: 'files' | 'layers';
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
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
  viewport: 'desktop',
  zoom: 'fit',
  previewStatus: { state: 'stopped' },
  installing: false,
  installLog: '',
  domTree: [],
  selection: null,
  sourceInfo: null,
  sourceError: null,
  hoverUid: null,
  pendingSelectId: null,
  past: [],
  future: [],
  busy: false,
  toasts: [],
  leftTab: 'layers',
  leftWidth: 260,
  rightWidth: 300,
  leftCollapsed: false,
  rightCollapsed: false,
  exportOpen: false,
  revealLine: null,
};

export const useStore = create<State>(() => initialState);

export const setState = useStore.setState;
export const getState = useStore.getState;

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
