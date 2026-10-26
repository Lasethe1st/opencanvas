import {
  ArrowDown,
  ArrowUp,
  Bot,
  Box,
  Code2,
  Compass,
  Copy,
  FileText,
  Home,
  LayoutTemplate,
  Link2,
  Plus,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useRef, useState, type ComponentType } from 'react';
import { PAGE_VIEW_TYPES, type PageViewType } from '../../shared/project-config';
import { runtimeOnlyPaths } from '../../shared/source/routes';
import { setLeafPage } from '../../shared/workspace-layout';
import { sendToFrame } from '../lib/bridge';
import { setSyncScroll } from '../lib/canvas';
import { plural } from '../lib/plural';
import { createPage, deletePage, duplicatePage, focusPage, framesOf, movePage, renamePage } from '../lib/pages';
import { activeFrame, getState, pageOf, setState, useStore } from '../lib/store';
import { scheduleWorkspaceSave } from '../lib/workspace';
import { FrameRow } from '../ui/FramesPanel.jsx';
import { IconButton, SectionLabel } from '../ui/primitives.jsx';

/** Sync-scroll toggle for the Pages sidebar tab (formerly under Frames). */
export function SyncScrollOption() {
  const syncScroll = useStore((s) => s.syncScroll);
  return (
    <label className="frame-list__option">
      <input type="checkbox" checked={syncScroll} onChange={(e) => setSyncScroll(e.target.checked)} />
      <Link2 size={13} />
      Sync scrolling between frames
    </label>
  );
}

export function RowRename({ value, label, onCommit, onCancel }: { value: string; label: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const done = useRef(false);
  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };
  return (
    <input
      className="tree-row__input"
      autoFocus
      aria-label={label}
      defaultValue={value}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => {
        const v = e.currentTarget.value;
        finish(() => onCommit(v));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const v = e.currentTarget.value;
          finish(() => onCommit(v));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(onCancel);
        }
      }}
    />
  );
}

const confirmDelete = (name: string) => window.confirm(`Delete the page ${name}? Its route is removed. You can undo this.`);

const PAGE_ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  'layout-template': LayoutTemplate,
  home: Home,
  'git-branch': Bot,
  'file-code-2': Code2,
  terminal: Terminal,
  'file-text': FileText,
  box: Box,
};

function iconFor(page: { viewType?: PageViewType; icon?: string; path?: string }) {
  const viewType = page.viewType ?? 'design';
  if (viewType === 'design' && page.path === '/') return Home;
  const key =
    page.icon ||
    (viewType === 'agent'
      ? 'git-branch'
      : viewType === 'code'
        ? 'file-code-2'
        : viewType === 'terminal'
          ? 'terminal'
          : viewType === 'three'
            ? 'box'
            : 'layout-template');
  return PAGE_ICONS[key] ?? FileText;
}

/** Pages of the project: design routes plus workspace views (agent/code/terminal). */
export function PagesSection() {
  const state = useStore((s) => s.projectConfig);
  const activeId = useStore((s) => pageOf(activeFrame(s), s)?.id ?? s.workspace.activePageId);
  useStore((s) => s.frames);
  const busy = useStore((s) => s.busy);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<PageViewType>('design');
  const visited = useStore((s) => s.visitedPaths);
  if (!state) return null;
  const { pages, canEditPages, pagesNote } = state;
  const designPaths = pages.filter((p) => (p.viewType ?? 'design') === 'design').map((p) => p.path);
  const runtime = state.routing === 'react-router' ? runtimeOnlyPaths(designPaths, visited) : [];

  return (
    <>
      <SectionLabel
        actions={
          <IconButton size="sm" label={canEditPages ? 'Add page' : (pagesNote ?? 'Pages can’t be added here')} disabled={!canEditPages || busy} active={adding} onClick={() => setAdding(true)}>
            <Plus size={13} />
          </IconButton>
        }
      >
        Pages
      </SectionLabel>
      <div className="frame-list" role="list" aria-label="Pages">
        {pages.map((p, i) => {
          const count = framesOf(p.id).length;
          const viewType = p.viewType ?? 'design';
          const home = viewType === 'design' && p.path === '/';
          const remove = () => !home && confirmDelete(p.name) && void deletePage(p.id);
          const meta =
            viewType === 'design'
              ? `${p.path || '/'} · ${plural(count, 'frame', 'frames').replace(' ', '\u00a0')}`
              : viewType;
          return (
            <FrameRow
              key={p.id}
              role="listitem"
              icon={iconFor(p)}
              name={p.name}
              meta={meta}
              active={p.id === activeId}
              title={canEditPages ? 'F2 to rename, Alt+↑/↓ to reorder' : undefined}
              onClick={() => {
                focusPage(p.id);
                const ws = getState().workspace;
                const paneId = ws.focusedPaneId;
                setState({
                  workspace: {
                    ...ws,
                    layout: paneId ? setLeafPage(ws.layout, paneId, p.id) : ws.layout,
                    activePageId: p.id,
                  },
                });
                scheduleWorkspaceSave();
              }}
              onDoubleClick={() => canEditPages && setRenaming(p.id)}
              onKeyDown={(e) => {
                if (!canEditPages) return;
                if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                  e.preventDefault();
                  void movePage(p.id, e.key === 'ArrowUp' ? -1 : 1);
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault();
                  remove();
                }
              }}
              actions={
                canEditPages && (
                  <>
                    <IconButton size="sm" label={`Move ${p.name} up`} disabled={i === 0 || busy} onClick={(e) => { e.stopPropagation(); void movePage(p.id, -1); }}>
                      <ArrowUp size={12} />
                    </IconButton>
                    <IconButton size="sm" label={`Move ${p.name} down`} disabled={i === pages.length - 1 || busy} onClick={(e) => { e.stopPropagation(); void movePage(p.id, 1); }}>
                      <ArrowDown size={12} />
                    </IconButton>
                    <IconButton size="sm" label={`Duplicate ${p.name}`} disabled={busy || (viewType === 'design' && !p.file)} onClick={(e) => { e.stopPropagation(); void duplicatePage(p.id); }}>
                      <Copy size={12} />
                    </IconButton>
                    <IconButton size="sm" label={home ? 'The home page can’t be deleted' : `Delete ${p.name}`} disabled={home || busy} onClick={(e) => { e.stopPropagation(); remove(); }}>
                      <Trash2 size={12} />
                    </IconButton>
                  </>
                )
              }
            >
              {renaming === p.id ? (
                <RowRename
                  value={p.name}
                  label={`Rename page ${p.name}`}
                  onCancel={() => setRenaming(null)}
                  onCommit={(v) => {
                    setRenaming(null);
                    void renamePage(p.id, v);
                  }}
                />
              ) : undefined}
            </FrameRow>
          );
        })}
        {adding && (
          <div className="frame-row frame-row--adding" role="listitem">
            <select
              className="pages-add__type"
              aria-label="Page type"
              value={addType}
              onChange={(e) => setAddType(e.target.value as PageViewType)}
            >
              {PAGE_VIEW_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="frame-row__text">
              <RowRename
                value={addType === 'design' ? 'New page' : PAGE_VIEW_TYPES.find((t) => t.id === addType)?.label ?? 'New page'}
                label="New page name"
                onCancel={() => setAdding(false)}
                onCommit={(v) => {
                  setAdding(false);
                  if (v.trim()) void createPage(v, addType);
                }}
              />
            </span>
          </div>
        )}
      </div>
      {runtime.length > 0 && (
        <>
          <SectionLabel>Found at runtime</SectionLabel>
          <div className="frame-list" role="list" aria-label="Routes found at runtime">
            {runtime.map((path) => (
              <FrameRow key={path} role="listitem" icon={Compass} name={path} meta="Visited in the preview" title="Show this route in the active frame" onClick={() => { const id = getState().activeFrameId; if (id) sendToFrame(id, 'navigate', { path }); }} />
            ))}
          </div>
        </>
      )}
      {pagesNote && <p className="frame-list__hint">{pagesNote}</p>}
    </>
  );
}
