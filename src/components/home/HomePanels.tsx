import { ArrowLeft, CaretRight, ChatsCircle, FileText, FolderOpen, MagnifyingGlass, Sparkle } from '../../lib/home-icons';
import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { RecentProject, TemplateId, TemplateMeta } from '../../../shared/types';
import { titleFromPrompt, type HomeChat } from '../../lib/home-chats';
import { createProject, importFromGithub, importZip, openFileFromDisk, openProjectDialog, openRecent } from '../../lib/actions';
import { GithubMark, ProjectIcon } from '../../ui/StartScreen.jsx';
import type { HomeMenuAction } from './HomeItemMenu';
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
  return <p className="mb-3 text-sm text-muted-foreground">{children}</p>;
}

function Foot({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 truncate text-xs text-muted-foreground" title={typeof children === 'string' ? children : undefined}>
      {children}
    </p>
  );
}

export function NewProjectPanel({ busy, onSetup }: { busy: boolean; onSetup: () => void }) {
  const [name, setName] = useState('');
  const create = () => void createProject('blank', name.trim() || 'Untitled project');
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={onSetup}
        className="flex w-full flex-col items-start gap-2 rounded-2xl border-0 bg-muted/50 p-3 text-start transition-colors duration-150 hover:bg-accent focus-visible:bg-accent disabled:opacity-50"
      >
        <Sparkle className="shrink-0" aria-hidden />
        <span className="grid gap-0.5">
          <strong className="text-sm font-medium">Get help from AI</strong>
          <span className="text-xs text-muted-foreground">Set a visual direction, fonts and references first, then hand the brief to your agent.</span>
        </span>
      </button>
      <Input data-autofocus aria-label="Project name" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      <Button disabled={busy} onClick={create}>
        {busy ? 'Creating…' : 'Create project'}
      </Button>
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
              'rounded-2xl border-0 p-2.5 text-start transition-colors duration-150 hover:bg-accent focus-visible:bg-secondary',
              selected === t.id ? 'bg-accent' : 'bg-muted/40',
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

export function RecentChatsPanel({
  chats,
  onPick,
  menuFor,
}: {
  chats: HomeChat[];
  onPick: (chat: HomeChat) => void;
  menuFor?: (chat: HomeChat) => HomeMenuAction[];
}) {
  if (!chats.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No chats yet</EmptyTitle>
          <EmptyDescription>Describe a project in the box and it will show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="flex flex-col gap-0.5">
      {chats.map((chat) => (
        <ProjectRow
          key={chat.id}
          name={titleFromPrompt(chat.text)}
          detail={timeAgo(chat.at)}
          path={chat.text}
          menu={menuFor?.(chat)}
          onClick={() => onPick(chat)}
        />
      ))}
    </div>
  );
}

export type NewView = 'start' | 'github' | 'open';

const MORE_WAYS: { id: Exclude<NewView, 'start'>; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'github', label: 'Import from GitHub', icon: GithubIconSmall },
  { id: 'open', label: 'Open folder or file', icon: FolderOpen },
];

function GithubIconSmall({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      <GithubMark size={16} />
    </span>
  );
}

/** "New project": the quick start, with the other ways to begin one step further in. */
export function NewProjectFlow({
  view,
  onView,
  repoDraft,
  location,
  busy,
  onSetup,
}: {
  view: NewView;
  onView: (view: NewView) => void;
  repoDraft: string;
  location: string;
  busy: boolean;
  onSetup: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Moving between steps moves focus to the new step's first field.
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [view]);

  if (view === 'start')
    return (
      <div ref={ref} className="flex flex-col gap-3">
        <NewProjectPanel busy={busy} onSetup={onSetup} />
        <div className="flex flex-col gap-0.5 border-t border-border pt-2">
          <p className="mb-1 px-2 text-xs text-muted-foreground">Other ways to start</p>
          {MORE_WAYS.map(({ id, label, icon: Icon }) => (
            <Button key={id} variant="ghost" className="h-9 justify-start gap-3 px-2 [&_svg]:size-4" onClick={() => onView(id)}>
              <Icon />
              {label}
              <CaretRight className="ms-auto text-muted-foreground" />
            </Button>
          ))}
        </div>
      </div>
    );
  const title = MORE_WAYS.find((w) => w.id === view)!.label;
  return (
    <div ref={ref} className="flex flex-col gap-2">
      <Button variant="ghost" className="h-8 justify-start gap-2 px-2 [&_svg]:size-4" onClick={() => onView('start')}>
        <ArrowLeft />
        <span className="truncate">{title}</span>
      </Button>
      {view === 'github' ? <GithubPanel key={repoDraft} initial={repoDraft} location={location} busy={busy} /> : <OpenPanel />}
    </div>
  );
}

type SearchRow = { key: string; kind: 'repo' | 'project' | 'chat'; run: () => void; render: (active: boolean, hover: () => void) => ReactNode };

export function SearchPanel({ recent, chats, onGithub, onChat, onDone }: { recent: RecentProject[] | null; chats: HomeChat[]; onGithub: (repo: string) => void; onChat: (chat: HomeChat) => void; onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const repo = githubRepo(query);
  const q = query.trim().toLowerCase();
  const projects = useMemo(() => (recent ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.root.toLowerCase().includes(q)), [recent, q]);
  const matchedChats = useMemo(() => chats.filter((c) => !q || c.text.toLowerCase().includes(q)), [chats, q]);

  const rows: SearchRow[] = [];
  if (repo)
    rows.push({
      key: 'repo',
      kind: 'repo',
      run: () => onGithub(repo),
      render: (isActive, hover) => (
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
          active={isActive}
          onMouseEnter={hover}
          onClick={() => onGithub(repo)}
        />
      ),
    });
  for (const p of projects)
    rows.push({
      key: p.root,
      kind: 'project',
      run: () => void openRecent(p.root),
      render: (isActive, hover) => <ProjectRow icon={<ProjectIcon src={p.icon} name={p.name} />} name={p.name} detail={`Project · ${timeAgo(p.openedAt)}`} path={p.root} active={isActive} onMouseEnter={hover} onClick={() => void openRecent(p.root)} />,
    });
  for (const c of matchedChats)
    rows.push({
      key: c.id,
      kind: 'chat',
      run: () => onChat(c),
      render: (isActive, hover) => <ProjectRow icon={<ChatsCircle className="size-8 shrink-0 rounded-md bg-muted p-2" aria-hidden />} name={titleFromPrompt(c.text)} detail={`Chat · ${timeAgo(c.at)}`} path={c.text} active={isActive} onMouseEnter={hover} onClick={() => onChat(c)} />,
    });

  const activeRow = Math.min(active, Math.max(0, rows.length - 1));
  const run = (index: number) => {
    rows[index]?.run();
    onDone();
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length) setActive((activeRow + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
    } else if (e.key === 'Enter' && rows.length) {
      e.preventDefault();
      run(activeRow);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-2 bg-card px-2 pb-2 pt-2">
        <InputGroup className="h-[35px] rounded-[var(--r-pill)]">
          <InputGroupAddon>
            <MagnifyingGlass aria-hidden />
          </InputGroupAddon>
          <InputGroupInput data-autofocus aria-label="Search projects and chats" placeholder="Search projects and chats" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} />
        </InputGroup>
      </div>
      {recent !== null && rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{q ? 'No results' : 'Nothing here yet'}</EmptyTitle>
            <EmptyDescription>{q ? `Nothing matches “${query.trim()}”.` : 'Projects and chats you start will show up here.'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : recent === null ? (
        <ProjectRowSkeletons />
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map((row, i) => (
            <div key={row.key} onClickCapture={onDone}>
              {row.render(!!q && i === activeRow, () => q && setActive(i))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
