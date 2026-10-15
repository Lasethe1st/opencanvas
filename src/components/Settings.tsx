import { ArrowLeft, Copy, Keyboard, KeyRound, Monitor, Moon, Palette, Plug, RefreshCw, Settings as SettingsIcon, Sparkles, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { McpStatus, ThemePreference } from '../../shared/types';
import { api } from '../lib/api';
import { plural } from '../lib/plural';
import { setState, toast, useStore, type SettingsTab } from '../lib/store';
import { AiSettingsPanel } from './settings/AiSettings';
import { setThemePreference, useTheme } from '../lib/theme';
import { Button, InputShell, Notice } from '../ui/primitives.jsx';
import { ToolButton } from '../ui/ToolRail.jsx';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const mcpState = (s: McpStatus | null) => (!s?.enabled ? 'off' : s.running ? 'on' : 'error');

export function SettingsButton() {
  const status = useStore((s) => s.mcp);
  const open = useStore((s) => s.settingsOpen);
  const state = mcpState(status);
  return (
    <ToolButton label="Settings" active={open} onClick={() => setState({ settingsOpen: !open })}>
      <SettingsIcon size={16} />
      {state !== 'off' && <span className={`mcp-dot is-${state}`} aria-hidden />}
    </ToolButton>
  );
}

const TABS: { id: SettingsTab; label: string; icon: typeof Sun; lead: string }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette, lead: 'How OpenCanvas looks on this computer.' },
  { id: 'ai', label: 'AI', icon: Sparkles, lead: 'The model that answers in the dock’s Ask AI panel.' },
  { id: 'mcp', label: 'MCP server', icon: Plug, lead: 'Connect AI agents to the project you have open.' },
];

export function SettingsPage() {
  const open = useStore((s) => s.settingsOpen);
  const tab = useStore((s) => s.settingsTab);
  const setTab = (id: SettingsTab) => setState({ settingsTab: id });
  const close = () => setState({ settingsOpen: false });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.dialog-backdrop') && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const current = TABS.find((t) => t.id === tab)!;
  return (
    <section className="settings-page" aria-label="Settings">
      <nav className="settings-page__nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
        <button className="settings-page__back" onClick={close}>
          <ArrowLeft size={14} />
          Back to editor
        </button>
        <h1 className="settings-page__title">Settings</h1>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`settings-page__tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
            <Icon size={15} />
            {label}
          </button>
        ))}
        <button className="settings-page__tab" onClick={() => setState({ shortcutsOpen: true })}>
          <Keyboard size={15} />
          Keyboard shortcuts
        </button>
      </nav>
      <div className="settings-page__content" role="tabpanel" aria-label={current.label}>
        <div className="settings-page__inner">
          <h2>{current.label}</h2>
          <p className="settings-page__lead">{current.lead}</p>
          {tab === 'appearance' ? <AppearanceSettings /> : tab === 'ai' ? <AiSettingsPanel /> : <McpSettings />}
        </div>
      </div>
    </section>
  );
}

const THEMES: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

function AppearanceSettings() {
  const { preference } = useTheme();
  return (
    <>
      <div className="git-section">Theme</div>
      <div className="theme-options" role="radiogroup" aria-label="Theme">
        {THEMES.map(({ id, label, icon: Icon }) => (
          <button key={id} role="radio" aria-checked={preference === id} className={`theme-option${preference === id ? ' is-active' : ''}`} onClick={() => setThemePreference(id)}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <p className="git-note">System follows your Windows light or dark setting.</p>
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
    <div className="mcp-panel">
      <div className="git-panel__head">
        <strong>{status.enabled ? 'Server on' : 'Server off'}</strong>
        <label className="mcp-switch">
          <input type="checkbox" aria-label="Enable MCP server" checked={status.enabled} onChange={(e) => void update(() => api.mcp.setEnabled(e.target.checked))} />
          <span />
        </label>
      </div>
      <p className="git-note">
        Lets AI agents such as Cursor or Claude inspect and edit the open project: add elements, set styles, change text and take screenshots. Their edits show up live and can be undone like your own.
      </p>

      {!status.enabled ? (
        <Button size="sm" variant="primary" onClick={() => void update(() => api.mcp.setEnabled(true))}>
          Start server
        </Button>
      ) : !running ? (
        <Notice>{status.error ?? 'Starting…'}</Notice>
      ) : (
        <>
          <div className="git-row">
            <span className="mcp-dot is-on" aria-hidden />
            <span className="git-row__main mcp-url">{status.url}</span>
            <button className="git-link" onClick={() => void copy(status.url, 'URL')} title="Copy URL">
              <Copy size={11} />
            </button>
          </div>

          <div className="git-section">Connect an agent</div>
          <div className="mcp-actions">
            <Button size="sm" variant="primary" icon={<Plug size={13} />} onClick={() => void api.mcp.installCursor().catch((err) => toast(errorText(err), 'error'))}>
              Add to Cursor
            </Button>
            <Button size="sm" icon={<Copy size={13} />} onClick={() => void copy(cursorConfig(status), 'mcp.json config')}>
              Copy mcp.json
            </Button>
            <Button size="sm" icon={<Copy size={13} />} onClick={() => void copy(claudeCommand(status), 'Claude Code command')}>
              Claude Code
            </Button>
          </div>
          <p className="git-note">The server only accepts connections from this computer that present the access token below.</p>

          <div className="git-section">Access token</div>
          <div className="git-row">
            <KeyRound size={13} />
            <code className="git-row__main mcp-token">{showToken ? status.token : '•'.repeat(24)}</code>
            <button className="git-link" onClick={() => setShowToken((v) => !v)}>
              {showToken ? 'Hide' : 'Show'}
            </button>
            <button className="git-link" onClick={() => void copy(status.token, 'token')} title="Copy token">
              <Copy size={11} />
            </button>
          </div>
          <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={() => void update(() => api.mcp.regenerateToken())}>
            New token (disconnects agents)
          </Button>

          <div className="git-section">Activity</div>
          <p className="git-note">
            {status.calls === 0 ? 'No agent has called a tool yet.' : `${plural(status.calls, 'tool call', 'tool calls')}. Last: ${status.lastTool} ${ago(status.lastAt)}.`}
          </p>
        </>
      )}

      {status.enabled && (
        <form
          className="mcp-port"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(port);
            if (value !== status.port) void update(() => api.mcp.setPort(value));
          }}
        >
          <InputShell prefix="Port">
            <input aria-label="Port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} />
          </InputShell>
          <Button size="sm" type="submit" disabled={Number(port) === status.port}>
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}
