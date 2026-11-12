import { Copy, Keyboard, KeyRound, Monitor, Moon, Palette, Plug, RefreshCw, Settings as SettingsIcon, SlidersHorizontal, Sparkles, Sun, Type, X } from '../lib/hugeicons';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { McpStatus, ThemePreference } from '../../shared/types';
import { api } from '../lib/api';
import { plural } from '../lib/plural';
import { setState, toast, useStore, type SettingsTab } from '../lib/store';
import { AiSettingsPanel } from './settings/AiSettings';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { AiMagicIcon, ConnectIcon, CursorEdit02Icon, FilterVerticalIcon, User02Icon } from '@hugeicons/core-free-icons';
import { SettingRow, SettingsGroup, Switch } from './settings/parts';
import { USER_AVATAR_SRC } from '../lib/user-avatar';
import { ReasoningEffort } from './home/ReasoningEffort';
import { CHAT_BUBBLE_PRESETS, setChatBubblePreset, useChatBubblePreset } from '../lib/chat-bubble';
import { CHAT_FONT_SIZE_PRESETS, setChatFontSize, useChatFontSize } from '../lib/chat-font-size';
import { getOrbColors, ORB_COLOR_PRESETS, setOrbColorPreset, useOrbColorPreset } from '../lib/orb-colors';
import { setThemePreference, useTheme } from '../lib/theme';
import { setCalm, useCalm } from '../lib/calm';
import { setShowMarkers, useShowMarkers } from '../lib/comments';
import { setExperienceLevel, useExperienceLevel, type ExperienceLevel } from '../lib/experience';
import { setAutosave, setDisplayName, setQuickPills, setReduceMotion, setSendKey, useAutosave, useDisplayName, useQuickPills, useReduceMotion, useSendKey } from '../lib/prefs';
import { setRulers, useRulers } from '../lib/rulers';
import { Button, InputShell, Notice } from '../ui/primitives.jsx';
import { ToolButton } from '../ui/ToolRail.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const mcpState = (s: McpStatus | null) => (!s?.enabled ? 'off' : s.running ? 'on' : 'error');

export function SettingsButton() {
  const status = useStore((s) => s.mcp);
  const open = useStore((s) => s.settingsOpen);
  const state = mcpState(status);
  return (
    <ToolButton label="Settings" active={open} onClick={() => setState({ settingsOpen: !open })}>
      <SettingsIcon size={15} />
      {state !== 'off' && <span className={`mcp-dot is-${state}`} aria-hidden />}
    </ToolButton>
  );
}

const TABS: { id: SettingsTab; label: string; icon: IconSvgElement; lead: string | null }[] = [
  { id: 'general', label: 'General', icon: FilterVerticalIcon, lead: 'Everyday preferences for the home chat.' },
  { id: 'appearance', label: 'Appearance', icon: CursorEdit02Icon, lead: 'Theme and colors.' },
  { id: 'ai', label: 'AI', icon: AiMagicIcon, lead: 'The model that answers in chat and on the canvas, and how it sounds.' },
  { id: 'connections', label: 'Connections', icon: ConnectIcon, lead: 'Connect agents and other tools to your project.' },
  { id: 'account', label: 'Account', icon: User02Icon, lead: 'Your profile and the data kept on this device.' },
];

export function SettingsPage() {
  const open = useStore((s) => s.settingsOpen);
  const tab = useStore((s) => s.settingsTab);
  const level = useExperienceLevel();
  const tabs = TABS;
  const activeTab = tab;
  const setTab = (id: SettingsTab) => setState({ settingsTab: id });
  const close = () => setState({ settingsOpen: false });
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    // Move focus into the dialog, and give it back to the Settings button on close.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return () => opener?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.dialog-backdrop') && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0]!;
  // Portaled to <body>: the workspace restyles its direct children, which pushed this page off to the side.
  return createPortal(
    <TooltipProvider>
      <div className="settings-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
        <section ref={dialog} className="settings-page" role="dialog" aria-modal="true" aria-label="Settings">
          <nav className="settings-page__nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
            <h1 className="settings-page__title">Settings</h1>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} role="tab" aria-selected={activeTab === id} className={`settings-page__tab${activeTab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
                <HugeiconsIcon icon={Icon} size={16} strokeWidth={1.8} />
                {label}
              </button>
            ))}
            <div className="settings-page__spacer" />
            <button className="settings-page__tab" onClick={() => setState({ shortcutsOpen: true })}>
              <Keyboard size={16} />
              Keyboard shortcuts
            </button>
          </nav>
          <div className="settings-page__content" role="tabpanel" aria-label={current.label}>
            <header className="settings-page__head">
              <div>
                <h2>{current.label}</h2>
              </div>
              <button className="settings-page__close" aria-label="Close settings" onClick={close}>
                <X size={16} />
              </button>
            </header>
            <div className="settings-page__inner">
              {activeTab === 'general' ? (
                <GeneralSettings />
              ) : activeTab === 'appearance' ? (
                <AppearanceSettings />
              ) : activeTab === 'ai' ? (
                <AiSettingsPanel />
              ) : activeTab === 'connections' ? (
                <ConnectionsSettings />
              ) : (
                <AccountSettings />
              )}
            </div>
          </div>
        </section>
      </div>
    </TooltipProvider>,
    document.body,
  );
}

const LEVELS: { id: ExperienceLevel; label: string; blurb: string; unlocks: string }[] = [
  { id: 'beginner', label: 'Easy', blurb: 'Describe changes in chat and tweak things right on the canvas.', unlocks: 'Chat, quick pills, calm canvas' },
  { id: 'intermediate', label: 'Moderate', blurb: 'Take more control of how your pages are put together.', unlocks: 'Adds layers, pages and the inspector' },
  { id: 'veteran', label: 'Veteran', blurb: 'The whole editor, for people who work in code.', unlocks: 'Adds code, terminal, tools and MCP' },
];

const LEVEL_STOPS = LEVELS.map(({ id, label }) => ({ id, label }));

/** The learning curve as the same slider the home page uses for thinking strength; what each stop means sits underneath. */
function LearningCurve({ level }: { level: ExperienceLevel }) {
  const current = LEVELS.find((l) => l.id === level) ?? LEVELS[0];
  const [live, setLive] = useState(current.label);
  useEffect(() => setLive(current.label), [current.label]);
  const shown = LEVELS.find((l) => l.label === live) ?? current;
  return (
    <div className="lc">
      <div className="lc__row">
        <ReasoningEffort<ExperienceLevel> value={level} onChange={setExperienceLevel} modelLabel={current.label} onStopChange={setLive} stops={LEVEL_STOPS} ariaLabel="Learning curve" />
        <span className="lc__live">{live}</span>
      </div>
      <div className="lc__context" aria-live="polite">
        <p className="lc__blurb">{shown.blurb}</p>
        <p className="lc__unlocks">{shown.unlocks}</p>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const fontSize = useChatFontSize();
  const sendKey = useSendKey();
  const level = useExperienceLevel();
  const calm = useCalm();
  const markers = useShowMarkers();
  const pills = useQuickPills();
  const rulers = useRulers();
  const autosave = useAutosave();
  return (
    <>
      <SettingsGroup title="Learning curve" hint="Start simple and unlock more of the editor as you get comfortable. You can change this any time.">
        <LearningCurve level={level} />
      </SettingsGroup>

      <SettingsGroup title="Chat">
        <SettingRow label="Message size" hint="How large replies and your messages read in chat.">
          <div className="theme-toggle" role="radiogroup" aria-label="Chat font size">
            {CHAT_FONT_SIZE_PRESETS.map(({ id, label }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button type="button" role="radio" aria-checked={fontSize === id} aria-label={label} className={`theme-toggle__btn${fontSize === id ? ' is-active' : ''}`} onClick={() => setChatFontSize(id)}>
                    <Type size={id === 'small' ? 12 : id === 'large' ? 18 : 15} strokeWidth={1.75} aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="Send with" hint={sendKey === 'enter' ? 'Enter sends. Shift+Enter adds a new line.' : 'Ctrl+Enter (⌘+Enter on Mac) sends. Enter adds a new line.'}>
          <div className="theme-toggle" role="radiogroup" aria-label="Send key">
            {([['enter', 'Enter'], ['mod-enter', 'Ctrl+Enter']] as const).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={sendKey === id} className={`theme-toggle__btn sx-text-btn${sendKey === id ? ' is-active' : ''}`} onClick={() => setSendKey(id)}>
                {label}
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Canvas">
        <SettingRow label="Calm canvas" hint="Just your site and the dock on a plain background. Panels open from the corner pills.">
          <Switch
            label="Calm canvas"
            checked={level === 'beginner' ? true : calm}
            onChange={(on) => {
              if (level === 'beginner' && !on) return;
              setCalm(on);
            }}
          />
        </SettingRow>
        <SettingRow label="Comment markers" hint="Show the small numbered markers on elements that have comments.">
          <Switch label="Comment markers" checked={markers} onChange={setShowMarkers} />
        </SettingRow>
        <SettingRow label="Quick edit pills" hint="The Edit, Font and Colour pills that appear beside the dock when you select an element.">
          <Switch
            label="Quick edit pills"
            checked={level === 'beginner' ? true : pills}
            onChange={(on) => {
              if (level === 'beginner' && !on) return;
              setQuickPills(on);
            }}
          />
        </SettingRow>
        <SettingRow label="Rulers" hint="Show rulers along the edges of the canvas.">
          <Switch label="Rulers" checked={rulers} onChange={setRulers} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Editing">
        <SettingRow label="Autosave" hint="How soon code changes are written to disk after you stop typing.">
          <div className="theme-toggle" role="radiogroup" aria-label="Autosave speed">
            {([['fast', 'Fast'], ['normal', 'Normal'], ['slow', 'Slow']] as const).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={autosave === id} className={`theme-toggle__btn sx-text-btn${autosave === id ? ' is-active' : ''}`} onClick={() => setAutosave(id)}>
                {label}
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

const THEMES: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

function AppearanceSettings() {
  const { preference } = useTheme();
  const bubble = useChatBubblePreset();
  const orb = useOrbColorPreset();
  const orbColors = getOrbColors(orb);
  const reduceMotion = useReduceMotion();
  return (
    <>
      <SettingsGroup title="Theme">
        <SettingRow label="Color mode" hint="System follows your device and switches with it.">
          <div className="theme-toggle" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button type="button" role="radio" aria-checked={preference === id} aria-label={label} className={`theme-toggle__btn${preference === id ? ' is-active' : ''}`} onClick={() => setThemePreference(id)}>
                    <Icon size={15} strokeWidth={1.75} aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Chat">
        <SettingRow label="Your messages">
          <div className="sx-swatch-line">
            <div className="appearance-preview__bubble" aria-hidden>{'Looks good'}</div>
            <div className="swatch-row" role="radiogroup" aria-label="Message bubble color">
              {CHAT_BUBBLE_PRESETS.map(({ id, label, swatch }) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <button type="button" role="radio" aria-checked={bubble === id} aria-label={label} className={`swatch-dot${bubble === id ? ' is-active' : ''}`} style={{ background: id === 'default' ? 'var(--fg)' : swatch }} onClick={() => setChatBubblePreset(id)} />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        </SettingRow>
        <SettingRow label="Voice orb">
          <div className="sx-swatch-line">
            <div className="appearance-preview__orb" aria-hidden style={{ background: `radial-gradient(circle at 35% 30%, ${orbColors[0]}, ${orbColors[1]} 70%)` }} />
            <div className="swatch-row" role="radiogroup" aria-label="Voice orb color">
              {ORB_COLOR_PRESETS.map(({ id, label, colors }) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <button type="button" role="radio" aria-checked={orb === id} aria-label={label} className={`swatch-dot${orb === id ? ' is-active' : ''}`} style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }} onClick={() => setOrbColorPreset(id)} />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Motion">
        <SettingRow label="Reduce motion" hint="Turns off animations and transitions across the app.">
          <Switch label="Reduce motion" checked={reduceMotion} onChange={setReduceMotion} />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

function ago(at: number | null) {
  if (!at) return '';
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

const cursorConfig = (s: McpStatus) =>
  JSON.stringify({ mcpServers: { opencanvas: { url: s.url, headers: { Authorization: `Bearer ${s.token}` } } } }, null, 2);
const claudeCommand = (s: McpStatus) => `claude mcp add --transport http opencanvas ${s.url} --header "Authorization: Bearer ${s.token}"`;

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${what}`, 'success');
  } catch {
    toast('Could not copy to the clipboard. Select the text and copy it with Ctrl+C.', 'error');
  }
}

const SOON = [
  { name: 'GitHub', hint: 'Import and push private repositories.' },
  { name: 'Figma', hint: 'Pull frames and styles from a Figma file.' },
  { name: 'Slack', hint: 'Share designs and get review comments in a channel.' },
];

function ConnectionsSettings() {
  return (
    <>
      <McpSettings />
      <SettingsGroup title="More connections">
        {SOON.map(({ name, hint }) => (
          <SettingRow key={name} label={<span className="sx-status">{name}<span className="sx-tag">Soon</span></span>} hint={hint} />
        ))}
      </SettingsGroup>
    </>
  );
}

const PREF_PREFIX = 'oc.';
const prefKeys = () => {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREF_PREFIX));
  } catch {
    return [];
  }
};

function AccountSettings() {
  const name = useDisplayName();
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = window.setTimeout(() => setSure(false), 5000);
    return () => window.clearTimeout(t);
  }, [sure]);

  const exportPrefs = () => {
    const data: Record<string, string | null> = {};
    for (const k of prefKeys()) data[k] = localStorage.getItem(k);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'open-canvas-preferences.json' });
    a.click();
    URL.revokeObjectURL(url);
  };
  const reset = () => {
    for (const k of prefKeys()) localStorage.removeItem(k);
    window.location.reload();
  };

  return (
    <>
      <SettingsGroup title="Profile">
        <SettingRow label="Photo" hint="Shown on the canvas and in chat.">
          <img src={USER_AVATAR_SRC} alt="" width={40} height={40} className="sx-avatar" draggable={false} referrerPolicy="no-referrer" />
        </SettingRow>
        <SettingRow label="Name" hint="Used in the greeting on the home page.">
          <InputShell>
            <input aria-label="Your name" value={name} maxLength={40} placeholder="Optional" onChange={(e) => setDisplayName(e.target.value)} />
          </InputShell>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Your data" hint="Preferences such as your name, theme, learning curve and page icons are kept on this device. Your projects stay in their own folders and are never touched here.">
        <SettingRow label="Export preferences" hint="Download them as a JSON file.">
          <Button size="sm" onClick={exportPrefs}>Export</Button>
        </SettingRow>
        <SettingRow label="Reset everything" hint="Clears all preferences and starts fresh. Projects are not deleted.">
          {sure ? (
            <div className="sx-inline">
              <Button size="sm" variant="ghost" onClick={() => setSure(false)}>Cancel</Button>
              <Button size="sm" variant="danger" onClick={reset}>Yes, reset</Button>
            </div>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setSure(true)}>Reset</Button>
          )}
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

function McpSettings() {
  const status = useStore((s) => s.mcp);
  const [port, setPort] = useState('');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => setPort(status ? String(status.port) : ''), [status?.port]);

  const update = (fn: () => Promise<McpStatus>) =>
    fn().then(
      (next) => setState({ mcp: next }),
      (err) => toast(errorText(err), 'error'),
    );

  if (!status) return <Notice>Loading…</Notice>;
  const running = status.running;

  return (
    <>
      <SettingsGroup title={status.enabled ? 'Server' : undefined} hint={status.enabled ? undefined : 'Lets AI agents such as Cursor and Claude Code read and edit the project you have open, over MCP. Turn it on to get a connection address and one-click setup.'}>
        <SettingRow
          label={
            <span className="sx-status">
              {status.enabled && <span className={`mcp-dot ${running ? 'is-on' : 'is-error'}`} aria-hidden />}
              Enabled
              {status.enabled && <span className="sx-tag">{running ? 'On' : 'Starting…'}</span>}
            </span>
          }
        >
          <Switch label="Enable MCP server" checked={status.enabled} onChange={(on) => void update(() => api.mcp.setEnabled(on))} />
        </SettingRow>
        {status.enabled && !running && (
          <SettingRow label="Not running" hint={status.error ?? 'Starting…'} />
        )}
        {status.enabled && running && (
          <SettingRow label="Address">
            <div className="sx-inline">
              <code className="sx-code">{status.url}</code>
              <Button size="sm" variant="ghost" icon={<Copy size={13} />} aria-label="Copy URL" onClick={() => void copy(status.url, 'URL')} />
            </div>
          </SettingRow>
        )}
        {status.enabled && (
          <SettingRow label="Port">
            <form
              className="sx-inline"
              onSubmit={(e) => {
                e.preventDefault();
                const value = Number(port);
                if (value !== status.port) void update(() => api.mcp.setPort(value));
              }}
            >
              <InputShell>
                <input aria-label="Port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} />
              </InputShell>
              <Button size="sm" type="submit" disabled={Number(port) === status.port}>
                Apply
              </Button>
            </form>
          </SettingRow>
        )}
      </SettingsGroup>

      {status.enabled && running && (
        <>
          <SettingsGroup title="Connect an agent">
            <SettingRow label="Cursor">
              <Button size="sm" variant="primary" icon={<Plug size={13} />} onClick={() => void api.mcp.installCursor().catch((err) => toast(errorText(err), 'error'))}>
                Add to Cursor
              </Button>
            </SettingRow>
            <SettingRow label="Other editors">
              <Button size="sm" icon={<Copy size={13} />} onClick={() => void copy(cursorConfig(status), 'mcp.json config')}>
                Copy mcp.json
              </Button>
            </SettingRow>
            <SettingRow label="Claude Code">
              <Button size="sm" icon={<Copy size={13} />} onClick={() => void copy(claudeCommand(status), 'Claude Code command')}>
                Copy command
              </Button>
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Access">
            <SettingRow label="Access token">
              <div className="sx-inline">
                <KeyRound size={14} aria-hidden />
                <code className="sx-code">{showToken ? status.token : '•'.repeat(16)}</code>
                <Button size="sm" variant="ghost" onClick={() => setShowToken((v) => !v)}>
                  {showToken ? 'Hide' : 'Show'}
                </Button>
                <Button size="sm" variant="ghost" icon={<Copy size={13} />} aria-label="Copy token" onClick={() => void copy(status.token, 'token')} />
              </div>
            </SettingRow>
            <SettingRow label="New token">
              <Button size="sm" icon={<RefreshCw size={13} />} onClick={() => void update(() => api.mcp.regenerateToken())}>
                Generate
              </Button>
            </SettingRow>
            <SettingRow label="Activity" hint={status.calls === 0 ? undefined : `${plural(status.calls, 'tool call', 'tool calls')}. Last: ${status.lastTool} ${ago(status.lastAt)}.`} />
          </SettingsGroup>
        </>
      )}
    </>
  );
}
