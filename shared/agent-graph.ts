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
