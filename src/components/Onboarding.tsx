import { ChatCircle, FolderSimple, History, Lightning } from '../lib/home-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Bug01Icon, Delete02Icon, FolderZipIcon, LayoutAlignLeftIcon, LayoutAlignRightIcon, LinkSquare02Icon, Refresh01Icon, Search02Icon, SquarePenIcon } from '@hugeicons/core-free-icons';
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
import { startProjectFromBrief } from '../lib/start-project';
import { getState, setState, toast, useStore } from '../lib/store';
import { homeItemActions, type HomeMenuAction } from './home/HomeItemMenu';
import { HomeActionPills } from './home/HomeActionPills';
import { DeleteProjectDialog } from './home/DeleteProjectDialog';
import { AllProjectsList, ProjectThumb, timeAgo } from './home/AllProjectsPage';
import { HomeAiHint, HomeChat, typedText } from './home/HomeChat';
import { HomeComposerExtras } from './home/HomeComposerExtras';
import { HomeComposerContext } from './home/HomeComposerContext';
import { RecentChatsPanel, SearchPanel } from './home/HomePanels';
import { HomeDialog } from './home/HomeDialog';
import { NewProjectDialog, type StartPath } from './home/NewProjectDialog';
import { FileViewer, SourcesPanel, useSources, WebFaviconStack, type OpenFile, type Source } from './home/SourcesPanel';
import { HomePrompt, type Attachment, type MentionOption } from './home/HomePrompt';
import { HomeRightPanel } from './home/HomeRightPanel';
import { HomeAccount, HomePlan } from './home/HomeAccount';
import { MemoryList } from './home/HomeMemory';
import { HomeOnboardingTasks, useOnboarding, type OnboardingTask } from './home/HomeOnboardingTasks';
import { HomeSidebar, type NavRow, type NavSection } from './home/HomeSidebar';
import { HomeStatusPills } from './home/HomeStatusPills';
import type { RunningJob } from '../lib/running-work';
import { SearchOverlay } from './home/SearchOverlay';
import { VoiceOrbSession } from './home/VoiceOrbSession';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDisplayName } from '../lib/prefs';

type HomeDialogState = { kind: 'new'; path: StartPath | null; brief: string; repo: string } | { kind: 'projects' } | { kind: 'chats' } | { kind: 'memory' };

/** A pool of openers: some warm, some professional, some a little witty. The name is in every one. */
const GREETINGS: Array<(name: string, part: string) => string> = [
  (n, p) => `${p}, ${n}. What are we building?`,
  (n, p) => `${p}, ${n}.`,
  (n) => `Welcome back, ${n}.`,
  (n) => `Ready when you are, ${n}.`,
  (n) => `What shall we make today, ${n}?`,
  (n) => `Pixels are waiting, ${n}.`,
  (n) => `Let's make something good, ${n}.`,
  (n) => `${n}, the canvas is yours.`,
  (n) => `Big ideas only, ${n}. Small ones too.`,
  (n) => `Hello, ${n}. Shall we begin?`,
  (n) => `${n}, what are we shipping?`,
  (n) => `Fresh canvas, ${n}. No pressure.`,
];

/** With no name set there's nothing to put in the line, so it falls back to the plain greeting. */
function greeting(name: string, pick: number): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const who = name.trim();
  if (!who) return `${part}. What are we building?`;
  return GREETINGS[pick % GREETINGS.length](who, part);
}

const focusPrompt = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-home-prompt]')?.focus());

function briefFromChat(items: { kind: string; text?: string }[]): string {
  const users = items.filter((i): i is { kind: 'user'; text: string } => i.kind === 'user' && typeof i.text === 'string');
  return users[0]?.text ?? users[users.length - 1]?.text ?? '';
}

/** True when the person asks to turn the idea into a site — not just while they're describing it. */
const BUILD_INTENT =
  /\b(build|make|create|turn|start|generate|spin)\b.{0,40}\b(site|website|web\s*page|page|project|it|this|that)\b|\b(lets?|let'?s|can we|could we|shall we|please)\b.{0,24}\b(build|make|create|start|go)\b|\b(go ahead|build it|make it|ship it|do it|start building|build this)\b|^(go|build|make it|create it|start|yes,? build)\b/i;

function wantsToBuildSite(draft: string, items: { kind: string; text?: string }[]): boolean {
  if (BUILD_INTENT.test(draft.trim())) return true;
  const recent = items
    .filter((i): i is { kind: 'user'; text: string } => i.kind === 'user' && typeof i.text === 'string')
    .slice(-4)
    .map((i) => i.text);
  return recent.some((t) => BUILD_INTENT.test(t.trim()));
}

export function Onboarding() {
  const busy = useStore((s) => s.busy);
  const aiChat = useStore((s) => s.aiChat);
  const aiTurnId = useStore((s) => s.aiTurnId);
  const aiReady = useStore((s) => !!s.aiStatus?.ready);
  const dockDraft = useStore((s) => s.dockDraft);
  const runningCount = useStore((s) => s.runningJobs.length);
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [location, setLocation] = useState('');
  const [chats, setChats] = useState<HomeChatRecord[]>(loadHomeChats);
  const activeChatId = useRef<string | null>(null);
  const prevTurnId = useRef<string | null>(null);
  const displayName = useDisplayName();
  // One opener per visit to the home screen, so it doesn't change under the user's eyes.
  const [greetingPick] = useState(() => Math.floor(Math.random() * GREETINGS.length));
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const onboarding = useOnboarding();
  const [dialog, setDialog] = useState<HomeDialogState | null>(null);
  const [deleting, setDeleting] = useState<RecentProject | null>(null);
  const [newMinimized, setNewMinimized] = useState(false);
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const [chipHost, setChipHost] = useState<HTMLDivElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  // Home opens with the left nav closed; the toggle still works for the session.
  const [navOpen, setNavOpen] = useState(false);
  const setNav = useCallback((open: boolean) => setNavOpen(open), []);

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
    return first && first.kind === 'user' && typedText(first.text).trim() ? titleFromPrompt(typedText(first.text)) : 'New chat';
  }, [aiChat]);

  const chatSources = useSources(aiChat);
  const [mentioned, setMentioned] = useState<Source[]>([]);
  const [webSearch, setWebSearch] = useState<boolean>(() => { try { return localStorage.getItem('oc-web-search') !== 'off'; } catch { return true; } });
  const toggleWeb = useCallback((on: boolean) => { setWebSearch(on); try { localStorage.setItem('oc-web-search', on ? 'on' : 'off'); } catch { /* private mode */ } }, []);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Every message you've sent, newest first: this chat, then saved chats (follow-ups included).
  const history = useMemo(() => {
    const seen = new Set<string>();
    const sent = (items: { kind: string; text?: string }[] | undefined) =>
      [...(items ?? [])].reverse().flatMap((i) => (i.kind === 'user' && i.text ? [typedText(i.text).trim()] : []));
    const all = [...sent(aiChat), ...chats.flatMap((c) => (c.items ? sent(c.items) : [c.text.trim()]))];
    return all.filter((t) => t && !seen.has(t) && !!seen.add(t)).slice(0, 50);
  }, [aiChat, chats]);
  const addFiles = useCallback(async (files: File[]) => {
    const MAX = 200_000;
    for (const f of files) {
      if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) {
        if (f.size > 4_000_000) { toast(`${f.name} is over 4 MB`, 'error'); continue; }
        const data = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
          r.onerror = () => resolve('');
          r.readAsDataURL(f);
        });
        if (!data) { toast(`Couldn't read ${f.name}`, 'error'); continue; }
        setAttachments((cur) => (cur.filter((x) => x.image).length >= 4 || cur.length >= 5 || cur.some((x) => x.name === f.name && x.size === f.size) ? cur : [...cur, { id: `${f.name}:${f.size}:${Date.now()}`, name: f.name, size: f.size, text: '', image: { mimeType: f.type, data } }]));
        continue;
      }
      if (f.size > MAX) { toast(`${f.name} is over 200 KB`, 'error'); continue; }
      let text = '';
      try { text = await f.text(); } catch { /* unreadable */ }
      // Binary files decode to replacement characters; only plain text and code go to the model for now.
      if (!text || text.includes('\u0000') || (text.match(/\ufffd/g)?.length ?? 0) > 3) { toast(`${f.name}: only images, text and code files can be attached`, 'error'); continue; }
      setAttachments((cur) => (cur.length >= 5 || cur.some((x) => x.name === f.name && x.size === f.size) ? cur : [...cur, { id: `${f.name}:${f.size}:${Date.now()}`, name: f.name, size: f.size, text }]));
    }
  }, []);
  const removeAttachment = useCallback((id: string) => setAttachments((cur) => cur.filter((x) => x.id !== id)), []);
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

  const slashCommands: MentionOption[] = useMemo(
    () => [
      { id: 'cmd:new', label: 'New chat', detail: 'Start fresh', kind: 'skill' },
      { id: 'cmd:search', label: 'Search', detail: 'Find chats and projects', kind: 'skill' },
      { id: 'cmd:attach', label: 'Attach file', detail: 'Add text or code', kind: 'skill' },
      { id: 'cmd:settings', label: 'AI settings', detail: 'Models and keys', kind: 'skill' },
    ],
    [],
  );
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
    setState({ homeActiveChatId: chat.id, dockDraft: '', aiChat: itemsForHomeChat(chat), aiTurnId: null });
    void api.ai.hydrate(historyTurnsForHomeChat(chat));
    setDialog(null);
    setSearchOpen(false);
    focusPrompt();
  }, []);

  const openRunning = useCallback((job: RunningJob) => {
    if (job.place === 'canvas') {
      if (job.projectRoot) void openRecent(job.projectRoot);
      return;
    }
    const chat = job.chatId ? chats.find((item) => item.id === job.chatId) ?? null : null;
    if (!chat) return;
    if (activeChatId.current === chat.id) return;
    pickChat(chat);
  }, [chats, pickChat]);

  // Pull the last message back into the input: the chat rolls back to just before it, on screen and in the model's memory.
  const editLast = useCallback((id: string) => {
    const items = getState().aiChat;
    const idx = items.findIndex((i) => i.id === id);
    const item = items[idx];
    if (!item || item.kind !== 'user') return;
    stopAi();
    const kept = items.slice(0, idx);
    const turns = kept.flatMap((i) => ((i.kind === 'user' || i.kind === 'assistant') && i.text.trim() ? [{ role: i.kind, text: i.text }] : []));
    setState({ aiChat: kept, aiTurnId: null, aiStopped: null, dockDraft: typedText(item.text) });
    void api.ai.reset().then(() => api.ai.hydrate(turns));
    if (!kept.length && activeChatId.current) {
      const gone = activeChatId.current;
      setChats((cur) => removeHomeChat(cur, gone));
      activeChatId.current = null;
    }
    focusPrompt();
  }, []);

  const sendHome = useCallback(async () => {
    const text = dockDraft.trim() || (attachments.length ? 'See the attached file' + (attachments.length > 1 ? 's.' : '.') : '');
    if (!text || busy) return;
    // No AI yet: Enter still starts the project from the brief — the key is optional, not a gate.
    if (!aiReady) {
      void startProjectFromBrief(text);
      return;
    }
    const first = aiChat.length === 0;
    const chatId = activeChatId.current ?? (first ? `${Date.now()}` : null);
    if (chatId) {
      activeChatId.current = chatId;
      setState({ homeActiveChatId: chatId });
    }
    const projectRoot = getState().homeProjectRoot;
    const refs = [...mentioned, ...chatSources].filter((x) => text.includes(x.title)).sort((a, b) => text.indexOf(a.title) - text.indexOf(b.title));
    const fileBlock = attachments.length ? `\n\nAttached files:\n${attachments.map((a) => `--- ${a.name} ---\n${a.image ? '(image attached)' : a.text}`).join('\n\n')}` : '';
    const refsBlock = refs.length ? `\n\nReferenced:\n${refs.map((x) => `- [${x.kind}] ${x.title} (${x.detail.replace(/\s+/g, ' ').slice(0, 500)})`).join('\n')}` : '';
    const full = text + fileBlock + refsBlock;
    const used = refs.filter((x) => x.kind === 'skill');
    const skills = (await Promise.all(used.map(async (x) => ({ name: x.title, body: await api.skills.read(x.id.replace(/^skill:/, '')).catch(() => '') })))).filter((k) => k.body);
    const ok = await sendToAi(full, { ...(skills.length ? { skills } : {}), webSearch, ...(projectRoot ? { projectRoot } : {}), ...(attachments.some((a) => a.image) ? { images: attachments.flatMap((a) => (a.image ? [{ name: a.name, ...a.image }] : [])) } : {}) });
    // sendToAi only clears the draft when it matches what was sent, and `full` adds the references.
    if (ok && getState().dockDraft.trim() === text) setState({ dockDraft: '' });
    if (ok) setAttachments([]);
    if (ok && first && chatId) {
      setChats((current) => addHomeChat(current, text, undefined, chatId));
    }
    if (!ok && first) {
      activeChatId.current = null;
      setState({ homeActiveChatId: null });
    }
    if (ok) focusPrompt();
  }, [dockDraft, busy, aiReady, aiChat.length, mentioned, chatSources, attachments, webSearch]);

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

  /** Skip the wizard: brief → blank project → canvas → first AI turn. */
  const continueToProject = useCallback(() => {
    const brief = briefFromChat(aiChat) || dockDraft.trim();
    if (!brief || busy) return;
    void startProjectFromBrief(brief);
  }, [aiChat, dockDraft, busy]);

  const RECENT = 4;
  const newChat = useCallback(() => {
    activeChatId.current = null;
    setDialog(null);
    stopAi();
    setState({ homeActiveChatId: null, dockDraft: '', aiChat: [], aiTurnId: null });
    void api.ai.reset();
    focusPrompt();
  }, []);

  const onCommand = useCallback((id: string) => {
    if (id === 'new') newChat();
    else if (id === 'search') setSearchOpen(true);
    else if (id === 'settings') setState({ settingsOpen: true, settingsTab: 'ai' });
    else if (id === 'attach') {
      const el = document.createElement('input');
      el.type = 'file';
      el.multiple = true;
      el.onchange = () => void addFiles(Array.from(el.files ?? []));
      el.click();
    }
  }, [newChat, addFiles]);
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

  /** The actions in a recent project's menu on the start screen. */
  const recentActions = useCallback(
    (project: RecentProject): HomeMenuAction[] => {
      const icon = (i: IconSvgElement) => <HugeiconsIcon icon={i} strokeWidth={2} />;
      const fail = (e: unknown) => toast(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Something went wrong.', 'error');
      const actions: HomeMenuAction[] = [];
      if (project.git) {
        actions.push({
          id: 'update',
          label: 'Update',
          icon: icon(Refresh01Icon),
          onSelect: () => {
            toast(`Updating ${project.name}…`);
            api.projectActions.update(project.root).then(() => toast(`${project.name} is up to date`, 'success'), fail);
          },
        });
      }
      actions.push(
        {
          id: 'debug',
          label: 'Debug',
          icon: icon(Bug01Icon),
          onSelect: () => {
            setState({ dockDraft: `Help me debug the ${project.name} project: ` });
            focusPrompt();
          },
        },
        {
          id: 'share',
          label: 'Share as zip',
          icon: icon(FolderZipIcon),
          onSelect: () => {
            api.projectActions.zip(project.root).then((r) => r && toast(`Zipped ${r.fileCount} files`, 'success'), fail);
          },
        },
        {
          id: 'preview',
          label: 'Preview',
          icon: icon(LinkSquare02Icon),
          onSelect: () => {
            toast('Starting the preview…');
            api.projectActions.preview(project.root).catch(fail);
          },
        },
        { id: 'delete', label: 'Delete', destructive: true, icon: icon(Delete02Icon), onSelect: () => setDeleting(project) },
      );
      return actions;
    },
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
      { id: 'chats', label: 'Chats', icon: <ChatCircle />, onSelect: () => setDialog({ kind: 'chats' }) },
      { id: 'projects', label: 'Projects', icon: <FolderSimple />, disabled: busy, onSelect: () => setDialog({ kind: 'projects' }) },
      { id: 'skills', label: 'Skills', icon: <Lightning />, onSelect: openSkills },
      { id: 'memory', label: 'Memory', icon: <History />, onSelect: () => setDialog({ kind: 'memory' }) },
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
          icon: <ChatCircle weight="fill" className="size-5 p-0.5 text-muted-foreground" aria-hidden />,
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
  const tasks: OnboardingTask[] = useMemo(() => {
    const core: OnboardingTask[] = [
      {
        id: 'describe',
        label: 'Describe a site and build it',
        done: (recent?.length ?? 0) > 0 || onboarding.done.includes('describe') || onboarding.done.includes('project'),
        onSelect: () => {
          if (dockDraft.trim() || briefFromChat(aiChat)) continueToProject();
          else focusPrompt();
        },
      },
      {
        id: 'click',
        label: 'Click something and change it',
        done: onboarding.done.includes('click'),
        onSelect: () => {
          if ((recent?.length ?? 0) > 0) void openRecent(recent![0].root);
          else focusPrompt();
        },
      },
      {
        id: 'ask-more',
        label: 'Ask AI for one more change',
        done: onboarding.done.includes('ask-more'),
        onSelect: () => {
          if (!aiReady) {
            setState({ settingsOpen: true, settingsTab: 'ai' });
            return;
          }
          if ((recent?.length ?? 0) > 0) void openRecent(recent![0].root);
          else focusPrompt();
        },
      },
    ];
    // AI key comes last and only while missing — the loop works without it (scratch / prompt hand-off).
    if (!aiReady) {
      core.push({
        id: 'key',
        label: 'Connect AI when you’re ready',
        done: false,
        onSelect: () => setState({ settingsOpen: true, settingsTab: 'ai' }),
      });
    }
    return core;
  }, [aiReady, recent, onboarding.done, dockDraft, aiChat, continueToProject]);

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
            headerEnd={<HomePlan />}
            footer={!onboarding.dismissed ? <HomeOnboardingTasks tasks={tasks} onDismiss={onboarding.dismiss} onAutoDone={onboarding.complete} /> : null}
          />
          <div ref={setCardEl} className={cn('@container/card relative min-w-0 flex-1 overflow-hidden border bg-[var(--home-card)] motion-safe:transition-[margin,border-radius,border-color] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]', navOpen || sourcesOpen ? 'm-2 rounded-[10px] border-foreground/[0.08]' : 'm-0 rounded-none border-transparent')}>
          <Button variant="ghost" data-home-nav-toggle="" className="absolute start-3 top-3 z-20 size-9 rounded-[var(--r-pill)] px-2.5 py-0 text-muted-foreground hover:text-foreground [&_svg]:size-[18px]" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} onClick={() => setNav(!navOpen)}>
            <HugeiconsIcon icon={navOpen ? LayoutAlignRightIcon : LayoutAlignLeftIcon} strokeWidth={2} />
          </Button>
          <HomeAccount onSettings={() => setState({ settingsOpen: true })} />
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
                : 'relative flex h-full min-w-0 flex-col items-center justify-center overflow-y-auto px-8 py-16'
            }
          >
            {chatActive ? (
              <>
                <div className="mx-auto w-full max-w-[680px] flex-1 px-8 pt-16">
                  <HomeChat split outline outlineFallbackAt={chats.find((c) => c.id === activeChatId.current)?.at} onEditLast={editLast} />
                </div>
                <div className="sticky bottom-0 z-10 shrink-0 bg-gradient-to-t from-[var(--home-card)] from-[40%] via-[color-mix(in_srgb,var(--home-card)_60%,transparent)] via-[55%] to-transparent to-75% px-8 pb-3 pt-8">
                  <div className="mx-auto flex w-full max-w-[680px] flex-col gap-2">
                    {!voiceMode && (
                      <HomeStatusPills
                        className="min-w-0 px-1"
                        onOpenProjects={() => setDialog({ kind: 'projects' })}
                        onOpenRunning={openRunning}
                      />
                    )}
                    {voiceMode ? (
                      <VoiceOrbSession onClose={endVoice} />
                    ) : (
                      <>
                        {wantsToBuildSite(dockDraft, aiChat) && (
                          <div className="flex w-full justify-start px-1">
                            <Button type="button" variant="secondary" className="rounded-[var(--pill)] text-[13px] font-normal" disabled={busy || !!aiTurnId} onClick={continueToProject}>
                              {aiReady ? 'Build this site' : 'Continue to project'}
                            </Button>
                          </div>
                        )}
                        <HomePrompt
                          value={dockDraft}
                          onChange={(value) => setState({ dockDraft: value })}
                          onSubmit={() => void sendHome()}
                          onVoice={aiReady ? startVoice : undefined}
                          disabled={busy}
                          sending={!!aiTurnId}
                          mentions={mentionOptions}
                          onMention={onMention}
                          skills={skillOptions}
                          onOpenSkills={openSkills}
                          commands={slashCommands}
                          onCommand={onCommand}
                          attachments={attachments}
                          onAttach={(f) => void addFiles(f)}
                          onRemoveAttachment={removeAttachment}
                        webSearch={webSearch}
                        onWebSearch={toggleWeb}
                          history={history}
                        />
                        <HomeComposerExtras />
                        <div className="flex flex-wrap items-center gap-2 px-1">
                          <HomeAiHint />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="relative z-10 flex w-full max-w-[680px] flex-col items-center">
                <h1 className="mb-6 font-display text-balance text-center text-[36px] font-normal leading-[1.15] tracking-[-0.01em]">{greeting(displayName, greetingPick)}</h1>
                <div className="flex w-full flex-col items-center gap-3">
                  {wantsToBuildSite(dockDraft, aiChat) && (
                    <div className="flex w-full justify-start">
                      <Button type="button" variant="secondary" className="rounded-[var(--pill)] text-[13px] font-normal" disabled={busy} onClick={continueToProject}>
                        {aiReady ? 'Build this site' : 'Continue to project'}
                      </Button>
                    </div>
                  )}
                  {/* Start state only: one taller card. Typing, voice and send on top; attach, web and the model along
                      the bottom-left, and the branch, project and context ring along the bottom-right.
                      The running-work pill sits above it and stays hidden while nothing is running.
                      Once a conversation exists, the block above uses the plain composer. */}
                  {!voiceMode && runningCount > 0 && (
                    <HomeStatusPills
                      className="w-full min-w-0 px-1"
                      onOpenProjects={() => setDialog({ kind: 'projects' })}
                      onOpenRunning={openRunning}
                    />
                  )}
                  <div data-home-composer-deck="" className="w-full">
                    <HomePrompt
                      deck
                      value={dockDraft}
                      onChange={(value) => setState({ dockDraft: value })}
                      onSubmit={() => void sendHome()}
                      onVoice={aiReady ? startVoice : undefined}
                      disabled={busy}
                      sending={!!aiTurnId}
                      mentions={mentionOptions}
                      onMention={onMention}
                      skills={skillOptions}
                      onOpenSkills={openSkills}
                      commands={slashCommands}
                      onCommand={onCommand}
                      attachments={attachments}
                      onAttach={(f) => void addFiles(f)}
                      onRemoveAttachment={removeAttachment}
                      webSearch={webSearch}
                      onWebSearch={toggleWeb}
                      history={history}
                      footerStart={<HomeComposerExtras variant="composer" />}
                      footerEnd={<HomeComposerContext projects={recent ?? []} onOpenProjects={() => setDialog({ kind: 'projects' })} />}
                    />
                  </div>
                  <HomeActionPills
                    disabled={busy}
                    onPick={(starter) => {
                      setState({ dockDraft: starter });
                      focusPrompt();
                    }}
                  />
                  <HomeAiHint className="text-center" />
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
        {deleting && (
          <DeleteProjectDialog
            project={deleting}
            onClose={() => setDeleting(null)}
            onDelete={async (typedName) => {
              await api.projectActions.remove(deleting.root, typedName);
              setRecent((current) => (current ? current.filter((p) => p.root !== deleting.root) : current));
              setDeleting(null);
              toast(`Deleted ${deleting.name}`, 'success');
            }}
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
