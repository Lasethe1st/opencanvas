import { FileText, FolderOpen, Search, Sparkles } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { RecentProject, TemplateId, TemplateMeta } from '../../../shared/types';
import { createProject, importFromGithub, importZip, openFileFromDisk, openProjectDialog, openRecent } from '../../lib/actions';
import { GithubMark, ProjectIcon } from '../../ui/StartScreen.jsx';
import { ProjectRow, ProjectRowSkeletons } from './ProjectRow';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const GITHUB_REPO = /^(?:(?:https?:\/\/)?(?:www\.)?github\.com\/|git@github\.com:)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i;

/** "owner/repo" when the text names a GitHub repository. */
export function githubRepo(text: string): string | null {
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

function Lead({ children }: { children: ReactNode }) {
  return <p className="mb-3 ps-1 text-sm text-muted-foreground">{children}</p>;
}

function Foot({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 truncate ps-1 text-xs text-muted-foreground" title={typeof children === 'string' ? children : undefined}>
      {children}
    </p>
  );
}

export function NewProjectPanel({ location, busy, onSetup }: { location: string; busy: boolean; onSetup: () => void }) {
  const [name, setName] = useState('');
  const create = () => void createProject('blank', name.trim() || 'Untitled project');
  return (
    <div className="flex flex-col gap-2">
      <Lead>A React + Vite app with an empty page, ready for your first section.</Lead>
      <button
        type="button"
        disabled={busy}
        onClick={onSetup}
        className="flex w-full items-start gap-3 rounded-lg border border-border bg-muted/50 p-3 text-start transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        <Sparkles className="mt-0.5 shrink-0" aria-hidden />
        <span className="grid gap-0.5">
          <strong className="text-sm font-medium">Get help from AI</strong>
          <span className="text-xs text-muted-foreground">Set a visual direction, fonts and references first, then hand the brief to your agent.</span>
        </span>
      </button>
      <Input data-autofocus aria-label="Project name" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      <Button disabled={busy} onClick={create}>
        {busy ? 'Creating…' : 'Create project'}
      </Button>
      {location && <Foot>Saved to {location}</Foot>}
    </div>
  );
}

export function GithubPanel({ initial, location, busy }: { initial: string; location: string; busy: boolean }) {
  const [repo, setRepo] = useState(initial);
  const submit = async () => {
    if (!repo.trim() || busy) return;
    await importFromGithub(repo.trim());
  };
  return (
    <div className="flex flex-col gap-2">
      <Lead>Clone a React project and open it. Private repositories use your GitHub sign-in.</Lead>
      <Input data-autofocus aria-label="Repository" placeholder="owner/repo or github.com URL" value={repo} disabled={busy} onChange={(e) => setRepo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
      <Button disabled={busy || !repo.trim()} onClick={() => void submit()}>
        <GithubMark size={14} />
        {busy ? 'Cloning…' : 'Import repository'}
      </Button>
      {location && <Foot>Cloned into {location}</Foot>}
    </div>
  );
}

export function TemplatesPanel({ templates, location, busy }: { templates: TemplateMeta[]; location: string; busy: boolean }) {
  const choices = templates.filter((t) => t.id !== 'blank');
  const [selected, setSelected] = useState<TemplateId>('landing');
  const [name, setName] = useState('');
  const meta = choices.find((t) => t.id === selected);
  const create = () => void createProject(selected, name.trim() || (meta?.name ?? 'My site'));
  return (
    <div className="flex flex-col gap-2">
      <Lead>Start from a ready-made page. It’s regular React code you own.</Lead>
      <div role="radiogroup" aria-label="Template" className="flex flex-col gap-1">
        {choices.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected === t.id}
            onClick={() => setSelected(t.id)}
            onDoubleClick={create}
            className={cn(
              'rounded-lg border p-2.5 text-start transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              selected === t.id ? 'border-ring bg-accent' : 'border-border',
            )}
          >
            <strong className="block text-sm font-medium">{t.name}</strong>
            <span className="block text-xs text-muted-foreground">{t.description}</span>
          </button>
        ))}
      </div>
      <Input aria-label="Project name" data-autofocus placeholder={`Project name (${meta?.name ?? ''})`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      <Button disabled={busy} onClick={create}>
        {busy ? 'Creating…' : `Use ${meta?.name ?? 'template'}`}
      </Button>
      {location && <Foot>Saved to {location}</Foot>}
    </div>
  );
}

export function OpenPanel() {
  return (
    <div className="flex flex-col gap-1">
      <Lead>Open an existing project or a single file.</Lead>
      <Button variant="outline" className="justify-start" data-autofocus onClick={() => void openProjectDialog()}>
        <FolderOpen data-icon="inline-start" />
        Open folder
      </Button>
      <Button variant="outline" className="justify-start" onClick={() => void openFileFromDisk()}>
        <FileText data-icon="inline-start" />
        Open file
      </Button>
      <Button variant="outline" className="justify-start" onClick={() => void importZip()}>
        Import .zip
      </Button>
    </div>
  );
}

function RecentList({ recent, matches, repo, activeRow, showActive, onHover, onRun }: { recent: RecentProject[] | null; matches: RecentProject[]; repo: string | null; activeRow: number; showActive: boolean; onHover: (i: number) => void; onRun: (i: number) => void }) {
  if (recent === null) return <ProjectRowSkeletons />;
  return (
    <div className="flex flex-col gap-0.5">
      {repo && (
        <ProjectRow
          icon={
            <span className="project-icon project-icon--github">
              <GithubMark size={15} />
            </span>
          }
          name={`Import ${repo}`}
          path="Clone from GitHub into your projects folder"
          detail="Clone from GitHub into your projects folder"
          hint="Enter"
          active={showActive && activeRow === 0}
          onMouseEnter={() => onHover(0)}
          onClick={() => onRun(0)}
        />
      )}
      {matches.map((p, i) => {
        const index = repo ? i + 1 : i;
        return <ProjectRow key={p.root} icon={<ProjectIcon src={p.icon} name={p.name} />} name={p.name} detail={timeAgo(p.openedAt)} path={p.root} active={showActive && activeRow === index} onMouseEnter={() => onHover(index)} onClick={() => onRun(index)} />;
      })}
    </div>
  );
}

export function RecentPanel({ recent }: { recent: RecentProject[] | null }) {
  return recent && recent.length === 0 ? (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No projects yet</EmptyTitle>
        <EmptyDescription>Projects you open or create will show up here.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ) : (
    <RecentList recent={recent} matches={recent ?? []} repo={null} activeRow={0} showActive={false} onHover={() => {}} onRun={(i) => recent?.[i] && void openRecent(recent[i].root)} />
  );
}

export function SearchPanel({ recent, onGithub }: { recent: RecentProject[] | null; onGithub: (repo: string) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const repo = githubRepo(query);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = recent ?? [];
    return q ? list.filter((p) => p.name.toLowerCase().includes(q) || p.root.toLowerCase().includes(q)) : list;
  }, [recent, query]);
  const rows = repo ? matches.length + 1 : matches.length;
  const activeRow = Math.min(active, Math.max(0, rows - 1));
  const searching = !!query.trim();

  const run = (index: number) => {
    if (repo && index === 0) return onGithub(repo);
    const project = matches[repo ? index - 1 : index];
    if (project) void openRecent(project.root);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows) setActive((activeRow + (e.key === 'ArrowDown' ? 1 : rows - 1)) % rows);
    } else if (e.key === 'Enter' && searching && rows) {
      e.preventDefault();
      run(activeRow);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden />
        </InputGroupAddon>
        <InputGroupInput data-autofocus aria-label="Search projects" placeholder="Search projects or paste a repo" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} />
      </InputGroup>
      {recent !== null && rows === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{searching ? 'No results' : 'No projects yet'}</EmptyTitle>
            <EmptyDescription>{searching ? `No projects match “${query.trim()}”.` : 'Projects you open or create will show up here.'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <RecentList recent={recent} matches={matches} repo={repo} activeRow={activeRow} showActive={searching} onHover={(i) => searching && setActive(i)} onRun={run} />
      )}
    </div>
  );
}
