import { Brain, ChatCircle, FolderSimple, Lightning } from '../lib/home-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { LayoutAlignLeftIcon, LayoutAlignRightIcon, Search02Icon, SquarePenIcon } from '@hugeicons/core-free-icons';
import { Library } from '../lib/home-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RecentProject, SkillMeta } from '../../shared/types';
import { api } from '../lib/api';
import { sendToAi, stopAi } from '../lib/ai';
import { openRecent } from '../lib/actions';
import {
  addHomeChat,
  historyTurnsForHomeChat,
  itemsForHomeChat,
  loadHomeChats,
  removeHomeChat,
  titleFromPrompt,
  updateHomeChatItems,
  type HomeChat as HomeChatRecord,
} from '../lib/home-chats';
import { getState, setState, toast, useStore } from '../lib/store';
import { homeItemActions } from './home/HomeItemMenu';
import { AllProjectsList, ProjectThumb, timeAgo } from './home/AllProjectsPage';
import { HomeAiHint, HomeChat } from './home/HomeChat';
import { HomeComposerExtras } from './home/HomeComposerExtras';
import { RecentChatsPanel, SearchPanel } from './home/HomePanels';
import { HomeDialog } from './home/HomeDialog';
import { NewProjectDialog, type StartPath } from './home/NewProjectDialog';
import { FileViewer, SourcesPanel, useSources, WebFaviconStack, type OpenFile, type Source } from './home/SourcesPanel';
import { HomePrompt, type MentionOption } from './home/HomePrompt';
import { HomeRightPanel } from './home/HomeRightPanel';
import { HomeAccount } from './home/HomeAccount';
import { MemoryList } from './home/HomeMemory';
import { HomeOnboardingTasks, useOnboarding, type OnboardingTask } from './home/HomeOnboardingTasks';
import { HomeSidebar, type NavRow, type NavSection } from './home/HomeSidebar';
import { HomeStatusPills } from './home/HomeStatusPills';
import { SearchOverlay } from './home/SearchOverlay';
import { VoiceOrbSession } from './home/VoiceOrbSession';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type HomeDialogState = { kind: 'new'; path: StartPath | null; brief: string; repo: string } | { kind: 'projects' } | { kind: 'chats' } | { kind: 'memory' };

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
  const activeChatId = useRef<string | null>(null);
  const prevTurnId = useRef<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const onboarding = useOnboarding();
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
    return first && first.kind === 'user' && first.text.trim() ? titleFromPrompt(first.text) : 'New chat';
  }, [aiChat]);

  const chatSources = useSources(aiChat);
  const [mentioned, setMentioned] = useState<Source[]>([]);
  const [skillList, setSkillList] = useState<SkillMeta[]>([]);
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
  const skillOptions: MentionOption[] = useMemo(() => skillList.map((k) => ({ id: `skill:${k.id}`, label: k.name, detail: k.description, kind: 'skill' as const })), [skillList]);
  const openSkills = useCallback(() => {
    void api.skills.openFolder().then(() => api.skills.list()).then(setSkillList).catch(() => undefined);
  }, []);
  const onMention = useCallback((o: MentionOption) => {
    onboarding.complete(o.kind === 'skill' ? 'skill' : 'mention');
    if (o.kind === 'project' || o.kind === 'chat' || o.kind === 'skill') setMentioned((cur) => (cur.some((x) => x.id === o.id) ? cur : [{ id: o.id, kind: o.kind, title: o.label, detail: o.detail }, ...cur]));
  }, [onboarding.complete]);

  useEffect(() => {
    if (!sourcesOpen) setOpenFile(null);
  }, [sourcesOpen]);

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
  useEffect(() => {
    void api.recentProjects().then(setRecent);
    void api.defaultLocation().then(setLocation);
    void api.skills.list().then(setSkillList).catch(() => undefined);
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
    activeChatId.current = chat.id;
    stopAi();
    setState({ dockDraft: '', aiChat: itemsForHomeChat(chat), aiTurnId: null });
    void api.ai.hydrate(historyTurnsForHomeChat(chat));
    setDialog(null);
    setSearchOpen(false);
    focusPrompt();
  }, []);

  const sendHome = useCallback(async () => {
    const text = dockDraft.trim();
    if (!text || !aiReady) return;
    const first = aiChat.length === 0;
    const refs = [...mentioned, ...chatSources].filter((x) => text.includes(x.title)).sort((a, b) => text.indexOf(a.title) - text.indexOf(b.title));
    const full = refs.length ? `${text}\n\nReferenced:\n${refs.map((x) => `- [${x.kind}] ${x.title} (${x.detail.replace(/\s+/g, ' ').slice(0, 500)})`).join('\n')}` : text;
    const used = refs.filter((x) => x.kind === 'skill');
    const skills = (await Promise.all(used.map(async (x) => ({ name: x.title, body: await api.skills.read(x.id.replace(/^skill:/, '')).catch(() => '') })))).filter((k) => k.body);
    const ok = await sendToAi(full, skills.length ? { skills } : undefined);
    // sendToAi only clears the draft when it matches what was sent, and `full` adds the references.
    if (ok && getState().dockDraft.trim() === text) setState({ dockDraft: '' });
    if (ok && first) {
      setChats((current) => {
        const next = addHomeChat(current, text);
        activeChatId.current = next[0]?.id ?? null;
        return next;
      });
    }
    if (ok) focusPrompt();
  }, [dockDraft, aiReady, aiChat.length, mentioned, chatSources]);

  // Keep the composer ready for the next turn — chat should feel continuous, not transactional.
  useEffect(() => {
    if (!aiTurnId && chatActive) focusPrompt();
  }, [aiTurnId, chatActive]);

  // Persist the transcript when a turn finishes so "Recent" opens the conversation, not the draft.
  useEffect(() => {
    const was = prevTurnId.current;
    prevTurnId.current = aiTurnId;
    if (!was || aiTurnId) return;
    const id = activeChatId.current;
    if (!id) return;
    const items = getState().aiChat;
    if (!items.length) return;
    setChats((current) => updateHomeChatItems(current, id, items));
  }, [aiTurnId]);

  const continueToSetup = useCallback(() => {
    openNew({ path: 'ai', brief: briefFromChat(aiChat) || dockDraft.trim() });
  }, [aiChat, dockDraft, openNew]);

  const RECENT = 4;
  const newChat = useCallback(() => {
    activeChatId.current = null;
    setDialog(null);
    stopAi();
    setState({ dockDraft: '', aiChat: [], aiTurnId: null });
    void api.ai.reset();
    focusPrompt();
  }, []);
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

  const chatMenu = useCallback(
    (chat: HomeChatRecord) =>
      homeItemActions({
        onDelete: () => {
          if (activeChatId.current === chat.id) {
            activeChatId.current = null;
            stopAi();
            setState({ dockDraft: '', aiChat: [], aiTurnId: null });
            void api.ai.reset();
          }
          setChats((current) => removeHomeChat(current, chat.id));
          toast('Chat deleted');
        },
        onShare: () => {
          void navigator.clipboard.writeText(chat.text).then(
            () => toast('Copied to clipboard', 'success'),
            () => toast('Could not copy', 'error'),
          );
        },
        onSummarize: () => {
          setState({ dockDraft: `Summarize this: ${chat.text}` });
          setDialog(null);
          focusPrompt();
        },
      }),
    [],
  );

  const projectMenu = useCallback(
    (project: RecentProject) =>
      homeItemActions({
        onDelete: () => {
          setRecent((current) => (current ? current.filter((p) => p.root !== project.root) : current));
          toast('Removed from recent');
        },
        onShare: () => {
          void navigator.clipboard.writeText(project.root).then(
            () => toast('Path copied', 'success'),
            () => toast('Could not copy', 'error'),
          );
        },
        onSummarize: () => {
          setState({ dockDraft: `Summarize the project at ${project.name}` });
          setDialog(null);
          focusPrompt();
        },
      }),
    [],
  );

  const actions: NavRow[] = useMemo(
    () => [
      { id: 'new-chat', label: 'New chat', icon: <HugeiconsIcon icon={SquarePenIcon} strokeWidth={2} />, onSelect: newChat },
      { id: 'search', label: 'Search', icon: <HugeiconsIcon icon={Search02Icon} strokeWidth={2} />, shortcut: isMac ? '⌘K' : 'Ctrl K', onSelect: () => setSearchOpen(true) },
    ],
    [newChat, isMac],
  );
  const library: NavRow[] = useMemo(
    () => [
      { id: 'chats', label: 'Chats', icon: <ChatCircle weight="fill" style={{ color: 'var(--src-chat)' }} />, onSelect: () => setDialog({ kind: 'chats' }) },
      { id: 'projects', label: 'Projects', icon: <FolderSimple weight="fill" style={{ color: 'var(--src-project)' }} />, disabled: busy, onSelect: () => setDialog({ kind: 'projects' }) },
      { id: 'skills', label: 'Skills', icon: <Lightning weight="fill" style={{ color: 'var(--src-skill)' }} />, onSelect: openSkills },
      { id: 'memory', label: 'Memory', icon: <Brain weight="fill" />, onSelect: () => setDialog({ kind: 'memory' }) },
    ],
    [busy, openSkills],
  );
  const sections: NavSection[] = useMemo(
    () => [
      {
        id: 'recent-chats',
        title: 'Recent chats',
        empty: 'No chats yet',
        entries: chats.slice(0, RECENT).map((c) => ({
          id: c.id,
          label: titleFromPrompt(c.text),
          meta: timeAgo(c.at),
          icon: <ChatCircle weight="fill" className="size-5 p-0.5" style={{ color: 'var(--src-chat)' }} aria-hidden />,
          onSelect: () => pickChat(c),
          menu: chatMenu(c),
        })),
        more: { label: 'View All', onSelect: () => setDialog({ kind: 'chats' }) },
      },
      {
        id: 'recent-projects',
        title: 'Recent projects',
        add: { label: 'New project', onSelect: () => openNew() },
        empty: recent === null ? 'Loading…' : 'No projects yet',
        entries: (recent ?? []).slice(0, RECENT).map((p) => ({
          id: p.root,
          label: p.name,
          meta: timeAgo(p.openedAt),
          disabled: busy,
          icon: <ProjectThumb icon={p.icon} name={p.name} className="size-5" />,
          onSelect: () => void openRecent(p.root),
          menu: projectMenu(p),
        })),
        more: (recent?.length ?? 0) > RECENT ? { label: 'View All', onSelect: () => setDialog({ kind: 'projects' }) } : undefined,
      },
    ],
    [chats, recent, busy, pickChat, openNew, chatMenu, projectMenu],
  );
  const tasks: OnboardingTask[] = useMemo(
    () => [
      { id: 'key', label: 'Add an AI provider key', done: aiReady, onSelect: () => setState({ settingsOpen: true }) },
      { id: 'project', label: 'Create your first project', done: (recent?.length ?? 0) > 0 || onboarding.done.includes('project'), onSelect: () => openNew() },
      { id: 'skill', label: 'Try a skill with /', done: onboarding.done.includes('skill'), onSelect: () => { setState({ dockDraft: '/' }); focusPrompt(); } },
      { id: 'mention', label: 'Reference something with @', done: onboarding.done.includes('mention'), onSelect: () => { setState({ dockDraft: '@' }); focusPrompt(); } },
    ],
    [aiReady, recent, onboarding.done, openNew],
  );

  return (
    <>
      <TooltipProvider>
        <div data-tw="" className="flex h-full bg-[var(--home-bg)] text-foreground">
          <HomeSidebar
            label="Home"
            open={navOpen}
            actions={actions}
            library={library}
            sections={sections}
            footer={
              <>
                {!onboarding.dismissed && <HomeOnboardingTasks tasks={tasks} onDismiss={onboarding.dismiss} onAutoDone={onboarding.complete} />}
                <HomeAccount onSettings={() => setState({ settingsOpen: true })} />
              </>
            }
          />
          <div ref={setCardEl} className={cn('relative min-w-0 flex-1 overflow-hidden border bg-[var(--home-card)] motion-safe:transition-[margin,border-radius,border-color] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]', navOpen || sourcesOpen ? 'm-2 rounded-[10px] border-foreground/[0.08]' : 'm-0 rounded-none border-transparent')}>
          <Button variant="ghost" data-home-nav-toggle="" className="absolute start-3 top-3 z-20 size-9 rounded-[8px] px-2.5 py-0 text-muted-foreground hover:text-foreground [&_svg]:size-[18px]" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} onClick={() => setNav(!navOpen)}>
            <HugeiconsIcon icon={navOpen ? LayoutAlignRightIcon : LayoutAlignLeftIcon} strokeWidth={2} />
          </Button>
          <div className="absolute start-14 top-3 z-20 flex max-w-[calc(100%-9rem)] items-center gap-2">
            <span title={chatTitle} className="inline-flex h-9 max-w-[240px] min-w-0 items-center overflow-hidden rounded-[var(--pill)] bg-muted px-3.5 text-xs font-medium text-foreground">
              <span className="truncate">{chatTitle}</span>
            </span>
            <div ref={setChipHost} className="contents" />
          </div>
          {(sources.length > 0 || sourcesOpen) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  data-home-sources-toggle=""
                  className={cn(
                    'absolute end-3 top-3 z-20 h-9 rounded-[var(--pill)] text-foreground hover:bg-secondary',
                    sources.some((s) => s.href) ? 'bg-transparent px-1.5 hover:bg-muted/80' : 'gap-1.5 bg-muted px-3.5 text-xs font-medium [&_svg]:size-4',
                  )}
                  aria-label={sourcesOpen ? 'Hide sources' : 'Show sources'}
                  aria-expanded={sourcesOpen}
                  onClick={() => setSourcesOpen((o) => !o)}
                >
                  {sources.some((s) => s.href) ? (
                    <WebFaviconStack sources={sources.filter((s) => !!s.href)} max={3} size={26} overlap={10} />
                  ) : (
                    <>
                      <Library strokeWidth={2} />
                      {sources.length > 0 && <span className="text-xs tabular-nums">{sources.length}</span>}
                    </>
                  )}
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
                <div className="mx-auto w-full max-w-[680px] flex-1 px-8 pt-16">
                  <HomeChat />
                </div>
                <div className="sticky bottom-0 z-10 shrink-0 bg-gradient-to-t from-[var(--home-card)] from-[40%] via-[color-mix(in_srgb,var(--home-card)_60%,transparent)] via-[55%] to-transparent to-75% px-8 pb-6 pt-8">
                  <div className="mx-auto flex w-full max-w-[680px] flex-col gap-2">
                    {!voiceMode && (
                      <HomeStatusPills
                        className="min-w-0 px-1"
                        onOpenProjects={() => setDialog({ kind: 'projects' })}
                      />
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
                          skills={skillOptions}
                          onOpenSkills={openSkills}
                        />
                        <HomeComposerExtras />
                        <div className="px-1">
                          <HomeAiHint />
                        </div>
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
                          skills={skillOptions}
                          onOpenSkills={openSkills}
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
          <HomeRightPanel open={sourcesOpen} title="Sources" contentKey={`sources-${sources.length}`} file={openFile ? <FileViewer file={openFile} onClose={() => setOpenFile(null)} /> : undefined}>
            <SourcesPanel sources={sources} file={openFile} onFile={setOpenFile} />
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
        {dialog?.kind === 'memory' && (
          <HomeDialog title="Memory" onClose={closeDialog}>
            <MemoryList />
          </HomeDialog>
        )}
        {dialog?.kind === 'chats' && (
          <HomeDialog title="Recent chats" onClose={closeDialog}>
            <RecentChatsPanel chats={chats} onPick={pickChat} menuFor={chatMenu} />
          </HomeDialog>
        )}
      </TooltipProvider>
    </>
  );
}
