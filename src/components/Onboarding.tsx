import { History, Inbox, LucideProvider, MessageCircle, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecentProject, TemplateMeta } from '../../shared/types';
import { api } from '../lib/api';
import { addHomeChat, loadHomeChats, type HomeChat } from '../lib/home-chats';
import { useStore } from '../lib/store';
import { ProjectSetup } from './ProjectSetup';
import { NewProjectFlow, RecentChatsPanel, RecentPanel, SearchPanel, type NewView } from './home/HomePanels';
import { HomePrompt } from './home/HomePrompt';
import { HomeSidebar, type SidebarItem } from './home/HomeSidebar';
import { SearchOverlay } from './home/SearchOverlay';
import { TooltipProvider } from '@/components/ui/tooltip';

type PanelId = 'new' | 'chats' | 'projects';

function greeting(): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}. What are we building?`;
}

const focusPrompt = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-home-prompt]')?.focus());

export function Onboarding() {
  const busy = useStore((s) => s.busy);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [location, setLocation] = useState('');
  const [chats, setChats] = useState<HomeChat[]>(loadHomeChats);
  const [active, setActive] = useState<PanelId | null>(null);
  const [newView, setNewView] = useState<NewView>('start');
  const [repoDraft, setRepoDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
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
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onActiveChange = useCallback((id: string | null) => {
    if (id === 'new') setNewView('start');
    setActive(id as PanelId | null);
  }, []);

  const pickChat = useCallback((chat: HomeChat) => {
    setPrompt(chat.text);
    setActive(null);
    focusPrompt();
  }, []);

  const items: SidebarItem[] = useMemo(
    () => [
      {
        id: 'chat',
        label: 'New chat',
        icon: MessageCircle,
        onSelect: () => {
          setActive(null);
          setPrompt('');
          focusPrompt();
        },
      },
      {
        id: 'new',
        label: 'New project',
        icon: Plus,
        content: (
          <NewProjectFlow
            view={newView}
            onView={setNewView}
            repoDraft={repoDraft}
            location={location}
            busy={busy}
            templates={templates}
            onSetup={() => {
              setSetupFrom('panel');
              setSetup(true);
            }}
          />
        ),
      },
      { id: 'chats', label: 'Recent chats', icon: History, content: <RecentChatsPanel chats={chats} onPick={pickChat} /> },
      { id: 'projects', label: 'All projects', icon: Inbox, content: <RecentPanel recent={recent} /> },
    ],
    [newView, repoDraft, location, busy, templates, chats, recent, pickChat],
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
        <div data-tw="" className="flex h-full bg-background text-foreground">
          <HomeSidebar label="Home" items={items} active={active} onActiveChange={onActiveChange} busy={busy} onSearch={() => setSearchOpen(true)} />
          <main className="flex min-w-0 flex-1 flex-col items-center overflow-y-auto px-8 pb-16 pt-[24vh]">
            <div className="flex w-full max-w-[680px] flex-col items-center gap-8">
              <h1 className="font-geist text-balance text-center text-2xl font-medium leading-[1.1] tracking-[-0.02em]">{greeting()}</h1>
              <HomePrompt
                value={prompt}
                onChange={setPrompt}
                onSubmit={() => {
                  setChats((current) => addHomeChat(current, prompt));
                  setSetupFrom('prompt');
                  setSetup(true);
                }}
                disabled={busy}
              />
            </div>
          </main>
        </div>
        {searchOpen && (
          <SearchOverlay onClose={() => setSearchOpen(false)}>
            <SearchPanel
              recent={recent}
              chats={chats}
              onDone={() => setSearchOpen(false)}
              onChat={pickChat}
              onGithub={(repo) => {
                setRepoDraft(repo);
                setNewView('github');
                setActive('new');
              }}
            />
          </SearchOverlay>
        )}
      </TooltipProvider>
    </LucideProvider>
  );
}
