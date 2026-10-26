import { ArrowDown, ArrowUp, CloudUpload, ExternalLink, GitBranch, GitCommitHorizontal, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GitFileState, GitStatus } from '../../shared/types';
import { refreshTree, syncBuffersFromDisk } from '../lib/actions';
import { api } from '../lib/api';
import { plural } from '../lib/plural';
import { hasUnsaved, setState, toast, useStore } from '../lib/store';
import { Panel, PanelTitle } from '../ui/Panels.jsx';
import { Button, IconButton, InputShell, Notice, Spinner } from '../ui/primitives.jsx';
import { ToolButton } from '../ui/ToolRail.jsx';
import { Resizer } from './Resizer';

const STATE_LETTER: Record<GitFileState, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflict: '!',
};

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

async function refreshGit() {
  let gitStatus: GitStatus | null = null;
  try {
    gitStatus = await api.git.status();
  } catch {
    gitStatus = null;
  }
  setState({ gitStatus });
}

/** Keeps the shared git status fresh while a project is open. */
function useGitStatusSync() {
  const project = useStore((s) => s.project);
  useEffect(() => {
    if (!project) return;
    void refreshGit();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = api.onFilesChanged(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshGit(), 1200);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [project?.root]);
}

export function IdentityForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  return (
    <form
      className="git-form"
      onSubmit={(e) => {
        e.preventDefault();
        api.git.setIdentity(name, email).then(onDone, (err) => toast(errorText(err), 'error'));
      }}
    >
      <p className="git-note">Commits are signed with a name and email. Use the email on your GitHub account.</p>
      <InputShell>
        <input aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      </InputShell>
      <InputShell>
        <input aria-label="Email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </InputShell>
      <Button type="submit" size="sm" variant="primary" disabled={!name.trim() || !email.trim()}>
        Save identity
      </Button>
    </form>
  );
}

function ConnectForm({ defaultName, hasCommits, run }: { defaultName: string; hasCommits: boolean; run: (label: string, fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [tab, setTab] = useState<'create' | 'url'>('create');
  const [name, setName] = useState(defaultName);
  const [isPrivate, setPrivate] = useState(true);
  const [url, setUrl] = useState('');
  return (
    <div className="git-form">
      <div className="git-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'is-active' : ''} onClick={() => setTab('create')}>
          New repository
        </button>
        <button role="tab" aria-selected={tab === 'url'} className={tab === 'url' ? 'is-active' : ''} onClick={() => setTab('url')}>
          Existing URL
        </button>
      </div>
      {tab === 'create' ? (
        <>
          <InputShell prefix="Name">
            <input aria-label="Repository name" value={name} onChange={(e) => setName(e.target.value)} />
          </InputShell>
          <label className="git-check">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} /> Private repository
          </label>
          <Button
            size="sm"
            variant="primary"
            icon={<CloudUpload size={13} />}
            disabled={!name.trim()}
            onClick={() =>
              void run('Created repository on GitHub', async () => {
                await api.git.createRepo(name, isPrivate);
                if (hasCommits) await api.git.push();
              })
            }
          >
            {hasCommits ? 'Create on GitHub and push' : 'Create on GitHub'}
          </Button>
          <p className="git-note">You’ll be asked to sign in to GitHub the first time.</p>
        </>
      ) : (
        <>
          <InputShell>
            <input aria-label="Repository URL" placeholder="https://github.com/you/site.git or you/site" value={url} onChange={(e) => setUrl(e.target.value)} />
          </InputShell>
          <Button size="sm" variant="primary" disabled={!url.trim()} onClick={() => void run('Connected repository', () => api.git.setRemote(url))}>
            Connect
          </Button>
        </>
      )}
    </div>
  );
}

export function GitMenu() {
  const status = useStore((s) => s.gitStatus);
  const open = useStore((s) => s.gitOpen);
  useGitStatusSync();
  const changes = status?.files.length ?? 0;
  const label = !status ? 'Git' : !status.installed ? 'Git' : !status.repo ? 'Set up Git' : (status.branch ?? 'detached');

  return (
    <ToolButton
      label="Source control"
      shortcut={[label, changes > 0 && plural(changes, 'change', 'changes'), status?.ahead && `${status.ahead} to push`].filter(Boolean).join(' · ')}
      active={open}
      onClick={() => setState({ gitOpen: !open, insertPanel: null })}
      aria-expanded={open}
    >
      <GitBranch size={15} />
      {status?.repo && changes > 0 && <span className="git-badge">{changes > 99 ? '99+' : changes}</span>}
    </ToolButton>
  );
}

export function GitPanel() {
  const project = useStore((s) => s.project)!;
  const unsaved = useStore((s) => hasUnsaved(s));
  const status = useStore((s) => s.gitStatus);
  const width = useStore((s) => s.leftWidth);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const refresh = refreshGit;

  useEffect(() => {
    void refreshGit();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy || document.querySelector('.dialog-backdrop, .settings-page')) return;
      setState({ gitOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      toast(label, 'success');
      return true;
    } catch (err) {
      toast(errorText(err), 'error');
      return false;
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const commit = async (andPush: boolean) => {
    const ok = await run(andPush ? 'Committed and pushed' : 'Committed', async () => {
      await api.git.commit(message);
      if (andPush) await api.git.push();
    });
    if (ok) setMessage('');
  };

  const pull = () =>
    run('Pulled latest changes', async () => {
      await api.git.pull();
      await refreshTree();
      await syncBuffersFromDisk();
    });

  const changes = status?.files.length ?? 0;

  return (
    <Panel
      side="left"
      width={width}
      className="panel panel--left git-panel"
      aria-label="Source control"
      head={
        <>
          <PanelTitle>Source control</PanelTitle>
          {busy ? (
            <Spinner />
          ) : (
            <IconButton size="sm" label="Refresh" onClick={() => void refresh()}>
              <RefreshCw size={13} />
            </IconButton>
          )}
          <IconButton size="sm" label="Close" disabled={!!busy} onClick={() => setState({ gitOpen: false })}>
            <X size={14} />
          </IconButton>
        </>
      }
      resizer={<Resizer value={width} min={200} max={460} onChange={(v) => setState({ leftWidth: v })} />}
    >
      <div className="git-panel__body">
        {busy && (
          <div className="git-busy">
            {busy.replace(
              /^(Created|Connected|Committed|Pulled)/,
              (w) =>
                ({
                  Created: 'Creating',
                  Connected: 'Connecting',
                  Committed: 'Committing',
                  Pulled: 'Pulling',
                })[w]!,
            )}
            …
          </div>
        )}

        {!status ? (
          <div className="git-note">Reading repository…</div>
        ) : !status.installed ? (
          <Notice>Git isn’t installed. Install it from git-scm.com, then restart OpenCanvas.</Notice>
        ) : !status.repo ? (
          <div className="git-form">
            <p className="git-note">This project isn’t tracked by Git yet. Initialize a repository to commit changes and push them to GitHub.</p>
            <Button size="sm" variant="primary" disabled={!!busy} onClick={() => void run('Initialized Git repository', () => api.git.init())}>
              Initialize repository
            </Button>
          </div>
        ) : (
          <>
            {status.parentRepo && (
              <div className="git-form">
                <p className="git-note">This folder is part of the repository at {status.parentRepo}. Commits here include only this project folder.</p>
                <Button size="sm" disabled={!!busy} onClick={() => void run('Created a separate repository', () => api.git.init())}>
                  Use a separate repository for this project
                </Button>
              </div>
            )}
            <div className="git-row">
              <GitBranch size={13} />
              <span className="git-row__main">{status.branch ?? 'detached HEAD'}</span>
              {status.remote && (
                <button className="git-link" onClick={() => void api.git.openRemote()} title={status.remote}>
                  {status.remote.replace(/^https:\/\/|^git@/, '').replace(/\.git$/, '')}
                  <ExternalLink size={11} />
                </button>
              )}
            </div>
            {status.lastCommit && (
              <div className="git-row git-row--muted">
                <GitCommitHorizontal size={13} />
                <span className="git-row__main">{status.lastCommit.message}</span>
                <span>{status.lastCommit.when}</span>
              </div>
            )}

            {!status.identity ? (
              <IdentityForm onDone={() => void refresh()} />
            ) : (
              <>
                <div className="git-section">
                  Changes <span className="git-section__count">{changes}</span>
                </div>
                {changes === 0 ? (
                  <p className="git-note">No changes since the last commit.</p>
                ) : (
                  <ul className="git-files">
                    {status.files.slice(0, 50).map((f) => {
                      const trimmed = f.path.replace(/\/$/, '');
                      const cut = trimmed.lastIndexOf('/');
                      return (
                        <li key={f.path} title={f.path}>
                          <span className="git-files__path">
                            {trimmed.slice(cut + 1)}
                            {f.path.endsWith('/') && '/'}
                            {cut > 0 && <span className="git-files__dir">{trimmed.slice(0, cut)}</span>}
                          </span>
                          <span className={`git-files__state is-${f.state}`}>{STATE_LETTER[f.state]}</span>
                        </li>
                      );
                    })}
                    {changes > 50 && <li className="git-note">and {changes - 50} more</li>}
                  </ul>
                )}
                {unsaved && <p className="git-note git-note--warn">Some open files have unsaved edits. Save them (Ctrl+S) to include them.</p>}
                <textarea
                  className="textarea git-message"
                  aria-label="Commit message"
                  placeholder="Describe your changes"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && message.trim() && changes) void commit(!!status.remote);
                  }}
                />
                <div className="git-actions">
                  <Button size="sm" disabled={!!busy || !message.trim() || !changes} onClick={() => void commit(false)}>
                    Commit
                  </Button>
                  {status.remote && (
                    <Button size="sm" variant="primary" disabled={!!busy || !message.trim() || !changes} onClick={() => void commit(true)}>
                      Commit & push
                    </Button>
                  )}
                </div>
              </>
            )}

            {status.remote ? (
              <div className="git-actions git-actions--sync">
                <Button size="sm" icon={<ArrowDown size={13} />} disabled={!!busy} onClick={() => void pull()}>
                  Pull{status.behind ? ` ${status.behind}` : ''}
                </Button>
                <Button size="sm" icon={<ArrowUp size={13} />} disabled={!!busy || !status.lastCommit} onClick={() => void run('Pushed to GitHub', () => api.git.push())}>
                  Push
                  {status.ahead ? ` ${status.ahead}` : status.upstream ? '' : ' branch'}
                </Button>
              </div>
            ) : (
              <>
                <div className="git-section">Connect to GitHub</div>
                <ConnectForm defaultName={project.name.replace(/\s+/g, '-').toLowerCase()} hasCommits={!!status.lastCommit} run={run} />
              </>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
