import { Check, CloudSync, FolderOpen, FolderSearch, GlobeCheck, Laptop, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FRAMEWORK_LABELS, type RecentProject } from '../../shared/types';
import { closeProject, openProjectDialog, switchProjectTab } from '../lib/actions';
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

/** House & tree painting — https://unsplash.com/photos/a-painting-of-a-house-and-a-tree-4ewHoDJOSf4 */
const USER_AVATAR_SRC =
  'https://images.unsplash.com/photo-1699391202798-bec3f1c894bc?w=96&h=96&fit=crop&auto=format&q=80';

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
  const openProjects = useStore((s) => s.openProjects);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void api
      .recentProjects()
      .then((list) => {
        if (alive) setRecent(list);
      })
      .catch(() => {
        if (alive) setRecent([]);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const run = (fn: () => unknown) => () => {
    setOpen(false);
    void fn();
  };

  const openRoots = new Set(openProjects.map((t) => t.root));
  const otherOpen = openProjects.filter((t) => t.root !== project.root);
  const otherRecent = recent.filter((r) => r.root !== project.root && !openRoots.has(r.root));

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0 }} title={project.root}>
      <ProjectButton name={project.name} onClick={() => setOpen((v) => !v)} />
      {open && (
        <Menu style={{ left: 0, top: 'calc(100% + 6px)', minWidth: 240 }}>
          <div className="menu-title">
            {FRAMEWORK_LABELS[project.framework]} · {project.packageManager}
          </div>
          <MenuItem icon={<Check size={14} />} onClick={() => setOpen(false)}>
            {project.name}
          </MenuItem>
          {(otherOpen.length > 0 || otherRecent.length > 0) && <div className="menu-title">Switch project</div>}
          {otherOpen.map((tab) => (
            <MenuItem
              key={tab.root}
              icon={<FolderOpen size={14} />}
              onClick={run(() => switchProjectTab(tab.root))}
            >
              {tab.name}
            </MenuItem>
          ))}
          {otherRecent.map((r) => (
            <MenuItem
              key={r.root}
              icon={<FolderOpen size={14} />}
              onClick={run(() => switchProjectTab(r.root))}
            >
              {r.name}
            </MenuItem>
          ))}
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

/** Circular profile image — same height as the mode switch. */
function UserAvatar() {
  return (
    <button type="button" className="user-avatar" aria-label="Account" title="Account" data-tip="Account" data-tip-side="bottom">
      <img src={USER_AVATAR_SRC} alt="" width={32} height={32} draggable={false} referrerPolicy="no-referrer" />
    </button>
  );
}

export function setInteract(next: boolean) {
  if (next) stopInlineEdit(true);
  setState({ interact: next, tool: 'select' });
  sendToPreview('mode', { mode: next ? 'interact' : 'select' });
}

export function TopBar() {
  const mode = useStore((s) => s.mode);
  const interact = useStore((s) => s.interact);
  const panelsHidden = useStore((s) => s.panelsHidden.left && s.panelsHidden.right);
  const switchValue = mode === 'code' ? 'code' : interact ? 'interact' : 'visual';

  return (
    <Bar
      start={
        <>
          <ProjectMenu />
          <ProjectPlaceBadge />
          <CanvasBgControl />
        </>
      }
      center={
        <ModeSwitch
          value={switchValue}
          onChange={(id) => {
            if (id === 'code') {
              stopInlineEdit(true);
              setState({ mode: 'code', interact: false, tool: 'select' });
              sendToPreview('mode', { mode: 'select' });
              return;
            }
            const nextInteract = id === 'interact';
            stopInlineEdit(true);
            setState({ mode: 'visual', interact: nextInteract, tool: 'select' });
            sendToPreview('mode', { mode: nextInteract ? 'interact' : 'select' });
          }}
        />
      }
      end={
        <>
          <PreviewButton onClick={openFullPreview} />
          <PanelsButton hidden={panelsHidden} onClick={togglePanels} />
          <Divider />
          <UserAvatar />
          <Divider />
          <GoLiveButton />
        </>
      }
    />
  );
}
