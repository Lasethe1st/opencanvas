import { ArrowLeft, ArrowRight, ArrowsOut, FolderOpen, Layout, Sparkle } from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { defaultDirection } from '../../../shared/project-config';
import type { TemplateId, TemplateMeta } from '../../../shared/types';
import { createProject, importFromGithub, importZip, openFileFromDisk, openProjectDialog } from '../../lib/actions';
import { sendToAi } from '../../lib/ai';
import { api } from '../../lib/api';
import { copyAgentPrompt } from '../../lib/prompt';
import { setState, useStore } from '../../lib/store';
import { GithubMark } from '../../ui/StartScreen.jsx';
import { DirectionEditor, uploadPaths, type DirectionDraft } from '../direction/DirectionEditor';
import { HomeDialog } from './HomeDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type StartPath = 'ai' | 'template' | 'github' | 'open';
type StepId = 'start' | 'name' | 'brief' | 'direction' | 'template' | 'repo' | 'open' | 'review';

const FIRST_REQUEST = 'Build the first version of the home page, following the design direction.';

const STEPS: Record<StartPath, StepId[]> = {
  ai: ['start', 'name', 'brief', 'direction', 'review'],
  template: ['start', 'template', 'name', 'review'],
  github: ['start', 'repo'],
  open: ['start', 'open'],
};

const TITLES: Record<StepId, string> = {
  start: 'How do you want to start?',
  name: 'What should it be called?',
  brief: 'What are you making?',
  direction: 'Visual direction',
  template: 'Pick a starting point',
  repo: 'Which repository?',
  open: 'Open something you already have',
  review: 'Ready to create',
};

const PATHS: { id: StartPath; label: string; hint: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'ai', label: 'Describe it to AI', hint: 'Set a direction, then hand the brief to your agent.', icon: Sparkle },
  { id: 'template', label: 'Use a template', hint: 'Ready-made pages in regular React code you own.', icon: Layout },
  { id: 'github', label: 'Import from GitHub', hint: 'Clone a React project and open it.', icon: ({ className }) => <span className={className}><GithubMark size={16} /></span> },
  { id: 'open', label: 'Open a folder or file', hint: 'Continue with a project on this computer.', icon: FolderOpen },
];

function Question({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 motion-safe:animate-[fade-in_0.18s_ease-out]">
      {(title || hint) && (
        <div>
          {title ? <h3 className="m-0 text-lg font-medium leading-tight tracking-[-0.01em]">{title}</h3> : null}
          {hint && <p className={cn('m-0 text-xs text-muted-foreground', title && 'mt-1')}>{hint}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * "New project" as a form: one question at a time, with Back and Next. Answers are kept while moving
 * between steps and while minimized (the dialog stays mounted; only the chip shows).
 */
export function NewProjectDialog({
  location,
  minimized,
  chipHost,
  initialPath = null,
  initialBrief = '',
  initialRepo = '',
  onClose,
  onMinimize,
  onRestore,
}: {
  location: string;
  minimized: boolean;
  /** Where the minimized chip is pinned. */
  chipHost: HTMLElement | null;
  initialPath?: StartPath | null;
  initialBrief?: string;
  initialRepo?: string;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
}) {
  const busy = useStore((s) => s.busy);
  const aiReady = useStore((s) => !!s.aiStatus?.ready);
  const [path, setPath] = useState<StartPath | null>(initialPath);
  const [index, setIndex] = useState(initialPath ? 1 : 0);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState(initialBrief);
  const [repo, setRepo] = useState(initialRepo);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [template, setTemplate] = useState<TemplateId>('landing');
  const [draft, setDraft] = useState<DirectionDraft>({ direction: defaultDirection(), pending: {} });

  useEffect(() => {
    void api.templates().then((all) => setTemplates(all.filter((t) => t.id !== 'blank')));
  }, []);

  const steps = path ? STEPS[path] : (['start'] as StepId[]);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1 && step !== 'start';
  const templateMeta = templates.find((t) => t.id === template);

  const choose = (id: StartPath) => {
    setPath(id);
    setIndex(1);
  };

  const canNext = step === 'repo' ? !!repo.trim() : true;

  const submit = async () => {
    if (busy) return;
    if (path === 'github') {
      if (repo.trim()) await importFromGithub(repo.trim());
      return;
    }
    if (path === 'template') {
      await createProject(template, name.trim() || (templateMeta?.name ?? 'My site'));
      return;
    }
    if (path === 'ai') {
      const ok = await createProject('blank', name.trim() || 'Untitled project', { direction: draft.direction, uploads: uploadPaths(draft.pending) });
      if (!ok) return;
      if (aiReady) {
        setState({ dockMode: 'input' });
        if (await sendToAi(brief.trim() || FIRST_REQUEST)) return;
      }
      setState({ dockDraft: brief, dockMode: 'input' });
      if (!aiReady) await copyAgentPrompt(brief);
    }
  };

  const next = () => {
    if (!canNext || busy) return;
    if (last) void submit();
    else setIndex((i) => i + 1);
  };

  const finalLabel = busy
    ? 'Working…'
    : path === 'github'
      ? 'Import repository'
      : path === 'ai'
        ? aiReady
          ? 'Generate with AI'
          : 'Create project'
        : 'Create project';

  const summary = useMemo(() => {
    const rows: [string, string][] = [];
    if (path === 'template') rows.push(['Template', templateMeta?.name ?? template]);
    rows.push(['Name', name.trim() || (path === 'template' ? (templateMeta?.name ?? 'My site') : 'Untitled project')]);
    if (path === 'ai') rows.push(['Brief', brief.trim() || 'First version of the home page']);
    if (location) rows.push(['Saved to', location]);
    return rows;
  }, [path, template, templateMeta, name, brief, location]);

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      next();
    }
  };

  const chip =
    minimized && chipHost
      ? createPortal(
          <Button
            data-tw=""
            variant="ghost"
            className="h-9 shrink-0 gap-2 rounded-[var(--pill)] bg-muted px-3.5 text-xs motion-safe:animate-[home-dialog-in_0.18s_cubic-bezier(0.2,0,0,1)] text-foreground hover:bg-secondary [&_svg]:size-3.5"
            onClick={onRestore}
            aria-label={`Resume new project, ${TITLES[step]}`}
          >
            <ArrowsOut />
            <span>New project</span>
            <span className="text-muted-foreground">
              {step === 'start' ? 'Start' : `Step ${index + 1} of ${steps.length}`}
            </span>
          </Button>,
          chipHost,
        )
      : null;

  return (
    <>
      {chip}
      {!minimized && (
        <HomeDialog
          title="New project"
          progress={step === 'start' ? undefined : { value: index + 1, max: steps.length }}
          onClose={onClose}
          onMinimize={onMinimize}
          minimizeTarget={() => {
            const r = chipHost?.parentElement?.getBoundingClientRect();
            return r ? new DOMRect(r.right + 8, r.top, 150, r.height) : null;
          }}
          wide={step === 'direction'}
          footer={
            step === 'start' || step === 'open' ? (
              step === 'open' ? (
                <Button variant="ghost" className="gap-1.5 rounded-[var(--pill)]" onClick={() => setIndex(0)}>
                  <ArrowLeft /> Back
                </Button>
              ) : null
            ) : (
              <>
                <Button variant="ghost" className="gap-1.5 rounded-[var(--pill)]" disabled={busy} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                  <ArrowLeft /> Back
                </Button>
                <div className="ms-auto flex items-center gap-2">
                  {step === 'direction' && (
                    <Button variant="ghost" className="rounded-[var(--pill)]" disabled={busy} onClick={next}>
                      Skip
                    </Button>
                  )}
                  <Button className="rounded-[var(--pill)]" disabled={!canNext || busy} onClick={next}>
                    {last ? finalLabel : 'Next'}
                    {!last && <ArrowRight />}
                  </Button>
                </div>
              </>
            )
          }
        >
          <div onKeyDown={onEnter}>
            {step === 'start' && (
              <Question>
                <div role="radiogroup" aria-label={TITLES.start} className="flex flex-col gap-1.5">
                  {PATHS.map(({ id, label, hint, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={path === id}
                      data-autofocus={id === (path ?? 'ai') ? '' : undefined}
                      onClick={() => choose(id)}
                      className={cn(
                        'flex items-center gap-3 rounded-[12px] border-0 p-3 text-start transition-colors duration-150 hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                        path === id ? 'bg-accent' : 'bg-muted/50',
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground [&_svg]:size-4" />
                      <span className="grid gap-0.5">
                        <strong className="text-sm font-medium">{label}</strong>
                        <span className="text-xs text-muted-foreground">{hint}</span>
                      </span>
                      <ArrowRight className="ms-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  ))}
                </div>
              </Question>
            )}
            {step === 'name' && (
              <Question title={TITLES.name} hint="Optional. You can rename it later.">
                <Input data-autofocus aria-label="Project name" placeholder={path === 'template' ? (templateMeta?.name ?? 'My site') : 'Untitled project'} value={name} onChange={(e) => setName(e.target.value)} />
              </Question>
            )}
            {step === 'brief' && (
              <Question title={TITLES.brief} hint="A sentence or two is enough, for example “A landing page for a coffee roaster with a shop and a story section.”">
                <Textarea data-autofocus aria-label="What are you making?" rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} />
              </Question>
            )}
            {step === 'direction' && (
              <Question title={TITLES.direction} hint="Optional. Saved with the project and shared with your AI agent. You can change it later.">
                <DirectionEditor draft={draft} onChange={setDraft} />
              </Question>
            )}
            {step === 'template' && (
              <Question title={TITLES.template} hint="It's regular React code you own.">
                <div role="radiogroup" aria-label="Template" className="flex flex-col gap-1.5">
                  {templates.map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={template === t.id}
                      data-autofocus={template === t.id || (i === 0 && !templates.some((x) => x.id === template)) ? '' : undefined}
                      onClick={() => setTemplate(t.id)}
                      className={cn('rounded-[12px] border-0 p-3 text-start transition-colors duration-150 hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring', template === t.id ? 'bg-accent' : 'bg-muted/50')}
                    >
                      <strong className="block text-sm font-medium">{t.name}</strong>
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                    </button>
                  ))}
                </div>
              </Question>
            )}
            {step === 'repo' && (
              <Question title={TITLES.repo} hint="Private repositories use your GitHub sign-in.">
                <Input data-autofocus aria-label="Repository" placeholder="owner/repo or github.com URL" value={repo} disabled={busy} onChange={(e) => setRepo(e.target.value)} />
                {location && <p className="m-0 truncate text-xs text-muted-foreground">Cloned into {location}</p>}
              </Question>
            )}
            {step === 'open' && (
              <Question title={TITLES.open}>
                <div className="flex flex-col gap-1.5">
                  <Button variant="outline" className="h-10 justify-start" data-autofocus onClick={() => void openProjectDialog()}>
                    <FolderOpen /> Open folder
                  </Button>
                  <Button variant="outline" className="h-10 justify-start" onClick={() => void openFileFromDisk()}>
                    Open file
                  </Button>
                  <Button variant="outline" className="h-10 justify-start" onClick={() => void importZip()}>
                    Import .zip
                  </Button>
                </div>
              </Question>
            )}
            {step === 'review' && (
              <Question title={TITLES.review} hint={path === 'ai' ? (aiReady ? 'Creates the project, saves your direction, and asks the AI to build a first version.' : 'Creates the project and saves your direction. A prompt is copied so you can paste it into your agent.') : undefined}>
                <dl className="m-0 flex flex-col gap-2 rounded-[12px] bg-muted/50 p-3 text-sm">
                  {summary.map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <dt className="w-20 shrink-0 text-xs text-muted-foreground">{k}</dt>
                      <dd className="m-0 min-w-0 flex-1 break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Question>
            )}
          </div>
        </HomeDialog>
      )}
    </>
  );
}
