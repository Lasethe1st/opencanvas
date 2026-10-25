import { FolderOpen, RotateCcw, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { closeProjectTab, openProjectDialog, reopenClosedProject, switchProjectTab } from '../lib/actions';
import { getState, setState, useStore } from '../lib/store';
import { reorderTabs } from '../lib/workspace-session';
import { cx } from '../ui/primitives.jsx';

/** Browser-style project tabs for soft multi-project switching. */
export function ProjectTabs() {
  const tabs = useStore((s) => s.openProjects);
  const active = useStore((s) => s.activeProjectRoot);
  const closed = useStore((s) => s.closedProjectRoots);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const dragOver = useRef<number | null>(null);

  if (tabs.length === 0) return null;

  return (
    <div className="project-tabs" role="tablist" aria-label="Open projects" data-in-topbar="">
      <div className="project-tabs__list">
        {tabs.map((tab, index) => {
          const isActive = tab.root === active;
          return (
            <div
              key={tab.root}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={cx('project-tabs__tab', isActive && 'is-active')}
              title={tab.root}
              draggable
              onDragStart={() => setDragFrom(index)}
              onDragOver={(e) => {
                e.preventDefault();
                dragOver.current = index;
              }}
              onDragEnd={() => {
                if (dragFrom != null && dragOver.current != null && dragFrom !== dragOver.current) {
                  setState({ openProjects: reorderTabs(getState().openProjects, dragFrom, dragOver.current) });
                }
                setDragFrom(null);
                dragOver.current = null;
              }}
              onClick={() => void switchProjectTab(tab.root)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void switchProjectTab(tab.root);
                }
              }}
            >
              <FolderOpen size={12} aria-hidden />
              <span className="project-tabs__name">{tab.name}</span>
              <button
                type="button"
                className="project-tabs__close"
                aria-label={`Close ${tab.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void closeProjectTab(tab.root);
                }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="project-tabs__actions">
        {closed.length > 0 && (
          <button type="button" className="project-tabs__action" aria-label="Reopen closed project" title="Reopen closed project" onClick={() => void reopenClosedProject()}>
            <RotateCcw size={13} />
          </button>
        )}
        <button type="button" className="project-tabs__action" aria-label="Open another project" title="Open another project" onClick={() => void openProjectDialog()}>
          +
        </button>
      </div>
    </div>
  );
}
