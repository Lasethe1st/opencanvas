/**
 * Pure reducer: AiEvent stream → branching execution graph (real events only).
 * Tools run sequentially today → linear chains under model steps; siblings under one
 * parentId are supported when the agent later parallelizes. No simulated nodes.
 */
import type { AiEvent } from './ai';

export type AgentNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting';

export type AgentNodeKind = 'request' | 'step' | 'tool' | 'wait' | 'end';

export interface AgentGraphNode {
  id: string;
  parentId: string | null;
  kind: AgentNodeKind;
  label: string;
  status: AgentNodeStatus;
  turnId: string;
  callId?: string;
  tool?: string;
  ok?: boolean;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
  /** Optional file path extracted from tool summary. */
  filePath?: string | null;
  /** Canvas element a tool call changed, when the tool reports one. */
  elementId?: string | null;
  /** Model reasoning streamed while this step ran (the "why"). */
  reasoning?: string;
}

export interface AgentGraph {
  turnId: string | null;
  rootId: string | null;
  nodes: Record<string, AgentGraphNode>;
  /** Child ids keyed by parent id (root children under ''). */
  children: Record<string, string[]>;
  activeNodeId: string | null;
  request?: string;
}

export const EMPTY_AGENT_GRAPH: AgentGraph = {
  turnId: null,
  rootId: null,
  nodes: {},
  children: {},
  activeNodeId: null,
};

function addChild(g: AgentGraph, parentId: string | null, id: string) {
  const key = parentId ?? '';
  const list = g.children[key] ?? [];
  if (!list.includes(id)) g.children[key] = [...list, id];
}

function setNode(g: AgentGraph, node: AgentGraphNode) {
  g.nodes[node.id] = node;
  addChild(g, node.parentId, node.id);
}

function markRunningCancelled(g: AgentGraph) {
  for (const n of Object.values(g.nodes)) {
    if (n.status === 'running' || n.status === 'pending' || n.status === 'waiting') {
      g.nodes[n.id] = { ...n, status: 'cancelled', endedAt: Date.now() };
    }
  }
}

const FILE_RE = /(?:^|\s)((?:src|app|pages|components|lib|shared|\.opencanvas)\/[\w./-]+\.\w+)/;

export function fileFromSummary(summary: string): string | null {
  const m = summary.match(FILE_RE);
  return m?.[1] ?? null;
}

const MAX_REASONING = 4000;

function runningStep(g: AgentGraph): string | null {
  const root = g.rootId;
  if (!root) return null;
  const kids = g.children[root] ?? [];
  for (let i = kids.length - 1; i >= 0; i--) {
    const n = g.nodes[kids[i]];
    if (n?.kind === 'step' && n.status === 'running') return n.id;
  }
  return null;
}

/** Current model-step parent under the turn root (last running/completed step, else root). */
function stepParent(g: AgentGraph): string | null {
  const root = g.rootId;
  if (!root) return null;
  const kids = g.children[root] ?? [];
  for (let i = kids.length - 1; i >= 0; i--) {
    const n = g.nodes[kids[i]];
    if (n?.kind === 'step') return n.id;
  }
  return root;
}

export function reduceAgentGraph(prev: AgentGraph, event: AiEvent): AgentGraph {
  const g: AgentGraph = {
    turnId: prev.turnId,
    rootId: prev.rootId,
    nodes: { ...prev.nodes },
    children: Object.fromEntries(Object.entries(prev.children).map(([k, v]) => [k, [...v]])),
    activeNodeId: prev.activeNodeId,
    request: prev.request,
  };

  switch (event.type) {
    case 'start': {
      const rootId = event.turnId;
      const endId = `${event.turnId}:end`;
      const next: AgentGraph = {
        turnId: event.turnId,
        rootId,
        nodes: {},
        children: {},
        activeNodeId: rootId,
        request: event.request,
      };
      setNode(next, {
        id: rootId,
        parentId: null,
        kind: 'request',
        label: event.request.slice(0, 120) || 'Request',
        status: 'running',
        turnId: event.turnId,
        startedAt: Date.now(),
      });
      setNode(next, {
        id: endId,
        parentId: rootId,
        kind: 'end',
        label: 'Complete',
        status: 'pending',
        turnId: event.turnId,
      });
      return next;
    }
    case 'reasoning': {
      if (event.turnId !== g.turnId || !g.rootId) return prev;
      const target = runningStep(g) ?? g.rootId;
      const cur = g.nodes[target];
      if (!cur) return prev;
      const text = (cur.reasoning ?? '') + event.delta;
      g.nodes[target] = { ...cur, reasoning: text.length > MAX_REASONING ? text.slice(0, MAX_REASONING) : text };
      return g;
    }
    case 'step': {
      if (event.turnId !== g.turnId || !g.rootId) return prev;
      const id = event.stepId;
      setNode(g, {
        id,
        parentId: g.rootId,
        kind: 'step',
        label: event.label || `Step ${event.index + 1}`,
        status: 'running',
        turnId: event.turnId,
        startedAt: Date.now(),
      });
      // Complete previous running steps
      for (const n of Object.values(g.nodes)) {
        if (n.kind === 'step' && n.id !== id && n.status === 'running') {
          g.nodes[n.id] = { ...n, status: 'completed', endedAt: Date.now() };
        }
      }
      g.activeNodeId = id;
      return g;
    }
    case 'tool-start': {
      if (event.turnId !== g.turnId) return prev;
      const parentId = event.parentId ?? stepParent(g);
      const id = event.callId;
      setNode(g, {
        id,
        parentId,
        kind: 'tool',
        label: event.summary,
        status: 'running',
        turnId: event.turnId,
        callId: event.callId,
        tool: event.tool,
        startedAt: event.startedAt ?? Date.now(),
        filePath: fileFromSummary(event.summary),
      });
      g.activeNodeId = id;
      return g;
    }
    case 'tool-end': {
      if (event.turnId !== g.turnId) return prev;
      const cur = g.nodes[event.callId];
      if (!cur) return prev;
      g.nodes[event.callId] = {
        ...cur,
        status: event.ok ? 'completed' : 'failed',
        ok: event.ok,
        label: event.summary || cur.label,
        endedAt: event.endedAt ?? Date.now(),
        detail: event.ok ? undefined : event.summary,
        filePath: fileFromSummary(event.summary) ?? cur.filePath,
        elementId: event.elementId ?? cur.elementId ?? null,
      };
      g.activeNodeId = event.callId;
      return g;
    }
    case 'question':
    case 'approval': {
      if (event.turnId !== g.turnId) return prev;
      const id = event.type === 'question' ? event.question.id : event.approval.id;
      const label = event.type === 'question' ? event.question.question : event.approval.summary;
      setNode(g, {
        id,
        parentId: stepParent(g),
        kind: 'wait',
        label: label.slice(0, 120),
        status: 'waiting',
        turnId: event.turnId,
        startedAt: Date.now(),
        detail: event.type,
      });
      g.activeNodeId = id;
      return g;
    }
    case 'resolved': {
      if (event.turnId !== g.turnId) return prev;
      const cur = g.nodes[event.id];
      if (cur) {
        g.nodes[event.id] = { ...cur, status: 'completed', endedAt: Date.now(), detail: event.answer };
      }
      return g;
    }
    case 'done': {
      if (event.turnId !== g.turnId || !g.rootId) return prev;
      if (event.stopped) markRunningCancelled(g);
      else {
        for (const n of Object.values(g.nodes)) {
          if (n.status === 'running' || n.status === 'pending') {
            g.nodes[n.id] = { ...n, status: n.kind === 'end' ? 'completed' : 'completed', endedAt: Date.now() };
          }
        }
      }
      const endId = `${event.turnId}:end`;
      if (g.nodes[endId]) {
        g.nodes[endId] = {
          ...g.nodes[endId],
          status: event.stopped ? 'cancelled' : 'completed',
          label: event.stopped ? 'Stopped' : 'Complete',
          endedAt: Date.now(),
        };
        g.activeNodeId = endId;
      }
      if (g.nodes[g.rootId]) {
        g.nodes[g.rootId] = { ...g.nodes[g.rootId], status: event.stopped ? 'cancelled' : 'completed', endedAt: Date.now() };
      }
      return g;
    }
    case 'error': {
      if (event.turnId !== g.turnId || !g.rootId) return prev;
      markRunningCancelled(g);
      const endId = `${event.turnId}:end`;
      if (g.nodes[endId]) {
        g.nodes[endId] = { ...g.nodes[endId], status: 'failed', label: 'Failed', detail: event.message, endedAt: Date.now() };
        g.activeNodeId = endId;
      }
      if (g.nodes[g.rootId]) {
        g.nodes[g.rootId] = { ...g.nodes[g.rootId], status: 'failed', endedAt: Date.now(), detail: event.message };
      }
      return g;
    }
    default:
      return prev;
  }
}

export function agentGraphDurationMs(node: AgentGraphNode): number | null {
  if (!node.startedAt) return null;
  const end = node.endedAt ?? (node.status === 'running' || node.status === 'waiting' ? Date.now() : null);
  if (!end) return null;
  return Math.max(0, end - node.startedAt);
}

/* ---------- Plain-English summaries for the agent page ---------- */

/** Tools that change the design or the project's files. */
export const EDIT_TOOLS = new Set(['set_styles', 'insert_jsx', 'insert_element', 'set_text', 'remove_elements', 'write_file']);
/** Tools that change elements on the canvas (rather than a file). */
export const CANVAS_EDIT_TOOLS = new Set(['set_styles', 'insert_jsx', 'insert_element', 'set_text', 'remove_elements']);
const READ_TOOLS = new Set(['read_file', 'get_outline', 'get_design_direction']);

export function isEditNode(node: AgentGraphNode | undefined | null): boolean {
  return !!node && node.kind === 'tool' && !!node.tool && EDIT_TOOLS.has(node.tool) && node.status === 'completed';
}

const PAST: Array<[RegExp, string]> = [
  [/^Writing\b/, 'Wrote'],
  [/^Reading\b/, 'Read'],
  [/^Styling\b/, 'Styled'],
  [/^Inserting\b/, 'Inserted'],
  [/^Changing\b/, 'Changed'],
  [/^Removing\b/, 'Removed'],
  [/^Taking\b/, 'Took'],
  [/^Searching\b/, 'Searched'],
  [/^Opening\b/, 'Opened'],
  [/^Running\b/, 'Ran'],
  [/^Asking\b/, 'Asked'],
];

/** "Writing src/Hero.tsx" -> "Wrote Hero.tsx" once it has finished; paths shortened to the file name. */
export function toolTitle(node: AgentGraphNode): string {
  let label = node.label || node.tool || 'Tool call';
  if (node.status === 'completed') for (const [re, past] of PAST) if (re.test(label)) { label = label.replace(re, past); break; }
  if (node.filePath) label = label.replace(node.filePath, baseName(node.filePath));
  return label;
}

function baseName(path: string): string {
  return path.split('/').pop() || path;
}

const GENERIC_STEP = /^Step \d+$/;

/** A step's title: the model's own label when it gave one, otherwise one built from its tool calls. */
export function stepTitle(g: AgentGraph, stepId: string): string {
  const step = g.nodes[stepId];
  if (!step) return '';
  if (step.label && !GENERIC_STEP.test(step.label)) return step.label;
  const tools = (g.children[stepId] ?? []).map((id) => g.nodes[id]).filter((n): n is AgentGraphNode => !!n && n.kind === 'tool');
  if (!tools.length) {
    if (step.status === 'running') return 'Thinking';
    return step.reasoning ? 'Thought it through' : 'Replied';
  }
  const done = step.status !== 'running';
  const edits = tools.filter((n) => n.tool && EDIT_TOOLS.has(n.tool));
  if (edits.length) {
    const files = new Set(edits.map((n) => n.filePath).filter(Boolean) as string[]);
    const canvas = edits.filter((n) => n.tool && CANVAS_EDIT_TOOLS.has(n.tool)).length;
    if (files.size === 1 && !canvas) return `${done ? 'Edited' : 'Editing'} ${baseName([...files][0])}`;
    if (files.size > 1 && !canvas) return `${done ? 'Edited' : 'Editing'} ${files.size} files`;
    if (canvas && !files.size) return `${done ? 'Changed' : 'Changing'} the design${canvas > 1 ? ` (${canvas} edits)` : ''}`;
    return `${done ? 'Made' : 'Making'} ${edits.length} changes`;
  }
  if (tools.length === 1) return toolTitle(tools[0]);
  const reads = tools.filter((n) => n.tool && READ_TOOLS.has(n.tool));
  if (reads.length === tools.length) return `${done ? 'Read' : 'Reading'} ${reads.length} things`;
  if (tools.every((n) => n.tool === 'screenshot')) return `${done ? 'Checked' : 'Checking'} the design`;
  return `${done ? 'Used' : 'Using'} ${tools.length} tools`;
}
