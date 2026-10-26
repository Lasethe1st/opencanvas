import { FolderOpen, History, LucideProvider, MessageCircle, Plus } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { LayoutAlignLeftIcon } from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecentProject } from '../../shared/types';
import { api } from '../lib/api';
import { sendToAi } from '../lib/ai';
import { addHomeChat, loadHomeChats, type HomeChat as HomeChatRecord } from '../lib/home-chats';
import { setState, useStore } from '../lib/store';
import { ProjectSetup } from './ProjectSetup';
import { AllProjectsList } from './home/AllProjectsPage';
import { HomeAiHint, HomeChat } from './home/HomeChat';
import { HomeComposerExtras } from './home/HomeComposerExtras';
import { NewProjectFlow, RecentChatsPanel, SearchPanel, type NewView } from './home/HomePanels';
import { HomePrompt } from './home/HomePrompt';
import { HomeRightPanel } from './home/HomeRightPanel';
import { HomeSidebar, type SidebarItem } from './home/HomeSidebar';
import { HomeStatusPills } from './home/HomeStatusPills';
import { SearchOverlay } from './home/SearchOverlay';
import { VoiceOrbSession } from './home/VoiceOrbSession';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type PanelId = 'new' | 'chats' | 'projects';

function greeting(): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}. What are we building?`;
}

const focusPrompt = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-home-prompt]')?.focus());

function briefFromChat(items: { kind: string; text?: string }[]): string {
  const users = items.filter((i): i is { kind: 'user'; text: string } => i.kind === 'user' && typeof i.text === 'string');
  return users[0]?.text ?? users[users.length - 1]?.text ?? '';
}

export function Onboarding() {
  const busy = useStore((s) => s.busy);
  const aiChat = useStore((s) => s.aiChat);
  const aiTurnId = useStore((s) => s.aiTurnId);
  const aiReady = useStore((s) => !!s.aiStatus?.ready);
  const dockDraft = useStore((s) => s.dockDraft);
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [location, setLocation] = useState('');
  const [chats, setChats] = useState<HomeChatRecord[]>(loadHomeChats);
  const [rightPanel, setRightPanel] = useState<PanelId | null>(null);
  const [newView, setNewView] = useState<NewView>('start');
  const [repoDraft, setRepoDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [setup, setSetup] = useState(false);
  /** Where "Back" from the setup page returns to: the home prompt, or the New project panel. */
  const [setupFrom, setSetupFrom] = useState<'prompt' | 'panel'>('panel');
  const [setupBrief, setSetupBrief] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const [navOpen, setNavOpen] = useState(() => {
    try {
      return localStorage.getItem('oc-home-nav-open') === '1';
    } catch {
      return false;
    }
  });

  const setNav = useCallback((open: boolean) => {
    setNavOpen(open);
    try {
      localStorage.setItem('oc-home-nav-open', open ? '1' : '0');
    } catch {
      /* storage blocked */
    }
    // The control that had focus is about to disappear — hand focus to its counterpart.
    setTimeout(() => document.querySelector<HTMLElement>(open ? '[data-home-nav-close]' : '[data-home-nav-open]')?.focus(), 220);
  }, []);

  const chatActive = aiChat.length > 0 || !!aiTurnId || voiceMode;

  const openPanel = useCallback((id: PanelId) => {
    setSetup(false);
    if (id === 'new') setNewView('start');
    setRightPanel((cur) => (cur === id ? null : id));
  }, []);

  const closePanel = useCallback(() => {
    setSetup(false);
    setRightPanel(null);
  }, []);

  const openAiSetup = useCallback((from: 'prompt' | 'panel', brief = '') => {
    setSetupBrief(brief);
    setSetupFrom(from);
    setSetup(true);
    setRightPanel('new');
  }, []);

  const startVoice = useCallback(() => {
    if (busy || !!aiTurnId) return;
    setVoiceMode(true);
  }, [busy, aiTurnId]);

  const endVoice = useCallback(() => {
    setVoiceMode(false);
    focusPrompt();
  }, []);
  const canContinue = aiChat.some((i) => i.kind === 'user') && !aiTurnId;

  useEffect(() => {
    void api.recentProjects().then(setRecent);
    void api.defaultLocation().then(setLocation);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && !!e.target.closest('input, textarea');
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === 'Escape' && rightPanel && !document.querySelector('.dialog-backdrop, .settings-page, [data-home-search]')) {
        e.preventDefault();
        closePanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rightPanel, closePanel]);

  const pickChat = useCallback((chat: HomeChatRecord) => {
    setState({ dockDraft: chat.text });
    setSetup(false);
    setRightPanel(null);
    focusPrompt();
  }, []);

  const sendHome = useCallback(async () => {
    const text = dockDraft.trim();
    if (!text || !aiReady) return;
    const first = aiChat.length === 0;
    const ok = await sendToAi(text);
    if (ok && first) setChats((current) => addHomeChat(current, text));
    if (ok) focusPrompt();
  }, [dockDraft, aiReady, aiChat.length]);

  // Keep the composer ready for the next turn — chat should feel continuous, not transactional.
  useEffect(() => {
    if (!aiTurnId && chatActive) focusPrompt();
  }, [aiTurnId, chatActive]);

  const continueToSetup = useCallback(() => {
    openAiSetup('prompt', briefFromChat(aiChat) || dockDraft.trim());
  }, [aiChat, dockDraft, openAiSetup]);

  const items: SidebarItem[] = useMemo(
    () => [
      {
        id: 'chat',
        label: 'New chat',
        icon: MessageCircle,
        onSelect: () => {
          setSetup(false);
          setRightPanel(null);
          setState({ dockDraft: '', aiChat: [], aiTurnId: null });
          void api.ai.reset();
          focusPrompt();
        },
      },
      {
        id: 'new',
        label: 'New project',
        icon: Plus,
        onSelect: () => openPanel('new'),
      },
      {
        id: 'chats',
        label: 'Recent chats',
        icon: History,
        onSelect: () => openPanel('chats'),
      },
      {
        id: 'projects',
        label: 'All projects',
        icon: FolderOpen,
        onSelect: () => openPanel('projects'),
      },
    ],
    [openPanel],
  );

  const panelTitle = setup && rightPanel === 'new' ? 'Get help from AI' : rightPanel === 'new' ? 'New project' : rightPanel === 'chats' ? 'Recent chats' : rightPanel === 'projects' ? 'All projects' : '';

  const panelBody =
    rightPanel === 'new' && setup ? (
      <ProjectSetup
        panel
        location={location}
        initialRequest={setupBrief}
        onBack={() => {
          setSetup(false);
          if (setupFrom === 'prompt') setRightPanel(null);
          else setRightPanel('new');
        }}
      />
    ) : rightPanel === 'new' ? (
      <NewProjectFlow
        view={newView}
        onView={setNewView}
        repoDraft={repoDraft}
        location={location}
        busy={busy}
        onSetup={() => openAiSetup('panel')}
      />
    ) : rightPanel === 'chats' ? (
      <RecentChatsPanel chats={chats} onPick={pickChat} />
    ) : rightPanel === 'projects' ? (
      <AllProjectsList recent={recent} />
    ) : null;

  return (
    <LucideProvider strokeWidth={1.5} absoluteStrokeWidth>
      <TooltipProvider>
        <div data-tw="" className="flex h-full bg-[var(--home-bg)] text-foreground">
          <HomeSidebar label="Home" items={items} active={rightPanel} busy={busy} open={navOpen} onClose={() => setNav(false)} onSearch={() => setSearchOpen(true)} />
          <div className="relative m-2 min-w-0 flex-1 overflow-hidden rounded-[10px] border border-foreground/[0.08] bg-[var(--home-card)] motion-safe:transition-[margin] motion-safe:duration-200">
          {!navOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" data-home-nav-open="" className="absolute start-3 top-3 z-20 size-9 rounded-[8px] px-2.5 py-0 text-muted-foreground hover:text-foreground [&_svg]:size-[18px]" aria-label="Open navigation" aria-expanded={false} onClick={() => setNav(true)}>
                  <HugeiconsIcon icon={LayoutAlignLeftIcon} strokeWidth={2} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side={document.dir === 'rtl' ? 'left' : 'right'}>Open navigation</TooltipContent>
            </Tooltip>
          )}
          <main
            className={
              chatActive
                ? 'relative flex h-full min-w-0 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                : 'flex h-full min-w-0 flex-col items-center justify-center overflow-y-auto px-8 py-16'
            }
          >
            {chatActive ? (
              <>
                <div className="mx-auto w-full max-w-[680px] flex-1 px-8 pt-6">
                  <HomeChat />
                </div>
                <div className="sticky bottom-0 z-10 shrink-0 bg-gradient-to-t from-background from-[40%] via-background/60 via-[55%] to-transparent to-75% px-8 pb-6 pt-8">
                  <div className="mx-auto flex w-full max-w-[680px] flex-col gap-2">
                    {!voiceMode && (
                      <div className="flex items-center justify-between gap-3 px-1">
                        <HomeStatusPills
                          className="min-w-0 px-0"
                          recentProjectName={recent?.[0]?.name ?? null}
                          onOpenProjects={() => {
                            setRightPanel('projects');
                          }}
                        />
                        {(canContinue || (aiChat.some((i) => i.kind === 'user') && !aiReady)) && (
                          <div className="flex shrink-0 items-center gap-2">
                            <HomeAiHint />
                            <Button type="button" size="sm" variant={canContinue ? 'default' : 'secondary'} className="h-auto rounded-[var(--pill)] px-2.5 py-2 text-[13px] font-normal" onClick={continueToSetup}>
                              Continue to project
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    {voiceMode ? (
                      <VoiceOrbSession onClose={endVoice} />
                    ) : (
                      <>
                        <HomePrompt
                          value={dockDraft}
                          onChange={(value) => setState({ dockDraft: value })}
                          onSubmit={() => void sendHome()}
                          onVoice={startVoice}
                          disabled={busy || !aiReady}
                          sending={!!aiTurnId}
                        />
                        <HomeComposerExtras />
                        {!(canContinue || (aiChat.some((i) => i.kind === 'user') && !aiReady)) && (
                          <div className="px-1">
                            <HomeAiHint />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex w-full max-w-[680px] flex-col items-center">
                <h1 className="mb-6 font-geist text-balance text-center text-[32px] font-medium leading-[1.1] tracking-[-0.02em]">{greeting()}</h1>
                <div className="flex w-full flex-col items-center gap-3">
                  <HomePrompt
                    value={dockDraft}
                    onChange={(value) => setState({ dockDraft: value })}
                    onSubmit={() => void sendHome()}
                    onVoice={startVoice}
                    disabled={busy || !aiReady}
                    sending={!!aiTurnId}
                  />
                  <HomeComposerExtras />
                  <HomeAiHint className="text-center" />
                  {dockDraft.trim() && !aiReady && (
                    <Button type="button" variant="secondary" className="rounded-[var(--pill)] text-[13px] font-normal" onClick={continueToSetup}>
                      Continue to project
                    </Button>
                  )}
                </div>
              </div>
            )}
          </main>
          </div>
          <HomeRightPanel
            open={!!rightPanel}
            title={panelTitle}
            contentKey={rightPanel === 'new' && setup ? 'setup' : rightPanel ?? 'closed'}
            flush={rightPanel === 'new' && setup}
          >
            {panelBody}
          </HomeRightPanel>
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
                setRightPanel('new');
              }}
            />
          </SearchOverlay>
        )}
      </TooltipProvider>
    </LucideProvider>
  );
}
