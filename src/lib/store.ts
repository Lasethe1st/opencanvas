import { create } from 'zustand';
import { breakpointFor, type Camera, type FrameLayout, type Guide } from '../../shared/canvas';
import type { AiChatItem, AiStatus } from '../../shared/ai';
import type { PageConfig, ProjectPagesState } from '../../shared/project-config';
import type { TerminalSession } from '../../shared/terminal';
import type { AuditReport, Breakpoint, FileChange, GitStatus, FileNode, ImportedProject, McpStatus, PreviewStatus, ProjectInfo, SourceElementInfo, StyleState } from '../../shared/types';

export interface TreeNode {
  id: string;
  uid: string;
  tag: string;
  name: string;
  children: TreeNode[];
}

export interface SelectionItem {
  id: string;
  uid: string;
  name: string;
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
  /** In-app AI turn; later changes of the same turn are merged into this entry. */
  turnId?: string;
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
  /** The other elements of a multi-selection; `selection` is the primary (last clicked) one. */
  multiSelect: SelectionItem[];
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
  shortcutsOpen: boolean;
  /** Side panels dismissed for focus mode (persisted per project). */
  panelsHidden: { left: boolean; right: boolean };
  settingsOpen: boolean;
  fullPreview: boolean;
  gitOpen: boolean;
  gitStatus: GitStatus | null;
  auditOpen: boolean;
  auditRunning: boolean;
  audit: AuditReport | null;
  /** Which interaction state inspector style edits target. */
  styleState: StyleState;
  mcp: McpStatus | null;
  revealLine: { file: string; line: number } | null;
  /** Pages and design direction from the project's `.opencanvas/project.json`. */
  projectConfig: ProjectPagesState | null;
  /** Open panel of the bottom dock; null when only the bar shows. */
  dockMode: DockMode | null;
  /** What the user is asking for, kept while switching dock modes. */
  dockDraft: string;
  settingsTab: SettingsTab;
  aiStatus: AiStatus | null;
  /** The in-app AI conversation for the open project. */
  aiChat: AiChatItem[];
  /** The AI turn that is running, if any. */
  aiTurnId: string | null;
  terminalOpen: boolean;
  terminals: TerminalSession[];
  activeTerminal: string | null;
  /** Paths the preview has visited this session, as reported by the bridge. */
  visitedPaths: string[];
  /** Shown once after a ZIP import: what OpenCanvas detected. */
  importSummary: ImportedProject | null;
}

export type SettingsTab = 'appearance' | 'ai' | 'mcp';

export type DockMode = 'input' | 'variants' | 'search' | 'direction';

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
  multiSelect: [],
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
  shortcutsOpen: false,
  panelsHidden: { left: false, right: false },
  settingsOpen: false,
  fullPreview: false,
  gitOpen: false,
  gitStatus: null,
  auditOpen: false,
  auditRunning: false,
  audit: null,
  styleState: 'default',
  mcp: null,
  revealLine: null,
  projectConfig: null,
  dockMode: null,
  dockDraft: '',
  settingsTab: 'appearance',
  aiStatus: null,
  aiChat: [],
  aiTurnId: null,
  terminalOpen: readTerminalOpen(),
  terminals: [],
  activeTerminal: null,
  visitedPaths: [],
  importSummary: null,
};

function readTerminalOpen(): boolean {
  try {
    return localStorage.getItem('oc-terminal-open') === '1';
  } catch {
    return false;
  }
}

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

/** The page a frame shows; frames saved before pages existed belong to the first page. */
export function pageOf(frame: FrameLayout | null | undefined, state: Pick<State, 'projectConfig'> = getState()): PageConfig | null {
  const pages = state.projectConfig?.pages ?? [];
  return (frame?.pageId && pages.find((p) => p.id === frame.pageId)) || pages[0] || null;
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
