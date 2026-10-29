import { Code2, Crosshair, Focus, Frame as FrameIcon, Square, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  agentGraphDurationMs,
  CANVAS_EDIT_TOOLS,
  isEditNode,
  stepTitle,
  toolTitle,
  type AgentGraph,
  type AgentGraphNode,
} from '../../../shared/agent-graph';
import { openFile, revealInCode, selectElement } from '../../lib/actions';
import { stopAi } from '../../lib/ai';
import { fitFrame } from '../../lib/canvas';
import { focusPage } from '../../lib/pages';
import { activeFrame, getState, pageOf, setState, useStore } from '../../lib/store';
import { cx, IconButton } from '../../ui/primitives.jsx';

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
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function clock(ms?: number): string {
  return ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
}

const isLive = (n?: AgentGraphNode | null) => !!n && (n.status === 'running' || n.status === 'waiting' || n.status === 'pending');

/** Re-render once a second while something is running, so the timers tick. */
function useTicker(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => set((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [on]);
}

interface Column {
  node: AgentGraphNode;
  number: number;
  title: string;
  tools: AgentGraphNode[];
}

function columnsOf(g: AgentGraph): Column[] {
  if (!g.rootId || !g.nodes[g.rootId]) return [];
  const root = g.nodes[g.rootId];
  const kids = (g.children[g.rootId] ?? []).map((id) => g.nodes[id]).filter(Boolean) as AgentGraphNode[];
  const cols: Column[] = [{ node: root, number: 0, title: 'Your request', tools: [] }];
  for (const n of kids) {
    if (n.kind === 'end') continue;
    const tools = (g.children[n.id] ?? []).map((id) => g.nodes[id]).filter(Boolean) as AgentGraphNode[];
    cols.push({ node: n, number: cols.length, title: n.kind === 'step' ? stepTitle(g, n.id) : n.label, tools });
  }
  const end = kids.find((n) => n.kind === 'end');
  if (end && end.status !== 'pending') cols.push({ node: end, number: 0, title: end.label, tools: [] });
  return cols;
}

/** Files and canvas elements a set of tool calls changed. */
function changesOf(tools: AgentGraphNode[]) {
  const edits = tools.filter(isEditNode);
  const files = [...new Set(edits.map((n) => n.filePath).filter(Boolean) as string[])];
  const elements = [...new Set(edits.filter((n) => n.tool && CANVAS_EDIT_TOOLS.has(n.tool)).map((n) => n.elementId).filter(Boolean) as string[])];
  const touchesCanvas = edits.some((n) => n.tool && CANVAS_EDIT_TOOLS.has(n.tool));
  return { edits, files, elements, touchesCanvas };
}

/** Frames that show what these changes touched: the design page for canvas edits, and any page whose file was rewritten. */
function framesFor(change: ReturnType<typeof changesOf>) {
  const s = getState();
  const pages = s.projectConfig?.pages ?? [];
  const designPage = pageOf(activeFrame(s), s);
  const pageIds = new Set<string>();
  if (change.touchesCanvas && designPage) pageIds.add(designPage.id);
  for (const p of pages) if (p.file && change.files.includes(p.file)) pageIds.add(p.id);
  return s.frames.filter((f) => {
    const page = pageOf(f, s);
    return !!page && pageIds.has(page.id);
  });
}

function showFile(path: string) {
  void openFile(path);
  revealInCode(path, 1);
}

/** The agent page: the run reads left to right as numbered steps, each step's tool calls hang underneath it. */
export function AgentActivity() {
  const graph = useStore((s) => s.agentGraph);
  const follow = useStore((s) => s.followAgentNode);
  const selectedId = useStore((s) => s.selectedAgentNodeId);
  const scroller = useRef<HTMLDivElement>(null);

  const root = graph.rootId ? graph.nodes[graph.rootId] : null;
  const running = isLive(root);
  useTicker(running);

  const cols = useMemo(() => columnsOf(graph), [graph]);
  const activeCol = useMemo(() => {
    const active = graph.activeNodeId ? graph.nodes[graph.activeNodeId] : null;
    const colId = active?.kind === 'tool' ? active.parentId : active?.id;
    return cols.findIndex((c) => c.node.id === colId);
  }, [cols, graph]);

  useEffect(() => {
    if (!follow || !graph.activeNodeId || !scroller.current) return;
    const el = scroller.current.querySelector(`[data-node-id="${graph.activeNodeId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [follow, graph.activeNodeId]);

  const select = (id: string) => setState({ selectedAgentNodeId: id, followAgentNode: false });

  if (!root) {
    return (
      <div className="agent-run" data-tw="">
        <div className="agent-run__empty">
          <Focus size={18} />
          <p>Ask the AI to do something. Its steps and tool calls show up here as they run.</p>
        </div>
      </div>
    );
  }

  const stepCount = cols.filter((c) => c.number > 0).length;
  const activeNumber = activeCol >= 0 ? cols[activeCol].number : stepCount;
  const elapsed = formatMs(agentGraphDurationMs(root));
  const statusLine =
    root.status === 'running'
      ? `${elapsed} so far`
      : root.status === 'failed'
        ? `Failed after ${elapsed}`
        : root.status === 'cancelled'
          ? `Stopped after ${elapsed}`
          : `Took ${elapsed}`;

  const selected = (selectedId && graph.nodes[selectedId]) || (graph.activeNodeId && graph.nodes[graph.activeNodeId]) || null;

  return (
    <div className="agent-run" data-tw="">
      <div className="agent-run__sheet">
        <header className="agent-run__head">
          <small>
            Agent run · {running && activeNumber > 0 ? `step ${Math.min(activeNumber, stepCount)} of ${stepCount}` : `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`}
          </small>
          <h1>{graph.request || root.label}</h1>
          <p>
            Started {clock(root.startedAt)} · {statusLine}
            {running && (
              <button type="button" className="agent-run__stop" onClick={stopAi} aria-label="Stop the agent">
                <Square size={9} fill="currentColor" /> Stop
              </button>
            )}
          </p>
          <label className="agent-run__follow">
            Follow the agent
            <span className="mcp-switch">
              <input type="checkbox" checked={follow} onChange={(e) => setState({ followAgentNode: e.target.checked })} />
              <span />
            </span>
          </label>
        </header>

        <div ref={scroller} className="agent-run__graph" role="list">
          {cols.map((col, i) => {
            const change = changesOf(col.tools);
            const reads = col.tools.length - change.edits.length;
            const time = formatMs(agentGraphDurationMs(col.node));
            return (
              <div
                key={col.node.id}
                role="listitem"
                className={cx('agent-col', i > 0 && 'has-link', i === activeCol && running && 'is-active-link')}
              >
                <button
                  type="button"
                  data-node-id={col.node.id}
                  className={cx('agent-card', STATUS_CLASS[col.node.status], selected?.id === col.node.id && 'is-selected')}
                  onClick={() => select(col.node.id)}
                >
                  <span className="agent-card__title">
                    <span className={cx('agent-dot', !col.number && 'agent-dot--plain')} aria-hidden>{col.number || ''}</span>
                    <span className="agent-card__name">{col.title}</span>
                    {col.node.status === 'running' && col.node.kind === 'step' && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="agent-card__stop"
                        aria-label="Stop the agent"
                        title="Stop"
                        onClick={(e) => {
                          e.stopPropagation();
                          stopAi();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            stopAi();
                          }
                        }}
                      >
                        <Square size={9} fill="currentColor" />
                      </span>
                    )}
                  </span>
                  {col.node.kind === 'request' && <span className="agent-card__text">“{(graph.request || col.node.label).slice(0, 160)}”</span>}
                  {col.node.kind === 'wait' && <span className="agent-card__text">{col.node.label}</span>}
                  {col.node.kind === 'end' && col.node.detail && <span className="agent-card__text">{col.node.detail}</span>}
                  {(col.tools.length > 0 || time) && col.node.kind !== 'request' && (
                    <span className="agent-card__meta">
                      {change.edits.length > 0 && <span className="agent-tag">{change.edits.length} {change.edits.length === 1 ? 'change' : 'changes'}</span>}
                      {reads > 0 && <span className="agent-tag">{reads} {reads === 1 ? 'tool call' : 'tool calls'}</span>}
                      {time && <span>{time}</span>}
                    </span>
                  )}
                </button>
                {col.tools.length > 0 && (
                  <div className="agent-col__tools">
                    {col.tools.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        data-node-id={t.id}
                        className={cx('agent-card agent-card--tool', STATUS_CLASS[t.status], selected?.id === t.id && 'is-selected')}
                        onClick={() => select(t.id)}
                      >
                        <span className="agent-card__title">
                          <span className="agent-dot agent-dot--small" aria-hidden />
                          <span className="agent-card__name">{toolTitle(t)}</span>
                          {isEditNode(t) && <span className="agent-changed">changed</span>}
                        </span>
                        {t.filePath && <code>{t.filePath}</code>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selected && <Inspector graph={graph} node={selected} cols={cols} />}
    </div>
  );
}

function Inspector({ graph, node, cols }: { graph: AgentGraph; node: AgentGraphNode; cols: Column[] }) {
  const col = cols.find((c) => c.node.id === (node.kind === 'tool' ? node.parentId : node.id));
  const tools = node.kind === 'tool' ? [node] : (col?.tools ?? []);
  const change = changesOf(tools);
  const frames = framesFor(change);
  const why = (node.kind === 'tool' && node.parentId ? graph.nodes[node.parentId]?.reasoning : node.reasoning)?.trim();
  const total = cols.filter((c) => c.number > 0).length;
  const time = formatMs(agentGraphDurationMs(node));
  const title = node.kind === 'tool' ? toolTitle(node) : (col?.title ?? node.label);
  const kicker =
    node.kind === 'tool'
      ? `Tool call${col ? ` in step ${col.number}` : ''}`
      : node.kind === 'end'
        ? 'Result'
        : node.kind === 'request'
          ? 'Your request'
          : col && col.number
            ? `Step ${col.number} of ${total}`
            : 'Step';

  return (
    <aside className="agent-insp" aria-label="Step details">
      <div className="agent-insp__head">
        <div>
          <small>{kicker}</small>
          <h2>{title}</h2>
        </div>
        <IconButton size="sm" label="Close details" onClick={() => setState({ selectedAgentNodeId: null, followAgentNode: false })}>
          <X size={13} />
        </IconButton>
      </div>

      {(time || change.files.length > 0 || change.edits.length > 0) && (
        <div className="agent-insp__stats">
          {time && (
            <div>
              {time}
              <span>time</span>
            </div>
          )}
          {change.files.length > 0 && (
            <div>
              {change.files.length}
              <span>{change.files.length === 1 ? 'file' : 'files'}</span>
            </div>
          )}
          {change.edits.length > 0 && (
            <div>
              {change.edits.length}
              <span>{change.edits.length === 1 ? 'change' : 'changes'}</span>
            </div>
          )}
        </div>
      )}

      {node.kind === 'request' && <p className="agent-insp__why">{graph.request || node.label}</p>}

      {why && (
        <section>
          <div className="agent-insp__label">Why</div>
          <p className="agent-insp__why">{why}</p>
        </section>
      )}

      {node.detail && node.status === 'failed' && (
        <section>
          <div className="agent-insp__label">What went wrong</div>
          <p className="agent-insp__why">{node.detail}</p>
        </section>
      )}

      {change.files.length > 0 && (
        <section>
          <div className="agent-insp__label">Files changed</div>
          {change.files.map((f) => (
            <div key={f} className="agent-insp__row">
              <span className="agent-dot agent-dot--small is-done" aria-hidden />
              <code>{f}</code>
              <button type="button" onClick={() => showFile(f)}>
                <Code2 size={12} /> Open
              </button>
            </div>
          ))}
        </section>
      )}

      {change.elements.length > 0 && (
        <section>
          <div className="agent-insp__label">Elements changed</div>
          {change.elements.map((id) => (
            <div key={id} className="agent-insp__row">
              <span className="agent-dot agent-dot--small is-done" aria-hidden />
              <code>{id}</code>
              <button type="button" onClick={() => selectElement(id)}>
                <Crosshair size={12} /> Show on canvas
              </button>
            </div>
          ))}
        </section>
      )}

      {frames.length > 0 && (
        <section>
          <div className="agent-insp__label">Frames affected</div>
          {frames.map((f) => (
            <div key={f.id} className="agent-insp__row">
              <FrameIcon size={12} aria-hidden />
              <span>{f.name}</span>
              <button
                type="button"
                onClick={() => {
                  const page = pageOf(f);
                  if (page) focusPage(page.id);
                  fitFrame(f.id);
                }}
              >
                Go to frame
              </button>
            </div>
          ))}
        </section>
      )}

      {node.kind !== 'tool' && tools.length > 0 && (
        <section>
          <div className="agent-insp__label">Tool calls</div>
          {tools.map((t) => (
            <button key={t.id} type="button" className="agent-insp__row agent-insp__row--btn" onClick={() => setState({ selectedAgentNodeId: t.id, followAgentNode: false })}>
              <span className={cx('agent-dot agent-dot--small', STATUS_CLASS[t.status])} aria-hidden />
              <span>{toolTitle(t)}</span>
              <span className="agent-insp__time">{formatMs(agentGraphDurationMs(t))}</span>
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}
