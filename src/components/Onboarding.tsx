import { FolderOpen, History, LayoutTemplate, LucideProvider, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecentProject, TemplateMeta } from '../../shared/types';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { ProjectSetup } from './ProjectSetup';
import { GithubMark } from '../ui/StartScreen.jsx';
import { GithubPanel, NewProjectPanel, OpenPanel, RecentPanel, SearchPanel, TemplatesPanel } from './home/HomePanels';
import { HomePrompt } from './home/HomePrompt';
import { ThemeMenu } from './home/ThemeMenu';
import { MorphPill, type MorphPillItem } from '@/components/ui/morph-pill';
import { TooltipProvider } from '@/components/ui/tooltip';

type PanelId = 'new' | 'github' | 'templates' | 'open' | 'recent' | 'search';

function greeting(): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}. What are we building?`;
}

const GithubIcon = ({ className }: { className?: string }) => (
  <span className={className} aria-hidden>
    <GithubMark size={20} />
  </span>
);

export function Onboarding() {
  const busy = useStore((s) => s.busy);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [location, setLocation] = useState('');
  const [active, setActive] = useState<PanelId | null>(null);
  const [repoDraft, setRepoDraft] = useState('');
  const [prompt, setPrompt] = useState('');
  const [setup, setSetup] = useState(false);
  /** Where "Back" from the setup page returns to: the home prompt, or the New project panel. */
  const [setupFrom, setSetupFrom] = useState<'prompt' | 'panel'>('panel');

  useEffect(() => {
    void api.templates().then(setTemplates);
    void api.recentProjects().then(setRecent);
    void api.defaultLocation().then(setLocation);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && !!e.target.closest('input, textarea');
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setActive('search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onActiveChange = useCallback((id: string | null) => setActive(id as PanelId | null), []);

  const items: MorphPillItem[] = useMemo(
    () => [
      {
        id: 'new',
        label: 'Start new project',
        icon: Plus,
        content: (
          <NewProjectPanel
            location={location}
            busy={busy}
            onSetup={() => {
              setSetupFrom('panel');
              setSetup(true);
            }}
          />
        ),
      },
      { id: 'github', label: 'Import from GitHub', icon: GithubIcon, content: <GithubPanel key={repoDraft} initial={repoDraft} location={location} busy={busy} /> },
      { id: 'templates', label: 'Use a template', icon: LayoutTemplate, content: <TemplatesPanel templates={templates} location={location} busy={busy} /> },
      { id: 'open', label: 'Open folder or file', icon: FolderOpen, content: <OpenPanel /> },
      { id: 'recent', label: 'Recent files', icon: History, dividerBefore: true, content: <RecentPanel recent={recent} /> },
      {
        id: 'search',
        label: 'Search',
        icon: Search,
        content: (
          <SearchPanel
            recent={recent}
            onGithub={(repo) => {
              setRepoDraft(repo);
              setActive('github');
            }}
          />
        ),
      },
    ],
    [location, busy, templates, recent, repoDraft],
  );

  if (setup)
    return (
      <ProjectSetup
        location={location}
        initialRequest={prompt}
        onBack={() => {
          setSetup(false);
          if (setupFrom === 'prompt') setActive(null);
        }}
      />
    );

  return (
    <LucideProvider strokeWidth={1.5} absoluteStrokeWidth>
      <TooltipProvider>
        <div data-tw="" className="relative flex h-full bg-background text-foreground">
          <MorphPill label="Home" items={items} active={active} onActiveChange={onActiveChange} busy={busy} expandedWidth={372} footer={<ThemeMenu />} className="absolute start-4 top-4 z-10" />
          <main className="flex min-w-0 flex-1 flex-col items-center overflow-y-auto px-[84px] pb-16 pt-[24vh]">
            <div className="flex w-full max-w-[680px] flex-col items-center gap-8">
              <h1 className="text-balance text-center text-4xl font-semibold leading-[1.1] tracking-[-0.02em]">{greeting()}</h1>
              <HomePrompt
                value={prompt}
                onChange={setPrompt}
                onSubmit={() => {
                  setSetupFrom('prompt');
                  setSetup(true);
                }}
                disabled={busy}
              />
            </div>
          </main>
        </div>
      </TooltipProvider>
    </LucideProvider>
  );
}
