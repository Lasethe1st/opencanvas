import { FolderOpen, FolderSearch, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FRAMEWORK_LABELS } from '../../shared/types';
import { closeProject, openProjectDialog, selectElement } from '../lib/actions';
import { api } from '../lib/api';
import { sendToPreview } from '../lib/bridge';
import { stopInlineEdit } from '../lib/inline-edit';
import { findPath, hasUnsaved, setState, useStore } from '../lib/store';
import { Menu, MenuItem } from '../ui/primitives.jsx';
import { Brand, Breadcrumb, Divider, ModeSwitch, PreviewButton, ProjectButton, SaveStatus, TopBar as Bar } from '../ui/TopBar.jsx';
import { openFullPreview } from './FullPreview';
import { GoLiveButton } from './GoLive';
function ProjectMenu() {
  const project = useStore((s) => s.project)!;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const run = (fn: () => unknown) => () => {
    setOpen(false);
    void fn();
  };

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0 }} title={project.root}>
      <ProjectButton name={project.name} onClick={() => setOpen((v) => !v)} />
      {open && (
        <Menu style={{ left: 0, top: 'calc(100% + 6px)' }}>
          <div className="menu-title">
            {FRAMEWORK_LABELS[project.framework]} · {project.packageManager}
          </div>
          <MenuItem icon={<FolderSearch size={14} />} onClick={run(() => api.revealProject())}>
            Show in file explorer
          </MenuItem>
          <MenuItem icon={<FolderOpen size={14} />} onClick={run(openProjectDialog)}>
            Open another project…
          </MenuItem>
          <MenuItem icon={<X size={14} />} onClick={run(closeProject)}>
            Close project
          </MenuItem>
        </Menu>
      )}
    </div>
  );
}

function Crumbs() {
  const selection = useStore((s) => s.selection);
  const domTree = useStore((s) => s.domTree);
  const activeFile = useStore((s) => s.activeFile);
  const mode = useStore((s) => s.mode);

  if (mode === 'code') {
    const parts = activeFile ? activeFile.split('/') : ['No file open'];
    return <Breadcrumb items={parts.map((label, i) => ({ key: `${i}`, label }))} />;
  }
  const path = selection ? (findPath(domTree, selection.uid) ?? []) : [];
  if (!path.length) return <Breadcrumb items={[{ key: 'page', label: selection ? selection.name : 'Page' }]} />;
  const visible = path.slice(-4);
  const items = visible.map((node) => ({ key: node.uid, label: node.name, node }));
  if (path.length > visible.length) items.unshift({ key: 'more', label: '…', node: path[path.length - visible.length - 1] });
  return <Breadcrumb items={items} onSelect={(item) => selectElement(item.node.id, item.node.uid)} />;
}

export function setInteract(next: boolean) {
  if (next) stopInlineEdit(true);
  setState({ interact: next, tool: 'select' });
  sendToPreview('mode', { mode: next ? 'interact' : 'select' });
}

export function TopBar() {
  const mode = useStore((s) => s.mode);
  const dirty = useStore((s) => hasUnsaved(s));
  const busy = useStore((s) => s.busy);

  return (
    <Bar
      start={
        <>
          <Brand />
          <Divider />
          <ProjectMenu />
          <SaveStatus state={busy ? 'saving' : dirty ? 'dirty' : 'saved'} />
        </>
      }
      center={<Crumbs />}
      end={
        <>
          <PreviewButton onClick={openFullPreview} />
          <Divider />
          <ModeSwitch value={mode} onChange={(id) => setState({ mode: id })} />
          <Divider />
          <GoLiveButton />
        </>
      }
    />
  );
}
