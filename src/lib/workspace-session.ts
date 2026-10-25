/** Soft multi-project sessions: snapshot/hydrate project-scoped UI state without multiplexing Electron. */
import type { AiChatItem } from '../../shared/ai';
import type { AgentGraph } from '../../shared/agent-graph';
import { EMPTY_AGENT_GRAPH } from '../../shared/agent-graph';
import type { BuildState } from '../../shared/build-stages';
import { IDLE_BUILD } from '../../shared/build-stages';
import type { Camera, FrameLayout, Guide } from '../../shared/canvas';
import type { ProjectPagesState } from '../../shared/project-config';
import type { TerminalSession } from '../../shared/terminal';
import type { FileNode, GitStatus, ImportedProject, ProjectInfo, SourceElementInfo, StyleState } from '../../shared/types';
import type { VariantRecord } from '../../shared/variants';
import type { WorkspaceState } from '../../shared/workspace-layout';
import { defaultWorkspace } from '../../shared/workspace-layout';
import type { DockMode, HistoryEntry, InsertPanel, LeftTab, Selection, SelectionItem, Tool, TreeNode } from './store';

export interface OpenProjectTab {
  root: string;
  name: string;
}

export interface ProjectSession {
  root: string;
  name: string;
  project: ProjectInfo;
  fileTree: FileNode | null;
  activeFile: string | null;
  openFiles: string[];
  buffers: Record<string, { content: string; saved: string }>;
  mode: 'visual' | 'code';
  interact: boolean;
  tool: Tool;
  frames: FrameLayout[];
  activeFrameId: string | null;
  camera: Camera;
  syncScroll: boolean;
  frameRuntime: Record<string, { tree?: TreeNode[]; url?: string }>;
  guides: Guide[];
  layoutPast: { frames: FrameLayout[]; activeFrameId: string | null; label: string }[];
  layoutFuture: { frames: FrameLayout[]; activeFrameId: string | null; label: string }[];
  previewStatus: { state: string; [k: string]: unknown };
  installing: boolean;
  installLog: string;
  domTree: TreeNode[];
  selection: Selection | null;
  sourceInfo: SourceElementInfo | null;
  sourceError: string | null;
  hoverUid: string | null;
  multiSelect: SelectionItem[];
  pendingSelectId: string | null;
  inlineEditing: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  leftTab: LeftTab;
  panelsHidden: { left: boolean; right: boolean };
  gitOpen: boolean;
  gitStatus: GitStatus | null;
  insertPanel: InsertPanel | null;
  auditOpen: boolean;
  auditRunning: boolean;
  audit: import('../../shared/types').AuditReport | null;
  styleState: StyleState;
  projectConfig: ProjectPagesState | null;
  dockMode: DockMode | null;
  dockDraft: string;
  aiChat: AiChatItem[];
  aiTurnId: string | null;
  variants: VariantRecord[];
  variantHighlightId: string | null;
  build: BuildState;
  terminalOpen: boolean;
  terminals: TerminalSession[];
  activeTerminal: string | null;
  visitedPaths: string[];
  importSummary: ImportedProject | null;
  agentGraph: AgentGraph;
  workspace: WorkspaceState;
  followAgentNode: boolean;
  selectedAgentNodeId: string | null;
  threeScenes: Record<string, import('../../shared/three').ThreeSceneDoc>;
}

type SnapshotSource = {
  project: ProjectInfo | null;
  buffers?: Record<string, { content: string; saved: string; version?: number }>;
} & Partial<Omit<ProjectSession, 'project' | 'buffers'>>;

/** Capture project-scoped slices so another tab can restore them later. */
export function snapshotSession(s: SnapshotSource): ProjectSession | null {
  if (!s.project) return null;
  const buffers: ProjectSession['buffers'] = {};
  for (const [path, buf] of Object.entries(s.buffers ?? {})) {
    buffers[path] = { content: buf.content, saved: buf.saved };
  }
  return {
    root: s.project.root,
    name: s.project.name,
    project: s.project,
    fileTree: s.fileTree ?? null,
    activeFile: s.activeFile ?? null,
    openFiles: s.openFiles ?? [],
    buffers,
    mode: s.mode ?? 'visual',
    interact: s.interact ?? false,
    tool: s.tool ?? 'select',
    frames: s.frames ?? [],
    activeFrameId: s.activeFrameId ?? null,
    camera: s.camera ?? { x: 0, y: 0, zoom: 0.25 },
    syncScroll: s.syncScroll ?? false,
    frameRuntime: (s.frameRuntime as ProjectSession['frameRuntime']) ?? {},
    guides: s.guides ?? [],
    layoutPast: (s.layoutPast as ProjectSession['layoutPast']) ?? [],
    layoutFuture: (s.layoutFuture as ProjectSession['layoutFuture']) ?? [],
    previewStatus: (s.previewStatus as ProjectSession['previewStatus']) ?? { state: 'stopped' },
    installing: s.installing ?? false,
    installLog: s.installLog ?? '',
    domTree: s.domTree ?? [],
    selection: s.selection ?? null,
    sourceInfo: s.sourceInfo ?? null,
    sourceError: s.sourceError ?? null,
    hoverUid: s.hoverUid ?? null,
    multiSelect: s.multiSelect ?? [],
    pendingSelectId: s.pendingSelectId ?? null,
    inlineEditing: s.inlineEditing ?? false,
    past: s.past ?? [],
    future: s.future ?? [],
    leftTab: s.leftTab ?? 'layers',
    panelsHidden: s.panelsHidden ?? { left: false, right: false },
    gitOpen: s.gitOpen ?? false,
    gitStatus: s.gitStatus ?? null,
    insertPanel: s.insertPanel ?? null,
    auditOpen: s.auditOpen ?? false,
    auditRunning: s.auditRunning ?? false,
    audit: s.audit ?? null,
    styleState: s.styleState ?? 'default',
    projectConfig: s.projectConfig ?? null,
    dockMode: s.dockMode ?? null,
    dockDraft: s.dockDraft ?? '',
    aiChat: s.aiChat ?? [],
    aiTurnId: s.aiTurnId ?? null,
    variants: s.variants ?? [],
    variantHighlightId: s.variantHighlightId ?? null,
    build: s.build ?? IDLE_BUILD,
    terminalOpen: s.terminalOpen ?? false,
    terminals: s.terminals ?? [],
    activeTerminal: s.activeTerminal ?? null,
    visitedPaths: s.visitedPaths ?? [],
    importSummary: s.importSummary ?? null,
    agentGraph: s.agentGraph ?? EMPTY_AGENT_GRAPH,
    workspace: s.workspace ?? defaultWorkspace(null),
    followAgentNode: s.followAgentNode ?? true,
    selectedAgentNodeId: s.selectedAgentNodeId ?? null,
    threeScenes: s.threeScenes ?? {},
  };
}

/** Fields to merge into the store when restoring a warm session. */
export function hydrateSessionPatch(session: ProjectSession): Record<string, unknown> {
  return {
    project: session.project,
    fileTree: session.fileTree,
    activeFile: session.activeFile,
    openFiles: session.openFiles,
    buffers: session.buffers,
    mode: session.mode,
    interact: session.interact,
    tool: session.tool,
    frames: session.frames,
    activeFrameId: session.activeFrameId,
    camera: session.camera,
    syncScroll: session.syncScroll,
    frameRuntime: session.frameRuntime,
    guides: session.guides,
    layoutPast: session.layoutPast,
    layoutFuture: session.layoutFuture,
    previewStatus: session.previewStatus,
    installing: session.installing,
    installLog: session.installLog,
    domTree: session.domTree,
    selection: session.selection,
    sourceInfo: session.sourceInfo,
    sourceError: session.sourceError,
    hoverUid: session.hoverUid,
    multiSelect: session.multiSelect,
    pendingSelectId: session.pendingSelectId,
    inlineEditing: session.inlineEditing,
    past: session.past,
    future: session.future,
    leftTab: session.leftTab,
    panelsHidden: session.panelsHidden,
    gitOpen: session.gitOpen,
    gitStatus: session.gitStatus,
    insertPanel: session.insertPanel,
    auditOpen: session.auditOpen,
    auditRunning: session.auditRunning,
    audit: session.audit,
    styleState: session.styleState,
    projectConfig: session.projectConfig,
    dockMode: session.dockMode,
    dockDraft: session.dockDraft,
    aiChat: session.aiChat,
    aiTurnId: null, // turns don't survive soft switch; agent was reset in main
    variants: session.variants,
    variantHighlightId: session.variantHighlightId,
    build: IDLE_BUILD,
    terminalOpen: session.terminalOpen,
    terminals: [],
    activeTerminal: null,
    visitedPaths: session.visitedPaths,
    importSummary: session.importSummary,
    agentGraph: session.agentGraph,
    workspace: session.workspace,
    followAgentNode: session.followAgentNode,
    selectedAgentNodeId: session.selectedAgentNodeId,
    threeScenes: session.threeScenes ?? {},
    activeProjectRoot: session.root,
  };
}

export function sessionHasUnsaved(session: ProjectSession | null | undefined): boolean {
  if (!session) return false;
  return Object.values(session.buffers).some((b) => b.content !== b.saved);
}

export function upsertTab(tabs: OpenProjectTab[], tab: OpenProjectTab): OpenProjectTab[] {
  const i = tabs.findIndex((t) => t.root === tab.root);
  if (i >= 0) {
    const next = tabs.slice();
    next[i] = tab;
    return next;
  }
  return [...tabs, tab];
}

export function removeTab(tabs: OpenProjectTab[], root: string): OpenProjectTab[] {
  return tabs.filter((t) => t.root !== root);
}

export function pushClosed(closed: string[], root: string, max = 8): string[] {
  return [root, ...closed.filter((r) => r !== root)].slice(0, max);
}

export function reorderTabs(tabs: OpenProjectTab[], from: number, to: number): OpenProjectTab[] {
  if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return tabs;
  const next = tabs.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
