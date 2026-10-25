import { CloudSync, FolderOpen, FolderSearch, GlobeCheck, Laptop, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FRAMEWORK_LABELS } from '../../shared/types';
import { closeProject, openProjectDialog } from '../lib/actions';
import { api } from '../lib/api';
import { sendToPreview } from '../lib/bridge';
import { stopInlineEdit } from '../lib/inline-edit';
import { setState, useStore } from '../lib/store';
import { Menu, MenuItem } from '../ui/primitives.jsx';
import { Divider, ModeSwitch, PanelsButton, PreviewButton, ProjectButton, TopBar as Bar } from '../ui/TopBar.jsx';
import { togglePanels } from '../lib/panels';
import { CanvasBgControl } from './CanvasBgControl';
import { openFullPreview } from './FullPreview';
import { GoLiveButton } from './GoLive';
import { ProjectTabs } from './ProjectTabs';

const liveKey = (root: string) => `oc-live:${root}`;
const publishedKey = (root: string) => `oc-published:${root}`;

type ProjectPlace = 'local' | 'cloud' | 'both';

function projectPlace(root: string, remote: string | null | undefined): ProjectPlace {
  const local = Boolean(root);
  const cloud =
    Boolean(remote) ||
    localStorage.getItem(publishedKey(root)) === 'true' ||
    Boolean(localStorage.getItem(liveKey(root)));
  if (local && cloud) return 'both';
  if (cloud) return 'cloud';
  return 'local';
}

/** Laptop = on this computer · Cloud = remote only · Globe = local + cloud. */
function ProjectPlaceBadge() {
  const project = useStore((s) => s.project)!;
  const remote = useStore((s) => s.gitStatus?.remote);
  const place = useMemo(() => projectPlace(project.root, remote), [project.root, remote]);

  useEffect(() => {
    let alive = true;
    void api.git
      .status()
      .then((gitStatus) => {
        if (alive) setState({ gitStatus });
      })
      .catch(() => {
        if (alive) setState({ gitStatus: null });
      });
    return () => {
      alive = false;
    };
  }, [project.root]);

  const meta =
    place === 'both'
      ? { Icon: GlobeCheck, label: 'On this computer and in the cloud', tip: 'Local project linked to a remote' }
      : place === 'cloud'
        ? { Icon: CloudSync, label: 'Cloud project', tip: 'Working in the cloud — not stored on this computer' }
        : { Icon: Laptop, label: 'On this computer', tip: 'Local project — changes save to files on this computer' };

  return (
    <span
      className="project-place"
      role="img"
      aria-label={meta.label}
      title={meta.tip}
      data-tip={meta.tip}
      data-tip-side="bottom"
      data-place={place}
    >
      <meta.Icon size={15} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

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

export function setInteract(next: boolean) {
  if (next) stopInlineEdit(true);
  setState({ interact: next, tool: 'select' });
  sendToPreview('mode', { mode: next ? 'interact' : 'select' });
}

export function TopBar() {
  const mode = useStore((s) => s.mode);
  const panelsHidden = useStore((s) => s.panelsHidden.left && s.panelsHidden.right);

  return (
    <Bar
      start={
        <>
          <ProjectMenu />
          <ProjectPlaceBadge />
          <CanvasBgControl />
        </>
      }
      center={<ProjectTabs />}
      end={
        <>
          <PreviewButton onClick={openFullPreview} />
          <PanelsButton hidden={panelsHidden} onClick={togglePanels} />
          <Divider />
          <ModeSwitch value={mode} onChange={(id) => setState({ mode: id })} />
          <Divider />
          <GoLiveButton />
        </>
      }
    />
  );
}
