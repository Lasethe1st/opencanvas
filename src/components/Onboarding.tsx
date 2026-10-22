import { FolderOpen, History, LucideProvider, MessageCircle, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecentProject, TemplateMeta } from '../../shared/types';
import { api } from '../lib/api';
import { sendToAi } from '../lib/ai';
import { addHomeChat, loadHomeChats, type HomeChat as HomeChatRecord } from '../lib/home-chats';
import { setState, useStore } from '../lib/store';
import { ProjectSetup } from './ProjectSetup';
import { HomeAiHint, HomeChat } from './home/HomeChat';
import { HomeComposerExtras } from './home/HomeComposerExtras';
import { NewProjectFlow, RecentChatsPanel, RecentPanel, SearchPanel, type NewView } from './home/HomePanels';
import { HomePrompt } from './home/HomePrompt';
import { HomeSidebar, type SidebarItem } from './home/HomeSidebar';
import { HomeStatusPills } from './home/HomeStatusPills';
import { SearchOverlay } from './home/SearchOverlay';
import { VoiceOrbSession } from './home/VoiceOrbSession';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';

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
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [location, setLocation] = useState('');
  const [chats, setChats] = useState<HomeChatRecord[]>(loadHomeChats);
  const [active, setActive] = useState<PanelId | null>(null);
  const [newView, setNewView] = useState<NewView>('start');
  const [repoDraft, setRepoDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [setup, setSetup] = useState(false);
  /** Where "Back" from the setup page returns to: the home prompt, or the New project panel. */
  const [setupFrom, setSetupFrom] = useState<'prompt' | 'panel'>('panel');
  const [setupBrief, setSetupBrief] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);

  const chatActive = aiChat.length > 0 || !!aiTurnId || voiceMode;

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

  const pickChat = useCallback((chat: HomeChatRecord) => {
    setState({ dockDraft: chat.text });
    setActive(null);
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
    setSetupBrief(briefFromChat(aiChat) || dockDraft.trim());
    setSetupFrom('prompt');
    setSetup(true);
  }, [aiChat, dockDraft]);

  const items: SidebarItem[] = useMemo(
    () => [
      {
        id: 'chat',
        label: 'New chat',
        icon: MessageCircle,
        onSelect: () => {
          setActive(null);
          setState({ dockDraft: '', aiChat: [], aiTurnId: null });
          void api.ai.reset();
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
              setSetupBrief('');
              setSetupFrom('panel');
              setSetup(true);
            }}
          />
        ),
      },
      { id: 'chats', label: 'Recent chats', icon: History, content: <RecentChatsPanel chats={chats} onPick={pickChat} /> },
      { id: 'projects', label: 'All projects', icon: FolderOpen, content: <RecentPanel recent={recent} /> },
    ],
    [newView, repoDraft, location, busy, templates, chats, recent, pickChat],
  );

  if (setup)
    return (
      <ProjectSetup
        location={location}
        initialRequest={setupBrief}
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
          <main
            className={
              chatActive
                ? 'relative flex min-w-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                : 'flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-16'
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
                            setActive('projects');
                          }}
                        />
                        {(canContinue || (aiChat.some((i) => i.kind === 'user') && !aiReady)) && (
                          <div className="flex shrink-0 items-center gap-2">
                            <HomeAiHint />
                            <Button type="button" size="sm" variant={canContinue ? 'default' : 'secondary'} className="h-auto rounded-[var(--pill)] px-2.5 py-2" onClick={continueToSetup}>
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
                    <Button type="button" variant="secondary" className="rounded-[var(--pill)]" onClick={continueToSetup}>
                      Continue to project
                    </Button>
                  )}
                </div>
              </div>
            )}
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
