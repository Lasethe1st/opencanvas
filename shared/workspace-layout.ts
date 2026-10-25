/**
 * Split-pane workspace layout persisted in `.opencanvas/workspace.json`.
 * v1 limits: at most one live design pane (extra design panes show a placeholder);
 * one Electron project is live at a time (soft multi-project tabs hydrate the rest).
 */

export type SplitDirection = 'row' | 'column';

export type SplitNode =
  | { type: 'leaf'; id: string; pageId: string }
  | { type: 'split'; id: string; direction: SplitDirection; sizes: number[]; children: SplitNode[] };

export interface WorkspaceState {
  version: 1;
  /** Last focused leaf pane id. */
  focusedPaneId: string | null;
  /** Page shown when there is no split (also default for new leaves). */
  activePageId: string | null;
  layout: SplitNode;
  /** Maximized leaf id, or null. */
  maximizedPaneId: string | null;
  /** Layout before maximize, for restore. */
  restoreLayout: SplitNode | null;
}

let idSeq = 0;
export function nextPaneId(prefix = 'pane'): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

export function leafLayout(pageId: string, id = nextPaneId()): SplitNode {
  return { type: 'leaf', id, pageId };
}

export function defaultWorkspace(pageId: string | null): WorkspaceState {
  const id = nextPaneId();
  return {
    version: 1,
    focusedPaneId: id,
    activePageId: pageId,
    layout: leafLayout(pageId ?? 'home', id),
    maximizedPaneId: null,
    restoreLayout: null,
  };
}

export function normalizeWorkspace(raw: unknown, fallbackPageId: string | null): WorkspaceState {
  const d = defaultWorkspace(fallbackPageId);
  if (!raw || typeof raw !== 'object') return d;
  const v = raw as Partial<WorkspaceState>;
  const layout = normalizeNode(v.layout, fallbackPageId ?? 'home');
  return {
    version: 1,
    focusedPaneId: typeof v.focusedPaneId === 'string' ? v.focusedPaneId : layout.type === 'leaf' ? layout.id : firstLeafId(layout),
    activePageId: typeof v.activePageId === 'string' ? v.activePageId : fallbackPageId,
    layout,
    maximizedPaneId: typeof v.maximizedPaneId === 'string' ? v.maximizedPaneId : null,
    restoreLayout: v.restoreLayout ? normalizeNode(v.restoreLayout, fallbackPageId ?? 'home') : null,
  };
}

function normalizeNode(raw: unknown, fallbackPageId: string): SplitNode {
  if (!raw || typeof raw !== 'object') return leafLayout(fallbackPageId);
  const n = raw as Partial<SplitNode> & { type?: string };
  if (n.type === 'leaf') {
    return { type: 'leaf', id: typeof n.id === 'string' ? n.id : nextPaneId(), pageId: typeof (n as { pageId?: string }).pageId === 'string' ? (n as { pageId: string }).pageId : fallbackPageId };
  }
  if (n.type === 'split') {
    const s = n as { id?: string; direction?: string; sizes?: number[]; children?: unknown[] };
    const children = Array.isArray(s.children) ? s.children.map((c) => normalizeNode(c, fallbackPageId)) : [leafLayout(fallbackPageId), leafLayout(fallbackPageId)];
    if (children.length < 2) children.push(leafLayout(fallbackPageId));
    const sizes = Array.isArray(s.sizes) && s.sizes.length === children.length ? s.sizes.map((x) => (Number.isFinite(x) ? Math.max(0.15, Math.min(0.85, x)) : 1 / children.length)) : children.map(() => 1 / children.length);
    const sum = sizes.reduce((a, b) => a + b, 0) || 1;
    return {
      type: 'split',
      id: typeof s.id === 'string' ? s.id : nextPaneId('split'),
      direction: s.direction === 'column' ? 'column' : 'row',
      sizes: sizes.map((x) => x / sum),
      children,
    };
  }
  return leafLayout(fallbackPageId);
}

export function firstLeafId(node: SplitNode): string {
  if (node.type === 'leaf') return node.id;
  return firstLeafId(node.children[0]);
}

export function findLeaf(node: SplitNode, paneId: string): Extract<SplitNode, { type: 'leaf' }> | null {
  if (node.type === 'leaf') return node.id === paneId ? node : null;
  for (const c of node.children) {
    const found = findLeaf(c, paneId);
    if (found) return found;
  }
  return null;
}

export function mapLeaves(node: SplitNode, fn: (leaf: Extract<SplitNode, { type: 'leaf' }>) => Extract<SplitNode, { type: 'leaf' }>): SplitNode {
  if (node.type === 'leaf') return fn(node);
  return { ...node, children: node.children.map((c) => mapLeaves(c, fn)) };
}

export function setLeafPage(node: SplitNode, paneId: string, pageId: string): SplitNode {
  return mapLeaves(node, (leaf) => (leaf.id === paneId ? { ...leaf, pageId } : leaf));
}

export function splitPane(node: SplitNode, paneId: string, direction: SplitDirection, newPageId: string): SplitNode {
  if (node.type === 'leaf') {
    if (node.id !== paneId) return node;
    return {
      type: 'split',
      id: nextPaneId('split'),
      direction,
      sizes: [0.5, 0.5],
      children: [node, leafLayout(newPageId)],
    };
  }
  return { ...node, children: node.children.map((c) => splitPane(c, paneId, direction, newPageId)) };
}

/** Remove a leaf; if a split ends with one child, collapse it. */
export function closePane(node: SplitNode, paneId: string): SplitNode | null {
  if (node.type === 'leaf') return node.id === paneId ? null : node;
  const children = node.children.map((c) => closePane(c, paneId)).filter((c): c is SplitNode => !!c);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  const sizes = children.map((_, i) => node.sizes[i] ?? 1 / children.length);
  const sum = sizes.reduce((a, b) => a + b, 0) || 1;
  return { ...node, children, sizes: sizes.map((x) => x / sum) };
}

export function collectDesignPaneIds(node: SplitNode, pageViewType: (pageId: string) => string | undefined): string[] {
  if (node.type === 'leaf') return pageViewType(node.pageId) === 'design' ? [node.id] : [];
  return node.children.flatMap((c) => collectDesignPaneIds(c, pageViewType));
}
