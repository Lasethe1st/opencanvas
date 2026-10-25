import { Crosshair, Focus, Maximize2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { agentGraphDurationMs, type AgentGraphNode } from '../../../shared/agent-graph';
import { openFile, revealInCode } from '../../lib/actions';
import { setState, useStore } from '../../lib/store';
import { Button, cx, IconButton } from '../../ui/primitives.jsx';

const STATUS_CLASS: Record<AgentGraphNode['status'], string> = {
  pending: 'is-pending',
  running: 'is-running',
  completed: 'is-done',
  failed: 'is-failed',
  cancelled: 'is-cancelled',
  waiting: 'is-waiting',
};

function formatMs(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Horizontal branching execution graph from real AiEvent stream. */
export function AgentActivity() {
  const graph = useStore((s) => s.agentGraph);
  const follow = useStore((s) => s.followAgentNode);
  const selectedId = useStore((s) => s.selectedAgentNodeId);
  const scroller = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const roots = graph.children[''] ?? (graph.rootId ? [graph.rootId] : []);
  const selected = selectedId ? graph.nodes[selectedId] : null;

  useEffect(() => {
    if (!follow || !graph.activeNodeId || !scroller.current) return;
    const el = scroller.current.querySelector(`[data-node-id="${graph.activeNodeId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [follow, graph.activeNodeId]);

  const empty = !graph.rootId;

  return (
    <div className="agent-activity" data-tw="">
      <div className="agent-activity__toolbar">
        <span className="agent-activity__title">Agent activity</span>
        <label className="agent-activity__follow">
          <input type="checkbox" checked={follow} onChange={(e) => setState({ followAgentNode: e.target.checked })} />
          Follow
        </label>
        <IconButton
          size="sm"
          label="Fit"
          onClick={() => {
            scroller.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
          }}
        >
          <Maximize2 size={13} />
        </IconButton>
      </div>
      {empty ? (
        <div className="agent-activity__empty">
          <Focus size={18} />
          <p>Ask the AI to do something — steps and tool calls appear here as they run.</p>
        </div>
      ) : (
        <div className="agent-activity__body">
          <div ref={scroller} className="agent-activity__graph" role="tree">
            {roots.map((id) => (
              <GraphBranch
                key={id}
                nodeId={id}
                graphChildren={graph.children}
                nodes={graph.nodes}
                collapsed={collapsed}
                selectedId={selectedId}
                onSelect={(id) => setState({ selectedAgentNodeId: id, followAgentNode: false })}
                onToggle={(id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
              />
            ))}
          </div>
          {selected && (
            <aside className="agent-activity__detail">
              <div className="agent-activity__detail-head">
                <strong>{selected.label}</strong>
                <IconButton size="sm" label="Close detail" onClick={() => setState({ selectedAgentNodeId: null })}>
                  <X size={13} />
                </IconButton>
              </div>
              <p className="agent-activity__meta">
                {selected.kind} · {selected.status}
                {formatMs(agentGraphDurationMs(selected)) ? ` · ${formatMs(agentGraphDurationMs(selected))}` : ''}
              </p>
              {selected.detail && <p className="agent-activity__detail-text">{selected.detail}</p>}
              {selected.tool && <p className="agent-activity__meta">Tool: {selected.tool}</p>}
              {selected.filePath && (
                <Button
                  size="sm"
                  icon={<Crosshair size={13} />}
                  onClick={() => {
                    const path = selected.filePath!;
                    void openFile(path);
                    revealInCode(path, 1);
                  }}
                >
                  Open {selected.filePath}
                </Button>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function GraphBranch({
  nodeId,
  graphChildren,
  nodes,
  collapsed,
  selectedId,
  onSelect,
  onToggle,
  depth = 0,
}: {
  nodeId: string;
  graphChildren: Record<string, string[]>;
  nodes: Record<string, AgentGraphNode>;
  collapsed: Record<string, boolean>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  depth?: number;
}) {
  const node = nodes[nodeId];
  const kids = useMemo(() => (graphChildren[nodeId] ?? []).filter((id) => nodes[id]), [graphChildren, nodeId, nodes]);
  if (!node) return null;
  const isCollapsed = !!collapsed[nodeId];
  const hasKids = kids.length > 0;

  return (
    <div className="agent-branch" style={{ marginInlineStart: depth ? 16 : 0 }} role="treeitem" aria-expanded={hasKids ? !isCollapsed : undefined}>
      <button
        type="button"
        data-node-id={node.id}
        className={cx('agent-node', STATUS_CLASS[node.status], selectedId === node.id && 'is-selected')}
        onClick={() => onSelect(node.id)}
      >
        {hasKids && (
          <span
            className="agent-node__twist"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            {isCollapsed ? '+' : '−'}
          </span>
        )}
        <span className="agent-node__dot" aria-hidden />
        <span className="agent-node__label">{node.label}</span>
        <span className="agent-node__time">{formatMs(agentGraphDurationMs(node))}</span>
      </button>
      {!isCollapsed && hasKids && (
        <div className="agent-branch__kids">
          {kids.map((id) => (
            <GraphBranch
              key={id}
              nodeId={id}
              graphChildren={graphChildren}
              nodes={nodes}
              collapsed={collapsed}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
