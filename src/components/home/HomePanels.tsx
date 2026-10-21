import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { RecentProject, TemplateId, TemplateMeta } from '../../../shared/types';
import type { HomeChat } from '../../lib/home-chats';
import { createProject, importFromGithub, importZip, openFileFromDisk, openProjectDialog, openRecent } from '../../lib/actions';
import { ProjectRow, ProjectRowSkeletons } from './ProjectRow';
import {
  AiGenerate,
  ArrowLeft,
  Chat,
  Document,
  FolderOpen,
  Icon,
  LogoGithub,
  Search,
  Template,
  type LimeIcon,
} from '@/components/lime/icon';
import { Button } from '@/components/lime/ui/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/lime/ui/empty';
import { Field, FieldDescription, FieldLabel } from '@/components/lime/ui/field';
import { Input } from '@/components/lime/ui/input';
import { List, ListItem, ListIcon } from '@/components/lime/ui/list';
import { Radio, RadioGroup } from '@/components/lime/ui/radio';
import { Separator } from '@/components/lime/ui/separator';

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
  return <p className="mb-3 text-sm text-fg-2">{children}</p>;
}

function Foot({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 truncate text-sm text-fg-2" title={typeof children === 'string' ? children : undefined}>
      {children}
    </p>
  );
}

function ProjectMark({ src, name }: { src?: string | null; name: string }) {
  if (src) {
    return (
      <span className="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <img src={src} alt="" draggable={false} className="size-5 object-contain" />
      </span>
    );
  }
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-medium text-fg" aria-hidden>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function NewProjectPanel({ location, busy, onSetup }: { location: string; busy: boolean; onSetup: () => void }) {
  const [name, setName] = useState('');
  const create = () => void createProject('blank', name.trim() || 'Untitled project');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <Lead>A React + Vite app with an empty page, ready for your first section.</Lead>
      <List variant="plain">
        <ListItem
          leading={<ListIcon icon={AiGenerate} tone="accent" />}
          title="Get help from AI"
          description="Set a visual direction, fonts and references first, then hand the brief to your agent."
          onClick={onSetup}
          disabled={busy}
          chevron
        />
      </List>
      <Field name="projectName">
        <FieldLabel>Project name</FieldLabel>
        <Input data-autofocus placeholder="Untitled project" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button type="submit" pending={busy || undefined} disabled={busy}>
        Create project
      </Button>
      {location && <Foot>Saved to {location}</Foot>}
    </form>
  );
}

export function GithubPanel({ initial, location, busy }: { initial: string; location: string; busy: boolean }) {
  const [repo, setRepo] = useState(initial);
  const submit = async () => {
    if (!repo.trim() || busy) return;
    await importFromGithub(repo.trim());
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Lead>Clone a React project and open it. Private repositories use your GitHub sign-in.</Lead>
      <Field name="repo">
        <FieldLabel>Repository</FieldLabel>
        <Input data-autofocus placeholder="owner/repo or github.com/owner/repo" value={repo} disabled={busy} onChange={(e) => setRepo(e.target.value)} />
      </Field>
      <Button type="submit" icon={<Icon icon={LogoGithub} size={16} />} pending={busy || undefined} disabled={busy || !repo.trim()}>
        Import repository
      </Button>
      {location && <Foot>Cloned into {location}</Foot>}
    </form>
  );
}

export function TemplatesPanel({ templates, location, busy }: { templates: TemplateMeta[]; location: string; busy: boolean }) {
  const choices = templates.filter((t) => t.id !== 'blank');
  const [selected, setSelected] = useState<TemplateId>('landing');
  const [name, setName] = useState('');
  const meta = choices.find((t) => t.id === selected);
  const create = () => void createProject(selected, name.trim() || (meta?.name ?? 'My site'));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <Lead>Start from a ready-made page. It’s regular React code you own.</Lead>
      <RadioGroup aria-label="Template" value={selected} onValueChange={(v) => setSelected(v as TemplateId)} className="gap-2">
        {choices.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-start gap-3 rounded-panel border border-line bg-surface p-3 has-data-checked:border-accent-line has-data-checked:bg-accent-wash"
          >
            <Radio value={t.id} className="mt-0.5" />
            <span className="grid min-w-0 gap-0.5">
              <span className="text-sm font-medium text-fg">{t.name}</span>
              <span className="text-sm text-fg-2">{t.description}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <Field name="templateName">
        <FieldLabel>Project name</FieldLabel>
        <Input data-autofocus placeholder={meta?.name ?? 'My site'} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button type="submit" pending={busy || undefined} disabled={busy}>
        Use {meta?.name ?? 'template'}
      </Button>
      {location && <Foot>Saved to {location}</Foot>}
    </form>
  );
}

export function OpenPanel() {
  return (
    <div className="flex flex-col gap-2">
      <Lead>Open an existing project or a single file.</Lead>
      <Button variant="outline" className="w-full justify-start" data-autofocus icon={<Icon icon={FolderOpen} size={16} />} onClick={() => void openProjectDialog()}>
        Open folder
      </Button>
      <Button variant="outline" className="w-full justify-start" icon={<Icon icon={Document} size={16} />} onClick={() => void openFileFromDisk()}>
        Open file
      </Button>
      <Button variant="outline" className="w-full justify-start" onClick={() => void importZip()}>
        Import .zip
      </Button>
    </div>
  );
}

function RecentList({ recent, matches, repo, activeRow, showActive, onHover, onRun }: { recent: RecentProject[] | null; matches: RecentProject[]; repo: string | null; activeRow: number; showActive: boolean; onHover: (i: number) => void; onRun: (i: number) => void }) {
  if (recent === null) return <ProjectRowSkeletons />;
  return (
    <List variant="plain">
      {repo && (
        <ProjectRow
          icon={<ListIcon icon={LogoGithub} tone={showActive && activeRow === 0 ? 'accent' : 'neutral'} />}
          name={`Import ${repo}`}
          path="Clone from GitHub into your projects folder"
          detail="Clone from GitHub into your projects folder"
          hint="Enter"
          onMouseEnter={() => onHover(0)}
          onClick={() => onRun(0)}
        />
      )}
      {matches.map((p, i) => {
        const index = repo ? i + 1 : i;
        return (
          <ProjectRow
            key={p.root}
            icon={<ProjectMark src={p.icon} name={p.name} />}
            name={p.name}
            detail={timeAgo(p.openedAt)}
            path={p.root}
            onMouseEnter={() => onHover(index)}
            onClick={() => onRun(index)}
          />
        );
      })}
    </List>
  );
}

export function RecentPanel({ recent }: { recent: RecentProject[] | null }) {
  return recent && recent.length === 0 ? (
    <Empty className="px-2 py-6">
      <EmptyTitle>No projects yet</EmptyTitle>
      <EmptyDescription>Projects you open or create will show up here.</EmptyDescription>
    </Empty>
  ) : (
    <RecentList recent={recent} matches={recent ?? []} repo={null} activeRow={0} showActive={false} onHover={() => {}} onRun={(i) => recent?.[i] && void openRecent(recent[i].root)} />
  );
}

export function RecentChatsPanel({ chats, onPick }: { chats: HomeChat[]; onPick: (chat: HomeChat) => void }) {
  if (!chats.length)
    return (
      <Empty className="px-2 py-6">
        <EmptyTitle>No chats yet</EmptyTitle>
        <EmptyDescription>Describe a project in the box and it will show up here.</EmptyDescription>
      </Empty>
    );
  return (
    <List variant="plain">
      {chats.map((chat) => (
        <ListItem
          key={chat.id}
          leading={<ListIcon icon={Chat} />}
          title={chat.text}
          description={timeAgo(chat.at)}
          onClick={() => onPick(chat)}
          chevron={false}
        />
      ))}
    </List>
  );
}

export type NewView = 'start' | 'templates' | 'github' | 'open';

const MORE_WAYS: { id: Exclude<NewView, 'start'>; label: string; icon: LimeIcon }[] = [
  { id: 'templates', label: 'Use a template', icon: Template },
  { id: 'github', label: 'Import from GitHub', icon: LogoGithub },
  { id: 'open', label: 'Open folder or file', icon: FolderOpen },
];

/** "New project": the quick start, with the other ways to begin one step further in. */
export function NewProjectFlow({
  view,
  onView,
  repoDraft,
  location,
  busy,
  templates,
  onSetup,
}: {
  view: NewView;
  onView: (view: NewView) => void;
  repoDraft: string;
  location: string;
  busy: boolean;
  templates: TemplateMeta[];
  onSetup: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [view]);

  if (view === 'start')
    return (
      <div ref={ref} className="flex flex-col gap-3">
        <NewProjectPanel location={location} busy={busy} onSetup={onSetup} />
        <Separator />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-fg">Other ways to start</h2>
          <List variant="plain">
            {MORE_WAYS.map(({ id, label, icon }) => (
              <ListItem key={id} leading={<ListIcon icon={icon} />} title={label} onClick={() => onView(id)} chevron />
            ))}
          </List>
        </div>
      </div>
    );
  const title = MORE_WAYS.find((w) => w.id === view)!.label;
  return (
    <div ref={ref} className="flex flex-col gap-2">
      <Button variant="ghost" className="w-full justify-start" icon={<Icon icon={ArrowLeft} size={16} />} onClick={() => onView('start')}>
        {title}
      </Button>
      {view === 'templates' ? <TemplatesPanel templates={templates} location={location} busy={busy} /> : view === 'github' ? <GithubPanel key={repoDraft} initial={repoDraft} location={location} busy={busy} /> : <OpenPanel />}
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
          icon={<ListIcon icon={LogoGithub} tone={isActive ? 'accent' : 'neutral'} />}
          name={`Import ${repo}`}
          path="Clone from GitHub into your projects folder"
          detail="Clone from GitHub into your projects folder"
          hint="Enter"
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
      render: (isActive, hover) => (
        <ProjectRow
          icon={<ProjectMark src={p.icon} name={p.name} />}
          name={p.name}
          detail={`Project · ${timeAgo(p.openedAt)}`}
          path={p.root}
          onMouseEnter={hover}
          onClick={() => void openRecent(p.root)}
        />
      ),
    });
  for (const c of matchedChats)
    rows.push({
      key: c.id,
      kind: 'chat',
      run: () => onChat(c),
      render: (isActive, hover) => (
        <ProjectRow
          icon={<ListIcon icon={Chat} tone={isActive ? 'accent' : 'neutral'} />}
          name={c.text}
          detail={`Chat · ${timeAgo(c.at)}`}
          path={c.text}
          onMouseEnter={hover}
          onClick={() => onChat(c)}
        />
      ),
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
    <div className="flex flex-col gap-3">
      <Field name="search">
        <FieldLabel className="sr-only">Search projects and chats</FieldLabel>
        <div className="flex items-center gap-2">
          <Icon icon={Search} size={16} className="shrink-0 text-fg-3" />
          <Input
            data-autofocus
            aria-label="Search projects and chats"
            placeholder="Search projects and chats"
            className="min-w-0 flex-1"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
        </div>
        <FieldDescription>Projects, chats, or a GitHub owner/repo.</FieldDescription>
      </Field>
      {recent !== null && rows.length === 0 ? (
        <Empty className="px-2 py-6">
          <EmptyTitle>{q ? 'No results' : 'Nothing here yet'}</EmptyTitle>
          <EmptyDescription>{q ? `Nothing matches “${query.trim()}”.` : 'Projects and chats you start will show up here.'}</EmptyDescription>
        </Empty>
      ) : recent === null ? (
        <ProjectRowSkeletons />
      ) : (
        <List variant="plain" onClickCapture={onDone}>
          {rows.map((row, i) => (
            <Fragment key={row.key}>{row.render(!!q && i === activeRow, () => q && setActive(i))}</Fragment>
          ))}
        </List>
      )}
    </div>
  );
}
