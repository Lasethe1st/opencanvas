import { ArrowDown, ArrowUp, Compass, Copy, FileText, Home, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { runtimeOnlyPaths } from '../../shared/source/routes';
import { sendToFrame } from '../lib/bridge';
import { plural } from '../lib/plural';
import { createPage, deletePage, duplicatePage, focusPage, framesOf, movePage, renamePage } from '../lib/pages';
import { activeFrame, getState, pageOf, useStore } from '../lib/store';
import { FrameRow } from '../ui/FramesPanel.jsx';
import { IconButton, SectionLabel } from '../ui/primitives.jsx';

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

/** Pages of the project: each page is a route, shown in its own frames on the canvas. */
export function PagesSection() {
  const state = useStore((s) => s.projectConfig);
  const activeId = useStore((s) => pageOf(activeFrame(s), s)?.id);
  useStore((s) => s.frames);
  const busy = useStore((s) => s.busy);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const visited = useStore((s) => s.visitedPaths);
  if (!state) return null;
  const { pages, canEditPages, pagesNote } = state;
  const runtime = state.routing === 'react-router' ? runtimeOnlyPaths(pages.map((p) => p.path), visited) : [];

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
          const home = p.path === '/';
          const remove = () => !home && confirmDelete(p.name) && void deletePage(p.id);
          return (
            <FrameRow
              key={p.id}
              role="listitem"
              icon={home ? Home : FileText}
              name={p.name}
              meta={`${p.path} · ${plural(count, 'frame', 'frames').replace(' ', '\u00a0')}`}
              active={p.id === activeId}
              title={canEditPages ? 'F2 to rename, Alt+↑/↓ to reorder' : undefined}
              onClick={() => focusPage(p.id)}
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
                    <IconButton size="sm" label={`Duplicate ${p.name}`} disabled={!p.file || busy} onClick={(e) => { e.stopPropagation(); void duplicatePage(p.id); }}>
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
          <div className="frame-row" role="listitem">
            <FileText size={14} className="frame-row__icon" />
            <span className="frame-row__text">
              <RowRename
                value="New page"
                label="New page name"
                onCancel={() => setAdding(false)}
                onCommit={(v) => {
                  setAdding(false);
                  if (v.trim()) void createPage(v);
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
