import { File, FileArchive, Folder, FolderOpen, LayoutTemplate, Plus, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { RecentProject, TemplateId, TemplateMeta } from '../../shared/types';
import { createProject, importFromGithub, importZip, openFileFromDisk, openProjectDialog, openRecent } from '../lib/actions';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { Dialog } from '../ui/Overlays.jsx';
import { ProjectSetup } from './ProjectSetup';
import { Button, Menu, MenuItem } from '../ui/primitives.jsx';
import { ActionPill, GithubMark, ProjectIcon, RecentItem, RecentList, SearchPill, StartScreen, TemplateArt, TemplateCard, TemplateGrid } from '../ui/StartScreen.jsx';
type Modal = 'new' | 'github' | 'templates' | 'setup' | null;

const GITHUB_REPO = /^(?:(?:https?:\/\/)?(?:www\.)?github\.com\/|git@github\.com:)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i;

/** "owner/repo" when the text names a GitHub repository. */
function githubRepo(text: string): string | null {
  const value = text.trim();
  if (!value.includes('/') || /\s/.test(value)) return null;
  return GITHUB_REPO.exec(value)?.[1] ?? null;
}

function timeAgo(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Onboarding() {
  const busy = useStore((s) => s.busy);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [location, setLocation] = useState('');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [repoDraft, setRepoDraft] = useState('');
  const [openMenu, setOpenMenu] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.templates().then(setTemplates);
    void api.recentProjects().then(setRecent);
    void api.defaultLocation().then(setLocation);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal) {
        if (e.key === 'Escape' && modal !== 'setup' && !useStore.getState().busy) setModal(null);
        return;
      }
      const typing = e.target instanceof HTMLElement && !!e.target.closest('input, textarea');
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  useEffect(() => {
    if (!openMenu) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !openRef.current?.contains(e.target as Node)) setOpenMenu(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [openMenu]);

  const repo = githubRepo(query);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = recent ?? [];
    return q ? list.filter((p) => p.name.toLowerCase().includes(q) || p.root.toLowerCase().includes(q)) : list;
  }, [recent, query]);
  const rows = repo ? matches.length + 1 : matches.length;
  const activeRow = Math.min(active, Math.max(0, rows - 1));

  const runRow = (index: number) => {
    if (repo && index === 0) {
      setRepoDraft(repo);
      setModal('github');
      return;
    }
    const project = matches[repo ? index - 1 : index];
    if (project) void openRecent(project.root);
  };

  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows) setActive((activeRow + (e.key === 'ArrowDown' ? 1 : rows - 1)) % rows);
    } else if (e.key === 'Enter' && query.trim() && rows) {
      e.preventDefault();
      runRow(activeRow);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      setQuery('');
    }
  };

  const searching = !!query.trim();
  const showActive = searching && rows > 0;

  if (modal === 'setup') return <ProjectSetup location={location} onBack={() => setModal('new')} />;

  return (
    <StartScreen
      search={
        <SearchPill
          ref={searchRef}
          autoFocus
          aria-label="Search projects"
          placeholder="Search projects, or paste a GitHub repo"
          hint="Ctrl K"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onSearchKey}
        />
      }
      actions={
        <>
          <ActionPill tone="blue" icon={<Plus size={16} />} onClick={() => setModal('new')}>
            Start new project
          </ActionPill>
          <ActionPill
            tone="violet"
            icon={<GithubMark size={15} />}
            onClick={() => {
              setRepoDraft(repo ?? '');
              setModal('github');
            }}
          >
            Import from GitHub
          </ActionPill>
          <ActionPill tone="green" icon={<LayoutTemplate size={16} />} onClick={() => setModal('templates')}>
            Use templates
          </ActionPill>
          <div ref={openRef} className="action-pill-wrap">
            <ActionPill tone="amber" icon={<Folder size={16} />} aria-haspopup="menu" aria-expanded={openMenu} className={openMenu ? 'is-open' : undefined} onClick={() => setOpenMenu((v) => !v)}>
              Open folder / file
            </ActionPill>
            {openMenu && (
              <Menu className="popover open-menu" style={{ left: 0, top: 'calc(100% + 6px)', minWidth: 200 }}>
                <MenuItem
                  icon={<FolderOpen size={14} />}
                  onClick={() => {
                    setOpenMenu(false);
                    void openProjectDialog();
                  }}
                >
                  Open folder…
                </MenuItem>
                <MenuItem
                  icon={<File size={14} />}
                  onClick={() => {
                    setOpenMenu(false);
                    void openFileFromDisk();
                  }}
                >
                  Open file…
                </MenuItem>
                <MenuItem
                  icon={<FileArchive size={14} />}
                  onClick={() => {
                    setOpenMenu(false);
                    void importZip();
                  }}
                >
                  Import ZIP…
                </MenuItem>
              </Menu>
            )}
          </div>
        </>
      }
      recent={
        recent && (
          <RecentList
            title={searching ? 'Results' : 'Recent files'}
            empty={
              rows === 0 &&
              (searching ? `No projects match “${query.trim()}”.` : 'Projects you open or create will show up here.')
            }
          >
            {repo && (
              <RecentItem
                icon={
                  <span className="project-icon project-icon--github">
                    <GithubMark size={15} />
                  </span>
                }
                name={`Import ${repo}`}
                path="Clone from GitHub into your projects folder"
                meta="Enter"
                active={showActive && activeRow === 0}
                onMouseEnter={() => setActive(0)}
                onClick={() => runRow(0)}
              />
            )}
            {matches.map((p, i) => {
              const index = repo ? i + 1 : i;
              return (
                <RecentItem
                  key={p.root}
                  icon={<ProjectIcon src={p.icon} name={p.name} />}
                  name={p.name}
                  path={p.root}
                  meta={timeAgo(p.openedAt)}
                  title={p.root}
                  active={showActive && activeRow === index}
                  onMouseEnter={() => searching && setActive(index)}
                  onClick={() => runRow(index)}
                />
              );
            })}
          </RecentList>
        )
      }
    >
      {modal === 'new' && <NewProjectDialog location={location} busy={busy} onClose={() => setModal(null)} onSetup={() => setModal('setup')} />}
      {modal === 'github' && <GithubDialog initial={repoDraft} location={location} busy={busy} onClose={() => setModal(null)} />}
      {modal === 'templates' && <TemplatesDialog templates={templates} location={location} busy={busy} onClose={() => setModal(null)} />}
    </StartScreen>
  );
}

function NewProjectDialog({ location, busy, onClose, onSetup }: { location: string; busy: boolean; onClose: () => void; onSetup: () => void }) {
  const [name, setName] = useState('');
  const create = () => void createProject('blank', name.trim() || 'Untitled project');
  return (
    <Dialog title="Start new project" className="dialog start-dialog" onClose={onClose}>
      <p className="start-dialog__lead">A React + Vite app with an empty page, ready for your first section.</p>
      <button type="button" className="start-dialog__ai" onClick={onSetup} disabled={busy}>
        <Sparkles size={15} aria-hidden />
        <span>
          <strong>Get help from AI</strong>
          <span>Set a visual direction, fonts and references first, then hand the brief to your agent.</span>
        </span>
      </button>
      <input
        className="start-dialog__input"
        autoFocus
        aria-label="Project name"
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && create()}
      />
      <div className="start-dialog__foot">
        <span className="start-dialog__where" title={location}>
          {location && `Saved to ${location}`}
        </span>
        <Button variant="primary" disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Create project'}
        </Button>
      </div>
    </Dialog>
  );
}

function GithubDialog({ initial, location, busy, onClose }: { initial: string; location: string; busy: boolean; onClose: () => void }) {
  const [repo, setRepo] = useState(initial);
  const submit = async () => {
    if (!repo.trim() || busy) return;
    await importFromGithub(repo.trim());
  };
  return (
    <Dialog title="Import from GitHub" className="dialog start-dialog" onClose={busy ? undefined : onClose}>
      <p className="start-dialog__lead">Clone a React project and open it. Private repositories use your GitHub sign-in.</p>
      <input
        className="start-dialog__input"
        autoFocus
        aria-label="Repository"
        placeholder="owner/repo or https://github.com/owner/repo"
        value={repo}
        disabled={busy}
        onChange={(e) => setRepo(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
      />
      <div className="start-dialog__foot">
        <span className="start-dialog__where" title={location}>
          {location && `Cloned into ${location}`}
        </span>
        <Button variant="primary" icon={<GithubMark size={13} />} disabled={busy || !repo.trim()} onClick={() => void submit()}>
          {busy ? 'Cloning…' : 'Import'}
        </Button>
      </div>
    </Dialog>
  );
}

function TemplatesDialog({ templates, location, busy, onClose }: { templates: TemplateMeta[]; location: string; busy: boolean; onClose: () => void }) {
  const choices = templates.filter((t) => t.id !== 'blank');
  const [selected, setSelected] = useState<TemplateId>('landing');
  const [name, setName] = useState('');
  const meta = choices.find((t) => t.id === selected);
  const create = () => void createProject(selected, name.trim() || (meta?.name ?? 'My site'));
  return (
    <Dialog title="Use a template" className="dialog start-dialog start-dialog--wide" onClose={onClose}>
      <TemplateGrid>
        {choices.map((t) => (
          <TemplateCard key={t.id} art={<TemplateArt id={t.id} />} name={t.name} description={t.description} selected={selected === t.id} onClick={() => setSelected(t.id)} onDoubleClick={create} />
        ))}
      </TemplateGrid>
      <div className="start-dialog__foot">
        <input
          className="start-dialog__input"
          aria-label="Project name"
          placeholder={`Project name (${meta?.name ?? ''})`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <span className="start-dialog__where" title={location}>
          {location && `Saved to ${location}`}
        </span>
        <Button variant="primary" disabled={busy} onClick={create}>
          {busy ? 'Creating…' : `Use ${meta?.name ?? 'template'}`}
        </Button>
      </div>
    </Dialog>
  );
}
