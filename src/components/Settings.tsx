import { useEffect, useState } from 'react';
import type { McpStatus, ThemePreference } from '../../shared/types';
import { api } from '../lib/api';
import { plural } from '../lib/plural';
import { setState, toast, useStore, type SettingsTab } from '../lib/store';
import { AiSettingsPanel } from './settings/AiSettings';
import { setThemePreference, useTheme } from '../lib/theme';
import { ToolButton } from '../ui/ToolRail.jsx';
import {
  AiGenerate,
  ColorPalette,
  Connect,
  Icon,
  Keyboard,
  Plug,
  Renew,
  Settings as SettingsIcon,
} from '@/components/lime/icon';
import { Button } from '@/components/lime/ui/button';
import { CopyButton } from '@/components/lime/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/lime/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/lime/ui/field';
import { Input } from '@/components/lime/ui/input';
import { List, ListIcon, ListItem } from '@/components/lime/ui/list';
import { Segmented, SegmentedItem } from '@/components/lime/ui/segmented';
import { Switch } from '@/components/lime/ui/switch';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const mcpState = (s: McpStatus | null) => (!s?.enabled ? 'off' : s.running ? 'on' : 'error');

export function SettingsButton() {
  const status = useStore((s) => s.mcp);
  const open = useStore((s) => s.settingsOpen);
  const state = mcpState(status);
  return (
    <ToolButton label="Settings" active={open} onClick={() => setState({ settingsOpen: !open })}>
      <SettingsIcon size={16} />
      {state === 'on' && <span className="mcp-dot is-on" aria-hidden />}
      {state === 'error' && <span className="mcp-dot is-error" aria-hidden />}
    </ToolButton>
  );
}

const TABS: { id: SettingsTab; label: string; lead: string; icon: typeof ColorPalette }[] = [
  { id: 'appearance', label: 'Appearance', lead: 'How OpenCanvas looks on this computer.', icon: ColorPalette },
  { id: 'ai', label: 'AI', lead: 'The model that answers in the dock’s Ask AI panel.', icon: AiGenerate },
  { id: 'mcp', label: 'MCP server', lead: 'Connect AI agents to the project you have open.', icon: Plug },
];

export function SettingsPage() {
  const open = useStore((s) => s.settingsOpen);
  const tab = useStore((s) => s.settingsTab);
  const setTab = (id: SettingsTab) => setState({ settingsTab: id });
  const close = () => setState({ settingsOpen: false });
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent size="lg" className="overflow-hidden p-0">
        <div className="flex min-h-0 flex-col sm:flex-row">
          <nav className="flex shrink-0 flex-col gap-2 border-b border-line p-4 sm:w-56 sm:border-e sm:border-b-0" aria-label="Settings sections">
            <DialogHeader className="pe-0">
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription className="sr-only">Appearance, AI and MCP server.</DialogDescription>
            </DialogHeader>
            <List variant="plain" className="-mx-2">
              {TABS.map(({ id, label, icon }) => (
                <ListItem
                  key={id}
                  leading={<ListIcon icon={icon} tone={tab === id ? 'accent' : 'neutral'} />}
                  title={label}
                  chevron={false}
                  onClick={() => setTab(id)}
                />
              ))}
              <ListItem
                leading={<ListIcon icon={Keyboard} />}
                title="Keyboard shortcuts"
                chevron={false}
                onClick={() => setState({ shortcutsOpen: true })}
              />
            </List>
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <section className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-fg">{current.label}</h2>
                <p className="text-sm text-fg-2">{current.lead}</p>
              </div>
              {tab === 'appearance' ? <AppearanceSettings /> : tab === 'ai' ? <AiSettingsPanel /> : <McpSettings />}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppearanceSettings() {
  const { preference } = useTheme();
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold text-fg">Theme</h3>
      <Segmented aria-label="Theme" value={preference} onValueChange={(v) => setThemePreference(v as ThemePreference)} fill>
        <SegmentedItem value="system">System</SegmentedItem>
        <SegmentedItem value="light">Light</SegmentedItem>
        <SegmentedItem value="dark">Dark</SegmentedItem>
      </Segmented>
      <p className="text-sm text-fg-2">System follows your Windows light or dark setting.</p>
    </section>
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

  if (!status) return <p className="text-sm text-fg-2">Loading…</p>;
  const running = status.running;

  return (
    <div className="flex flex-col gap-6">
      <List variant="grouped">
        <ListItem
          title="MCP server"
          description={status.enabled ? (running ? 'Server on' : status.error ?? 'Starting…') : 'Server off'}
          trailing={
            <Switch
              aria-label="MCP server"
              checked={status.enabled}
              onCheckedChange={(on) => void update(() => api.mcp.setEnabled(on))}
            />
          }
        />
      </List>
      <p className="text-sm text-fg-2">
        Lets AI agents such as Cursor or Claude inspect and edit the open project: add elements, set styles, change text and take screenshots. Their edits show up live and can be undone like your own.
      </p>

      {!status.enabled ? (
        <Button onClick={() => void update(() => api.mcp.setEnabled(true))}>Start server</Button>
      ) : !running ? (
        <p className="text-sm text-warn-text" role="status">
          {status.error ?? 'Starting…'}
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-fg">Server URL</h3>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-field bg-surface px-3 py-2 font-mono text-sm text-fg">{status.url}</code>
              <CopyButton value={status.url} label="Copy URL" />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-fg">Connect an agent</h3>
            <div className="flex flex-wrap gap-2">
              <Button icon={<Icon icon={Connect} size={16} />} onClick={() => void api.mcp.installCursor().catch((err) => toast(errorText(err), 'error'))}>
                Add to Cursor
              </Button>
              <Button variant="secondary" onClick={() => void copy(cursorConfig(status), 'mcp.json config')}>
                Copy mcp.json
              </Button>
              <Button variant="secondary" onClick={() => void copy(claudeCommand(status), 'Claude Code command')}>
                Claude Code
              </Button>
            </div>
            <p className="text-sm text-fg-2">The server only accepts connections from this computer that present the access token below.</p>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-fg">Access token</h3>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-field bg-surface px-3 py-2 font-mono text-sm text-fg">
                {showToken ? status.token : '•'.repeat(24)}
              </code>
              <Button variant="ghost" size="sm" onClick={() => setShowToken((v) => !v)}>
                {showToken ? 'Hide token' : 'Show token'}
              </Button>
              <CopyButton value={status.token} label="Copy token" />
            </div>
            <Button variant="ghost" icon={<Icon icon={Renew} size={16} />} onClick={() => void update(() => api.mcp.regenerateToken())}>
              New token (disconnects agents)
            </Button>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-fg">Activity</h3>
            <p className="text-sm text-fg-2">
              {status.calls === 0 ? 'No agent has called a tool yet.' : `${plural(status.calls, 'tool call', 'tool calls')}. Last: ${status.lastTool} ${ago(status.lastAt)}.`}
            </p>
          </section>
        </>
      )}

      {status.enabled && (
        <form
          className="flex max-w-sm flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(port);
            if (value !== status.port) void update(() => api.mcp.setPort(value));
          }}
        >
          <Field name="port">
            <FieldLabel>Port</FieldLabel>
            <Input inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} />
            <FieldDescription>Applies when you press Apply port.</FieldDescription>
          </Field>
          <Button type="submit" variant="secondary" disabled={Number(port) === status.port}>
            Apply port
          </Button>
        </form>
      )}
    </div>
  );
}
