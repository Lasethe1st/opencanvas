import { Columns2, Maximize2, Minimize2, Rows2, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { PageConfig } from '../../shared/project-config';
import {
  closePane,
  collectDesignPaneIds,
  firstLeafId,
  leafLayout,
  splitPane,
  type SplitNode,
} from '../../shared/workspace-layout';
import { Canvas } from './Canvas';
import { CodeView } from './CodeView';
import { AgentActivity } from './agent/AgentActivity';
import { ThreeEditor } from './three/ThreeEditor';
import { TerminalPanel } from './TerminalPanel';
import { scheduleWorkspaceSave } from '../lib/workspace';
import { getState, setState, useStore } from '../lib/store';
import { cx, IconButton } from '../ui/primitives.jsx';

const EMPTY_PAGES: PageConfig[] = [];

function pageOf(id: string | null | undefined): PageConfig | null {
  const pages = getState().projectConfig?.pages ?? EMPTY_PAGES;
  return pages.find((p) => p.id === id) ?? null;
}

function viewTypeOf(pageId: string): string {
  return pageOf(pageId)?.viewType ?? 'design';
}

/** Renders the center workspace: one or more panes from the split tree. */
export function WorkspaceSplit() {
  const workspace = useStore((s) => s.workspace);
  const mode = useStore((s) => s.mode);
  const layout = workspace.maximizedPaneId
    ? (() => {
        const leaf = findLeafById(workspace.layout, workspace.maximizedPaneId);
        return leaf ?? workspace.layout;
      })()
    : workspace.layout;

  return (
    <div className="workspace-split">
      <SplitView
        node={layout}
        focusedPaneId={workspace.focusedPaneId}
        maximized={!!workspace.maximizedPaneId}
        visualMode={mode === 'visual'}
      />
    </div>
  );
}

function findLeafById(node: SplitNode, id: string): SplitNode | null {
  if (node.type === 'leaf') return node.id === id ? node : null;
  for (const c of node.children) {
    const f = findLeafById(c, id);
    if (f) return f;
  }
  return null;
}

function SplitView({
  node,
  focusedPaneId,
  maximized,
  visualMode,
}: {
  node: SplitNode;
  focusedPaneId: string | null;
  maximized: boolean;
  visualMode: boolean;
}) {
  if (node.type === 'leaf') {
    return <Pane leaf={node} focused={focusedPaneId === node.id} maximized={maximized} visualMode={visualMode} />;
  }

  return (
    <div className={cx('workspace-split__row', node.direction === 'column' && 'is-column')}>
      {node.children.map((child, i) => (
        <div key={child.id} className="workspace-split__cell" style={{ flexGrow: node.sizes[i] ?? 1, flexBasis: 0 }}>
          <SplitView node={child} focusedPaneId={focusedPaneId} maximized={maximized} visualMode={visualMode} />
          {i < node.children.length - 1 && (
            <SplitDivider
              direction={node.direction}
              onDrag={(delta) => {
                const s = getState().workspace;
                const sizes = [...node.sizes];
                const a = sizes[i] ?? 0.5;
                const b = sizes[i + 1] ?? 0.5;
                const nextA = Math.min(0.85, Math.max(0.15, a + delta));
                const diff = nextA - a;
                sizes[i] = nextA;
                sizes[i + 1] = Math.min(0.85, Math.max(0.15, b - diff));
                const sum = sizes.reduce((x, y) => x + y, 0) || 1;
                const normalized = sizes.map((x) => x / sum);
                setState({
                  workspace: {
                    ...s,
                    layout: updateSplitSizes(s.layout, node.id, normalized),
                  },
                });
                scheduleWorkspaceSave();
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function updateSplitSizes(node: SplitNode, splitId: string, sizes: number[]): SplitNode {
  if (node.type === 'leaf') return node;
  if (node.id === splitId) return { ...node, sizes };
  return { ...node, children: node.children.map((c) => updateSplitSizes(c, splitId, sizes)) };
}

function SplitDivider({ direction, onDrag }: { direction: 'row' | 'column'; onDrag: (deltaFraction: number) => void }) {
  const start = useRef<{ pos: number; size: number } | null>(null);
  return (
    <div
      className={cx('workspace-split__divider', direction === 'column' && 'is-column')}
      role="separator"
      aria-orientation={direction === 'column' ? 'horizontal' : 'vertical'}
      onPointerDown={(e) => {
        const parent = (e.currentTarget.parentElement?.parentElement as HTMLElement | null) ?? null;
        const size = direction === 'column' ? parent?.clientHeight ?? 1 : parent?.clientWidth ?? 1;
        start.current = { pos: direction === 'column' ? e.clientY : e.clientX, size };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const pos = direction === 'column' ? e.clientY : e.clientX;
        onDrag((pos - start.current.pos) / start.current.size);
        start.current = { ...start.current, pos };
      }}
      onPointerUp={() => {
        start.current = null;
      }}
    />
  );
}

function Pane({
  leaf,
  focused,
  maximized,
  visualMode,
}: {
  leaf: Extract<SplitNode, { type: 'leaf' }>;
  focused: boolean;
  maximized: boolean;
  visualMode: boolean;
}) {
  const pages = useStore((s) => s.projectConfig?.pages ?? EMPTY_PAGES);
  const page = pages.find((p) => p.id === leaf.pageId) ?? pages[0] ?? null;
  const viewType = page?.viewType ?? 'design';
  const workspace = useStore((s) => s.workspace);

  const designPanes = collectDesignPaneIds(workspace.layout, (id) => viewTypeOf(id));
  const isLiveDesign = viewType === 'design' && designPanes[0] === leaf.id;

  const patchWorkspace = (layout: SplitNode, extra?: Partial<typeof workspace>) => {
    setState({
      workspace: {
        ...getState().workspace,
        layout,
        focusedPaneId: leaf.id,
        ...extra,
      },
    });
    scheduleWorkspaceSave();
  };

  const split = workspace.layout.type !== 'leaf' || !!workspace.maximizedPaneId;
  // Single design leaf: hide pane chrome so it doesn't stack under the floating top bar.
  // Page switching lives in the left sidebar Pages tab — multi-page alone does not force chrome.
  const showHead = split || viewType !== 'design';

  return (
    <section
      className={cx('workspace-pane', focused && 'is-focused', !showHead && 'is-bare')}
      onPointerDown={() => setState({ workspace: { ...getState().workspace, focusedPaneId: leaf.id } })}
    >
      {showHead && (
        <header className="workspace-pane__head">
          <div className="workspace-pane__actions">
            <IconButton
              size="sm"
              label="Split horizontally"
              onClick={() => {
                const nextPage = pages.find((p) => p.id !== leaf.pageId)?.id ?? leaf.pageId;
                patchWorkspace(splitPane(getState().workspace.layout, leaf.id, 'row', nextPage));
              }}
            >
              <Columns2 size={13} />
            </IconButton>
            <IconButton
              size="sm"
              label="Split vertically"
              onClick={() => {
                const nextPage = pages.find((p) => p.id !== leaf.pageId)?.id ?? leaf.pageId;
                patchWorkspace(splitPane(getState().workspace.layout, leaf.id, 'column', nextPage));
              }}
            >
              <Rows2 size={13} />
            </IconButton>
            <IconButton
              size="sm"
              label={maximized ? 'Restore' : 'Maximize'}
              onClick={() => {
                const s = getState().workspace;
                if (s.maximizedPaneId) {
                  setState({
                    workspace: {
                      ...s,
                      maximizedPaneId: null,
                      layout: s.restoreLayout ?? s.layout,
                      restoreLayout: null,
                    },
                  });
                } else {
                  setState({
                    workspace: {
                      ...s,
                      maximizedPaneId: leaf.id,
                      restoreLayout: s.layout,
                    },
                  });
                }
                scheduleWorkspaceSave();
              }}
            >
              {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </IconButton>
            <IconButton
              size="sm"
              label="Close pane"
              disabled={workspace.layout.type === 'leaf'}
              onClick={() => {
                const next = closePane(getState().workspace.layout, leaf.id);
                if (!next) return;
                setState({
                  workspace: {
                    ...getState().workspace,
                    layout: next,
                    focusedPaneId: firstLeafId(next),
                    maximizedPaneId: null,
                    restoreLayout: null,
                  },
                });
                scheduleWorkspaceSave();
              }}
            >
              <X size={13} />
            </IconButton>
          </div>
        </header>
      )}
      <div className="workspace-pane__body">
        {renderView(viewType, {
          isLiveDesign,
          visualMode,
          pageName: page?.name ?? 'Page',
          pageId: page?.id ?? leaf.pageId,
        })}
      </div>
    </section>
  );
}

function renderView(
  viewType: string,
  opts: { isLiveDesign: boolean; visualMode: boolean; pageName: string; pageId: string },
): ReactNode {
  switch (viewType) {
    case 'design':
      if (!opts.isLiveDesign) {
        return (
          <div className="workspace-pane__empty">
            <p>Design is already open in another pane.</p>
            <p className="muted">v1 supports one live design canvas at a time.</p>
          </div>
        );
      }
      // ModeSwitch toggles visual ↔ code on the design page (not viewType 'code').
      return (
        <>
          <Canvas hidden={!opts.visualMode} />
          {!opts.visualMode ? <CodeView hidden={false} /> : null}
        </>
      );
    case 'code':
      return <CodeView hidden={false} />;
    case 'terminal':
      return <TerminalPaneBody />;
    case 'agent':
      return <AgentActivity />;
    case 'three':
      return <ThreeEditor pageId={opts.pageId} />;
    default:
      return (
        <div className="workspace-pane__empty">
          <p>{opts.pageName}</p>
          <p className="muted">Custom page — add content later.</p>
        </div>
      );
  }
}

function TerminalPaneBody() {
  useEffect(() => {
    if (!getState().terminalOpen) setState({ terminalOpen: true });
  }, []);
  return (
    <div className="workspace-pane__terminal">
      <TerminalPanel force />
    </div>
  );
}

void leafLayout;
