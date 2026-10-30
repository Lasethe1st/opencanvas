import { Copy, Keyboard, KeyRound, Monitor, Moon, Palette, Plug, RefreshCw, Settings as SettingsIcon, SlidersHorizontal, Sparkles, Sun, Type, X } from '../lib/hugeicons';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { McpStatus, ThemePreference } from '../../shared/types';
import { api } from '../lib/api';
import { plural } from '../lib/plural';
import { setState, toast, useStore, type SettingsTab } from '../lib/store';
import { AiSettingsPanel } from './settings/AiSettings';
import { SettingRow, SettingsGroup, Switch } from './settings/parts';
import { CHAT_BUBBLE_PRESETS, setChatBubblePreset, useChatBubblePreset } from '../lib/chat-bubble';
import { CHAT_FONT_SIZE_PRESETS, setChatFontSize, useChatFontSize } from '../lib/chat-font-size';
import { getOrbColors, ORB_COLOR_PRESETS, setOrbColorPreset, useOrbColorPreset } from '../lib/orb-colors';
import { setThemePreference, useTheme } from '../lib/theme';
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

const TABS: { id: SettingsTab; label: string; icon: typeof Sun; lead: string | null }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal, lead: 'Everyday preferences for the home chat.' },
  { id: 'appearance', label: 'Appearance', icon: Palette, lead: 'Theme and colors.' },
  { id: 'ai', label: 'AI', icon: Sparkles, lead: 'The model that answers in chat and on the canvas, and how it sounds.' },
  { id: 'mcp', label: 'MCP server', icon: Plug, lead: 'Connect AI agents to the project you have open.' },
];

export function SettingsPage() {
  const open = useStore((s) => s.settingsOpen);
  const tab = useStore((s) => s.settingsTab);
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
  const current = TABS.find((t) => t.id === tab)!;
  // Portaled to <body>: the workspace restyles its direct children, which pushed this page off to the side.
  return createPortal(
    <TooltipProvider>
      <div className="settings-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
        <section ref={dialog} className="settings-page" role="dialog" aria-modal="true" aria-label="Settings">
          <nav className="settings-page__nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
            <h1 className="settings-page__title">Settings</h1>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`settings-page__tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
                <Icon size={16} />
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
                {current.lead ? <p className="settings-page__lead">{current.lead}</p> : null}
              </div>
              <button className="settings-page__close" aria-label="Close settings" onClick={close}>
                <X size={16} />
              </button>
            </header>
            <div className="settings-page__inner">
              {tab === 'general' ? (
                <GeneralSettings />
              ) : tab === 'appearance' ? (
                <AppearanceSettings />
              ) : tab === 'ai' ? (
                <AiSettingsPanel />
              ) : (
                <McpSettings />
              )}
            </div>
          </div>
        </section>
      </div>
    </TooltipProvider>,
    document.body,
  );
}

function GeneralSettings() {
  const fontSize = useChatFontSize();
  return (
    <SettingsGroup title="Chat">
      <SettingRow label="Message size" hint="How large messages look in the home chat and the canvas AI panel.">
        <div className="theme-toggle" role="radiogroup" aria-label="Chat font size">
          {CHAT_FONT_SIZE_PRESETS.map(({ id, label }) => (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <button type="button" role="radio" aria-checked={fontSize === id} aria-label={label} className={`theme-toggle__btn${fontSize === id ? ' is-active' : ''}`} onClick={() => setChatFontSize(id)}>
                  <Type size={id === 'small' ? 13 : id === 'large' ? 17 : 15} strokeWidth={1.75} aria-hidden />
                  <span>{label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </SettingRow>
    </SettingsGroup>
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
  return (
    <>
      <SettingsGroup title="Theme">
        <SettingRow label="Color mode" hint="System follows your computer’s light or dark setting.">
          <div className="theme-toggle" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" role="radio" aria-checked={preference === id} className={`theme-toggle__btn${preference === id ? ' is-active' : ''}`} onClick={() => setThemePreference(id)}>
                <Icon size={15} strokeWidth={1.75} aria-hidden />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Chat">
        <SettingRow label="Your messages" hint="Bubble color for what you write.">
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
        <SettingRow label="Voice orb" hint="The orb you see while talking to the AI.">
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
      <SettingsGroup title="Server" hint="The server only accepts connections from this computer that present the access token.">
        <SettingRow
          label={
            <span className="sx-status">
              {status.enabled && <span className={`mcp-dot ${running ? 'is-on' : 'is-error'}`} aria-hidden />}
              {status.enabled ? (running ? 'Server on' : 'Starting…') : 'Server off'}
            </span>
          }
          hint="Lets AI agents such as Cursor or Claude inspect and edit the open project. Their edits show up live and can be undone like your own."
        >
          <Switch label="Enable MCP server" checked={status.enabled} onChange={(on) => void update(() => api.mcp.setEnabled(on))} />
        </SettingRow>
        {status.enabled && !running && (
          <SettingRow label="Not running" hint={status.error ?? 'Starting…'} />
        )}
        {status.enabled && running && (
          <SettingRow label="Address" hint="Agents connect here.">
            <div className="sx-inline">
              <code className="sx-code">{status.url}</code>
              <Button size="sm" variant="ghost" icon={<Copy size={13} />} aria-label="Copy URL" onClick={() => void copy(status.url, 'URL')} />
            </div>
          </SettingRow>
        )}
        {status.enabled && (
          <SettingRow label="Port" hint="Change if another app already uses it.">
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
            <SettingRow label="Cursor" hint="Adds OpenCanvas to Cursor’s MCP servers.">
              <Button size="sm" variant="primary" icon={<Plug size={13} />} onClick={() => void api.mcp.installCursor().catch((err) => toast(errorText(err), 'error'))}>
                Add to Cursor
              </Button>
            </SettingRow>
            <SettingRow label="Other editors" hint="Paste this into an mcp.json file.">
              <Button size="sm" icon={<Copy size={13} />} onClick={() => void copy(cursorConfig(status), 'mcp.json config')}>
                Copy mcp.json
              </Button>
            </SettingRow>
            <SettingRow label="Claude Code" hint="Run this in a terminal.">
              <Button size="sm" icon={<Copy size={13} />} onClick={() => void copy(claudeCommand(status), 'Claude Code command')}>
                Copy command
              </Button>
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Access">
            <SettingRow label="Access token" hint="Treat it like a password.">
              <div className="sx-inline">
                <KeyRound size={14} aria-hidden />
                <code className="sx-code">{showToken ? status.token : '•'.repeat(16)}</code>
                <Button size="sm" variant="ghost" onClick={() => setShowToken((v) => !v)}>
                  {showToken ? 'Hide' : 'Show'}
                </Button>
                <Button size="sm" variant="ghost" icon={<Copy size={13} />} aria-label="Copy token" onClick={() => void copy(status.token, 'token')} />
              </div>
            </SettingRow>
            <SettingRow label="New token" hint="Disconnects every agent that’s using the current one.">
              <Button size="sm" icon={<RefreshCw size={13} />} onClick={() => void update(() => api.mcp.regenerateToken())}>
                Generate
              </Button>
            </SettingRow>
            <SettingRow label="Activity" hint={status.calls === 0 ? 'No agent has called a tool yet.' : `${plural(status.calls, 'tool call', 'tool calls')}. Last: ${status.lastTool} ${ago(status.lastAt)}.`} />
          </SettingsGroup>
        </>
      )}
    </>
  );
}
