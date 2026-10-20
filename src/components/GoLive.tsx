import { Check, ExternalLink, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { GitStatus } from '../../shared/types';
import { refreshTree, syncBuffersFromDisk } from '../lib/actions';
import { api } from '../lib/api';
import { hasUnsaved, useStore } from '../lib/store';
import { Dialog } from '../ui/Overlays.jsx';
import { Button, Spinner } from '../ui/primitives.jsx';
import { GithubMark } from '../ui/StartScreen.jsx';
import { errorText, IdentityForm } from './GitMenu';

type StepId = 'save' | 'github' | 'vercel';
type StepState = 'idle' | 'running' | 'done' | 'error' | 'prompt';
type Steps = Record<StepId, { state: StepState; detail?: ReactNode }>;

const IDLE: Steps = { save: { state: 'idle' }, github: { state: 'idle' }, vercel: { state: 'idle' } };
const liveKey = (root: string) => `oc-live:${root}`;
const publishedKey = (root: string) => `oc-published:${root}`;
const repoSlug = (remote: string | null) => remote?.replace(/^https:\/\/github\.com\/|^git@github\.com:/, '').replace(/\.git$/, '') ?? null;
const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

function VercelMark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2 24 22H0z" />
    </svg>
  );
}

export function GoLiveButton() {
  const project = useStore((s) => s.project)!;
  const [open, setOpen] = useState(false);
  const [published, setPublished] = useState(
    () => localStorage.getItem(publishedKey(project.root)) === 'true' || !!localStorage.getItem(liveKey(project.root)),
  );

  return (
    <div className="publish-action">
      <Button variant="primary" aria-label={published ? 'Update' : 'Publish'} onClick={() => setOpen(true)}>
        {published ? 'Update' : 'Publish'}
      </Button>
      {open && (
        <GoLiveDialog
          onClose={() => setOpen(false)}
          onPublished={() => {
            localStorage.setItem(publishedKey(project.root), 'true');
            setPublished(true);
          }}
        />
      )}
    </div>
  );
}

function GoLiveDialog({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const project = useStore((s) => s.project)!;
  const unsaved = useStore((s) => hasUnsaved(s));
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [steps, setSteps] = useState<Steps>(IDLE);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [repoName, setRepoName] = useState(project.name.replace(/\s+/g, '-').toLowerCase());
  const [isPrivate, setPrivate] = useState(true);
  const [published, setPublished] = useState(
    () => localStorage.getItem(publishedKey(project.root)) === 'true' || !!localStorage.getItem(liveKey(project.root)),
  );
  const [importUrl, setImportUrl] = useState<string | null>(null);
  const [visitedVercel, setVisitedVercel] = useState(false);
  const [live, setLive] = useState<string | null>(() => localStorage.getItem(liveKey(project.root)));

  const refresh = () => api.git.status().then(setStatus, () => setStatus(null));
  useEffect(() => {
    void refresh();
  }, []);

  const set = (id: StepId, state: StepState, detail?: ReactNode) => setSteps((s) => ({ ...s, [id]: { state, detail } }));

  const run = async () => {
    setRunning(true);
    setSteps(IDLE);
    setImportUrl(null);
    let step: StepId = 'save';
    try {
      set('save', 'running', 'Saving your latest edits…');
      let s = await api.git.status();
      if (!s.repo) {
        await api.git.init();
        s = await api.git.status();
      }
      if (s.files.length) {
        const text = message.trim() || 'Update site';
        await api.git.commit(text);
        set('save', 'done', `Saved “${text}”`);
        setMessage('');
      } else {
        set('save', 'done', s.lastCommit ? 'Everything was already saved' : 'Nothing to publish yet');
        if (!s.lastCommit) throw new Error('This project has no files to publish yet.');
      }

      step = 'github';
      s = await api.git.status();
      if (!s.remote) {
        set('github', 'running', 'Creating your GitHub repository…');
        await api.git.createRepo(repoName, isPrivate);
      }
      set('github', 'running', 'Pushing to GitHub…');
      await api.git.push();
      s = await api.git.status();
      setStatus(s);
      set('github', 'done', repoSlug(s.remote) ?? 'Pushed');

      step = 'vercel';
      set('vercel', 'running', 'Vercel is building your site…');
      const result = await api.publish.vercel();
      if (result.status === 'live') {
        setPublished(true);
        onPublished();
        if (result.url) {
          localStorage.setItem(liveKey(project.root), result.url);
          setLive(result.url);
        }
        set('vercel', 'done', result.url ? hostOf(result.url) : 'Deployed');
      } else {
        setImportUrl(result.importUrl);
        set('vercel', 'prompt');
      }
    } catch (err) {
      set(step, 'error', errorText(err));
    } finally {
      setRunning(false);
      void syncBuffersFromDisk();
      void refreshTree();
    }
  };

  const remote = repoSlug(status?.remote ?? null);
  const needsIdentity = status && status.installed && !status.identity;
  const actionLabel = published ? 'Update' : 'Publish';

  return (
    <Dialog
      title={actionLabel}
      className="dialog start-dialog golive"
      onClose={running ? undefined : onClose}
      onKeyDown={(e: { key: string }) => e.key === 'Escape' && !running && onClose()}
    >
      <p className="start-dialog__lead">{actionLabel} {project.name} in three steps. After this, every push updates the live site.</p>

      {status && !status.installed ? (
        <p className="golive__note golive__note--warn">Git isn’t installed. Install it from git-scm.com, then restart OpenCanvas.</p>
      ) : needsIdentity ? (
        <IdentityForm onDone={() => void refresh()} />
      ) : (
        <ol className="golive-steps">
          <Step n={1} title="Save changes" state={steps.save.state} detail={steps.save.detail ?? 'Commits your latest edits'}>
            {steps.save.state === 'idle' && (
              <input className="start-dialog__input" aria-label="What changed" placeholder="What changed? (optional)" value={message} disabled={running} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !running && void run()} />
            )}
          </Step>
          <Step
            n={2}
            title="Push to GitHub"
            icon={<GithubMark size={12} />}
            state={steps.github.state}
            detail={steps.github.detail ?? (remote ? remote : 'Creates a repository on your GitHub account')}
          >
            {steps.github.state === 'idle' && status && !status.remote && (
              <div className="golive__repo">
                <input className="start-dialog__input" aria-label="Repository name" value={repoName} disabled={running} onChange={(e) => setRepoName(e.target.value)} />
                <label className="git-check">
                  <input type="checkbox" checked={isPrivate} disabled={running} onChange={(e) => setPrivate(e.target.checked)} /> Private
                </label>
              </div>
            )}
          </Step>
          <Step n={3} title="Live on Vercel" icon={<VercelMark />} state={steps.vercel.state} detail={steps.vercel.detail ?? 'Vercel builds and hosts your site'} last>
            {steps.vercel.state === 'done' && live && (
              <button className="golive__live" onClick={() => void api.publish.open(live)}>
                <span className="golive__pulse" />
                {hostOf(live)}
                <ExternalLink size={12} />
              </button>
            )}
            {steps.vercel.state === 'prompt' && importUrl && (
              <div className="golive__prompt" role="alertdialog" aria-label="Go to Vercel">
                <strong>Would you like to go to Vercel so it can become live?</strong>
                <p>Your site is safely on GitHub. Vercel hosts it for free: sign in with GitHub, press Deploy, and every future push goes live automatically.</p>
                <div className="golive__prompt-actions">
                  <Button
                    variant="primary"
                    icon={<VercelMark />}
                    onClick={() => {
                      setVisitedVercel(true);
                      void api.publish.open(importUrl);
                    }}
                  >
                    Go to Vercel
                  </Button>
                  <Button variant="ghost" onClick={onClose}>
                    Not now
                  </Button>
                </div>
                {visitedVercel && <p className="golive__note">When Vercel shows your site, press Go live again and OpenCanvas will pick up the link.</p>}
              </div>
            )}
          </Step>
        </ol>
      )}

      {!needsIdentity && status?.installed !== false && (
        <div className="start-dialog__foot">
          <span className="start-dialog__where">
            {unsaved ? 'Some open files have unsaved edits. Save them (Ctrl+S) to include them.' : live && steps.vercel.state !== 'done' ? `Live at ${hostOf(live)}` : ''}
          </span>
          <Button className="golive__publish-button" variant="primary" disabled={running || !status} onClick={() => void run()}>
            {running ? `${actionLabel === 'Update' ? 'Updating' : 'Publishing'}…` : steps.vercel.state === 'done' || steps.vercel.state === 'prompt' ? `${actionLabel} again` : actionLabel}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function Step({ n, title, icon, state, detail, last, children }: { n: number; title: string; icon?: ReactNode; state: StepState; detail: ReactNode; last?: boolean; children?: ReactNode }) {
  return (
    <li className={`golive-step is-${state}${last ? ' is-last' : ''}`}>
      <span className="golive-step__marker" aria-hidden="true">
        {state === 'running' ? <Spinner /> : state === 'done' ? <Check size={13} strokeWidth={3} /> : state === 'error' ? <TriangleAlert size={13} /> : n}
      </span>
      <div className="golive-step__body">
        <div className="golive-step__title">
          {title}
          {icon && <span className="golive-step__icon">{icon}</span>}
        </div>
        <div className="golive-step__detail">{detail}</div>
        {children}
      </div>
    </li>
  );
}
