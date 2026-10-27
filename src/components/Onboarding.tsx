import { FolderOpen, Library, LucideProvider, MessageCircle } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { LayoutAlignLeftIcon, LayoutAlignRightIcon } from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RecentProject } from '../../shared/types';
import { api } from '../lib/api';
import { sendToAi } from '../lib/ai';
import { openRecent } from '../lib/actions';
import { addHomeChat, loadHomeChats, type HomeChat as HomeChatRecord } from '../lib/home-chats';
import { getState, setState, useStore } from '../lib/store';
import { AllProjectsList, ProjectThumb, timeAgo } from './home/AllProjectsPage';
import { HomeAiHint, HomeChat } from './home/HomeChat';
import { HomeComposerExtras } from './home/HomeComposerExtras';
import { RecentChatsPanel, SearchPanel } from './home/HomePanels';
import { HomeDialog } from './home/HomeDialog';
import { NewProjectDialog, type StartPath } from './home/NewProjectDialog';
import { SourcesPanel, useSources, type Source } from './home/SourcesPanel';
import { HomePrompt, type MentionOption } from './home/HomePrompt';
import { HomeRightPanel } from './home/HomeRightPanel';
import { HomeSidebar, type SidebarItem } from './home/HomeSidebar';
import { HomeStatusPills } from './home/HomeStatusPills';
import { SearchOverlay } from './home/SearchOverlay';
import { VoiceOrbSession } from './home/VoiceOrbSession';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type HomeDialogState = { kind: 'new'; path: StartPath | null; brief: string; repo: string } | { kind: 'projects' } | { kind: 'chats' };

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
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [dialog, setDialog] = useState<HomeDialogState | null>(null);
  const [newMinimized, setNewMinimized] = useState(false);
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const [chipHost, setChipHost] = useState<HTMLDivElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
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
  }, []);

  const chatActive = aiChat.length > 0 || !!aiTurnId || voiceMode;

  const openNew = useCallback((init?: { path?: StartPath; brief?: string; repo?: string }) => {
    setNewMinimized(false);
    setDialog({ kind: 'new', path: init?.path ?? null, brief: init?.brief ?? '', repo: init?.repo ?? '' });
  }, []);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setNewMinimized(false);
  }, []);

  const chatTitle = useMemo(() => {
    const first = aiChat.find((i) => i.kind === 'user');
    return first && first.kind === 'user' && first.text.trim() ? first.text.split('\n\nReferenced:\n')[0].trim().replace(/\s+/g, ' ') : 'New chat';
  }, [aiChat]);

  const chatSources = useSources(aiChat);
  const [mentioned, setMentioned] = useState<Source[]>([]);
  const sources = useMemo(() => {
    const seen = new Set<string>();
    return [...mentioned, ...chatSources].filter((x) => !seen.has(x.id) && !!seen.add(x.id));
  }, [mentioned, chatSources]);

  const mentionOptions: MentionOption[] = useMemo(
    () => [
      ...(recent ?? []).map((p) => ({ id: `project:${p.root}`, label: p.name, detail: p.root, kind: 'project' as const })),
      ...chats.map((c) => ({ id: `chat:${c.id}`, label: c.text.replace(/\s+/g, ' ').slice(0, 28).trim() + (c.text.length > 28 ? '…' : ''), detail: c.text, kind: 'chat' as const })),
      ...chatSources.map((x) => ({ id: x.id, label: x.title, detail: x.detail, kind: x.kind })),
    ],
    [recent, chats, chatSources],
  );
  const onMention = useCallback((o: MentionOption) => {
    if (o.kind === 'project' || o.kind === 'chat') setMentioned((cur) => (cur.some((x) => x.id === o.id) ? cur : [{ id: o.id, kind: o.kind, title: o.label, detail: o.detail }, ...cur]));
  }, []);

  // New sources reveal the panel; closing it by hand sticks until the next new source arrives.
  const seenSources = useRef(0);
  useEffect(() => {
    if (sources.length > seenSources.current) setSourcesOpen(true);
    seenSources.current = sources.length;
  }, [sources.length]);

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
      if (e.key === 'Escape' && sourcesOpen && !dialog && !document.querySelector('.dialog-backdrop, .settings-page, [data-home-search]')) {
        e.preventDefault();
        setSourcesOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sourcesOpen, dialog]);

  const pickChat = useCallback((chat: HomeChatRecord) => {
    setState({ dockDraft: chat.text });
    setDialog(null);
    focusPrompt();
  }, []);

  const sendHome = useCallback(async () => {
    const text = dockDraft.trim();
    if (!text || !aiReady) return;
    const first = aiChat.length === 0;
    const refs = [...mentioned, ...chatSources].filter((x) => text.includes(x.title));
    const full = refs.length ? `${text}\n\nReferenced:\n${refs.map((x) => `- [${x.kind}] ${x.title} (${x.detail.replace(/\s+/g, ' ').slice(0, 500)})`).join('\n')}` : text;
    const ok = await sendToAi(full);
    // sendToAi only clears the draft when it matches what was sent, and `full` adds the references.
    if (ok && getState().dockDraft.trim() === text) setState({ dockDraft: '' });
    if (ok && first) setChats((current) => addHomeChat(current, text));
    if (ok) focusPrompt();
  }, [dockDraft, aiReady, aiChat.length, mentioned, chatSources]);

  // Keep the composer ready for the next turn — chat should feel continuous, not transactional.
  useEffect(() => {
    if (!aiTurnId && chatActive) focusPrompt();
  }, [aiTurnId, chatActive]);

  const continueToSetup = useCallback(() => {
    openNew({ path: 'ai', brief: briefFromChat(aiChat) || dockDraft.trim() });
  }, [aiChat, dockDraft, openNew]);

  const items: SidebarItem[] = useMemo(() => {
    const RECENT = 5;
    const newChat = () => {
      setDialog(null);
      setState({ dockDraft: '', aiChat: [], aiTurnId: null });
      void api.ai.reset();
      focusPrompt();
    };
    const shown = (recent ?? []).slice(0, RECENT);
    return [
      {
        id: 'chat',
        label: 'Chat',
        icon: MessageCircle,
        add: { label: 'New chat', onSelect: newChat },
        recents: {
          toggleLabel: 'Recent chats',
          empty: 'No chats yet',
          items: chats.slice(0, RECENT).map((c) => ({ id: c.id, label: c.text, meta: timeAgo(c.at), icon: <MessageCircle className="size-5 p-0.5" style={{ color: 'var(--src-chat)' }} strokeWidth={2} aria-hidden />, onSelect: () => pickChat(c) })),
          viewAll: chats.length > RECENT ? { label: 'View all chats', onSelect: () => setDialog({ kind: 'chats' }) } : undefined,
        },
      },
      {
        id: 'projects',
        label: 'Projects',
        icon: FolderOpen,
        add: { label: 'New project', onSelect: () => openNew() },
        recents: {
          toggleLabel: 'Recent projects',
          empty: recent === null ? 'Loading…' : 'No projects yet',
          items: shown.map((p) => ({ id: p.root, label: p.name, meta: timeAgo(p.openedAt), icon: <ProjectThumb icon={p.icon} name={p.name} className="size-5" />, onSelect: () => void openRecent(p.root) })),
          viewAll: { label: 'View all projects', onSelect: () => setDialog({ kind: 'projects' }) },
        },
      },
    ];
  }, [openNew, chats, recent, pickChat]);

  return (
    <LucideProvider strokeWidth={1.5} absoluteStrokeWidth>
      <TooltipProvider>
        <div data-tw="" className="flex h-full bg-[var(--home-bg)] text-foreground">
          <HomeSidebar label="Home" items={items} active={dialog?.kind === 'new' || dialog?.kind === 'projects' ? 'projects' : dialog?.kind === 'chats' ? 'chat' : null} busy={busy} open={navOpen} onSearch={() => setSearchOpen(true)} />
          <div ref={setCardEl} className={cn('relative min-w-0 flex-1 overflow-hidden border bg-[var(--home-card)] motion-safe:transition-[margin,border-radius,border-color] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]', navOpen || sourcesOpen ? 'm-2 rounded-[10px] border-foreground/[0.08]' : 'm-0 rounded-none border-transparent')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" data-home-nav-toggle="" className="absolute start-3 top-3 z-20 size-9 rounded-[8px] px-2.5 py-0 text-muted-foreground hover:text-foreground [&_svg]:size-[18px]" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} onClick={() => setNav(!navOpen)}>
                <HugeiconsIcon icon={navOpen ? LayoutAlignRightIcon : LayoutAlignLeftIcon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side={document.dir === 'rtl' ? 'left' : 'right'}>{navOpen ? 'Close navigation' : 'Open navigation'}</TooltipContent>
          </Tooltip>
          <div className="absolute start-14 top-3 z-20 flex max-w-[calc(100%-9rem)] items-center gap-2">
            <span title={chatTitle} className="inline-flex h-9 min-w-0 items-center rounded-[var(--pill)] bg-muted px-3.5 text-xs font-medium text-foreground">
              <span className="truncate">{chatTitle}</span>
            </span>
            <div ref={setChipHost} className="contents" />
          </div>
          {(sources.length > 0 || sourcesOpen) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" data-home-sources-toggle="" className="absolute end-3 top-3 z-20 h-9 gap-1.5 rounded-[var(--pill)] bg-muted px-3.5 text-xs font-medium text-foreground hover:bg-secondary [&_svg]:size-4" aria-label={sourcesOpen ? 'Hide sources' : 'Show sources'} aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((o) => !o)}>
                  <Library strokeWidth={2} />
                  {sources.length > 0 && <span className="text-xs tabular-nums">{sources.length}</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent side={document.dir === 'rtl' ? 'right' : 'left'}>{sourcesOpen ? 'Hide sources' : 'Show sources'}</TooltipContent>
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
                <div className="sticky bottom-0 z-10 shrink-0 bg-gradient-to-t from-[var(--home-card)] from-[40%] via-[color-mix(in_srgb,var(--home-card)_60%,transparent)] via-[55%] to-transparent to-75% px-8 pb-6 pt-8">
                  <div className="mx-auto flex w-full max-w-[680px] flex-col gap-2">
                    {!voiceMode && (
                      <div className="flex items-center justify-between gap-3 px-1">
                        <HomeStatusPills
                          className="min-w-0 px-0"
                          recentProjectName={recent?.[0]?.name ?? null}
                          onOpenProjects={() => setDialog({ kind: 'projects' })}
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
                          mentions={mentionOptions}
                          onMention={onMention}
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
                    mentions={mentionOptions}
                    onMention={onMention}
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
          <HomeRightPanel open={sourcesOpen} title="Sources" contentKey={`sources-${sources.length}`}>
            <SourcesPanel sources={sources} />
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
                setSearchOpen(false);
                openNew({ path: 'github', repo });
              }}
            />
          </SearchOverlay>
        )}
        {dialog?.kind === 'new' && (
          <NewProjectDialog
            key={`${dialog.path}:${dialog.brief}:${dialog.repo}`}
            location={location}
            minimized={newMinimized}
            chipHost={chipHost}
            initialPath={dialog.path}
            initialBrief={dialog.brief}
            initialRepo={dialog.repo}
            onClose={closeDialog}
            onMinimize={() => setNewMinimized(true)}
            onRestore={() => setNewMinimized(false)}
          />
        )}
        {dialog?.kind === 'projects' && (
          <HomeDialog title="All projects" onClose={closeDialog}>
            <AllProjectsList recent={recent} />
          </HomeDialog>
        )}
        {dialog?.kind === 'chats' && (
          <HomeDialog title="Recent chats" onClose={closeDialog}>
            <RecentChatsPanel chats={chats} onPick={pickChat} />
          </HomeDialog>
        )}
      </TooltipProvider>
    </LucideProvider>
  );
}
