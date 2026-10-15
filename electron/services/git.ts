import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { GitFileState, GitStatus } from '../../shared/types';
import { ProjectError } from './project';

type RunOptions = { input?: string; timeout?: number; allowFail?: boolean };
type RunResult = { code: number; stdout: string; stderr: string };

export class GitMissingError extends ProjectError {
  constructor() {
    super('Git is not installed. Install it from https://git-scm.com/download and restart OpenCanvas.');
  }
}

/** Runs git without a shell. Credential prompts go through Git Credential Manager's own window, never a terminal. */
export function git(cwd: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new ProjectError(`git ${args[0]} timed out.`));
    }, options.timeout ?? 30_000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT' ? new GitMissingError() : err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const result = { code: code ?? 1, stdout, stderr };
      if (result.code !== 0 && !options.allowFail) reject(new ProjectError(friendlyError(args[0], stderr || stdout)));
      else resolve(result);
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

export function friendlyError(command: string, raw: string): string {
  const text = raw.trim();
  if (/Authentication failed|could not read Username|terminal prompts disabled|403|Permission denied \(publickey\)/i.test(text))
    return 'GitHub rejected the sign-in. Push again and complete the sign-in window, or check that you have access to this repository.';
  if (/\[rejected\]|fetch first|non-fast-forward/i.test(text)) return 'The remote has commits you don’t have yet. Pull first, then push again.';
  if (/Repository not found|does not appear to be a git repository/i.test(text)) return 'Repository not found. Check the URL and that your account can access it.';
  if (/Could not resolve host|unable to access/i.test(text)) return 'Could not reach the remote. Check your internet connection.';
  if (/Not possible to fast-forward|diverging branches|have diverged/i.test(text))
    return 'Your branch and the remote have both changed. Resolve this in a terminal (git pull --rebase), then come back.';
  if (/would be overwritten by merge/i.test(text)) return 'Pulling would overwrite uncommitted changes. Commit them first.';
  if (/CONFLICT/.test(text)) return 'Pull produced merge conflicts. Resolve them in the code view, then commit.';
  const line = text.split('\n').find((l) => /^(fatal|error):/.test(l)) ?? text.split('\n')[0] ?? '';
  return line.replace(/^(fatal|error):\s*/, '') || `git ${command} failed.`;
}

const STATE: Record<string, GitFileState> = { M: 'modified', T: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'added', U: 'conflict', '?': 'untracked' };

/** Parses `git status --porcelain=v1 -z --branch`. */
export function parseStatus(raw: string) {
  const parts = raw.split('\0');
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const files: GitStatus['files'] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    if (entry.startsWith('## ')) {
      const head = entry.slice(3);
      const fresh = /^(?:No commits yet|Initial commit) on (.+)$/.exec(head);
      if (fresh) branch = fresh[1];
      else if (!head.startsWith('HEAD (no branch)')) {
        const m = /^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/.exec(head);
        if (m) {
          branch = m[1];
          upstream = m[2] ?? null;
          ahead = Number(/ahead (\d+)/.exec(m[3] ?? '')?.[1] ?? 0);
          behind = Number(/behind (\d+)/.exec(m[3] ?? '')?.[1] ?? 0);
        }
      }
      continue;
    }
    const x = entry[0];
    const y = entry[1];
    const file = entry.slice(3);
    const code = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D') ? 'U' : x !== ' ' && x !== '?' ? x : y;
    files.push({ path: file, state: STATE[code] ?? 'modified' });
    if (x === 'R' || x === 'C') i++;
  }
  return { branch, upstream, ahead, behind, files };
}

async function configValue(root: string, key: string) {
  const r = await git(root, ['config', '--get', key], { allowFail: true });
  return r.code === 0 ? r.stdout.trim() : '';
}

export async function gitStatus(root: string): Promise<GitStatus> {
  const empty: GitStatus = { installed: true, repo: false, parentRepo: null, branch: null, remote: null, upstream: null, ahead: 0, behind: 0, files: [], lastCommit: null, identity: null };
  try {
    await git(root, ['--version']);
  } catch (err) {
    if (err instanceof GitMissingError) return { ...empty, installed: false };
    throw err;
  }
  const top = await git(root, ['rev-parse', '--show-toplevel'], { allowFail: true });
  const [name, email] = await Promise.all([configValue(root, 'user.name'), configValue(root, 'user.email')]);
  const identity = name && email ? { name, email } : null;
  if (top.code !== 0) return { ...empty, identity };
  const topLevel = path.resolve(top.stdout.trim());
  const parentRepo = topLevel.toLowerCase() === path.resolve(root).toLowerCase() ? null : topLevel;

  const [status, remote, log] = await Promise.all([
    git(root, ['status', '--porcelain=v1', '-z', '--branch', '--', '.']),
    git(root, ['remote', 'get-url', 'origin'], { allowFail: true }),
    git(root, ['log', '-1', '--format=%h%x00%s%x00%cr'], { allowFail: true }),
  ]);
  const parsed = parseStatus(status.stdout);
  const [hash, message, when] = log.code === 0 ? log.stdout.trim().split('\0') : [];
  return {
    ...empty,
    repo: true,
    parentRepo,
    ...parsed,
    files: parsed.files.slice(0, 500),
    remote: remote.code === 0 ? remote.stdout.trim() : null,
    lastCommit: hash ? { hash, message, when } : null,
    identity,
  };
}

export async function gitInit(root: string) {
  await git(root, ['init', '-b', 'main']);
  const ignore = path.join(root, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, 'node_modules\ndist\n.vite\n.DS_Store\n', 'utf8');
}

export async function gitSetIdentity(root: string, name: string, email: string) {
  if (!name.trim() || !/^[^\s@]+@[^\s@]+$/.test(email.trim())) throw new ProjectError('Enter a name and a valid email address.');
  await git(root, ['config', 'user.name', name.trim()]);
  await git(root, ['config', 'user.email', email.trim()]);
}

const REMOTE_URL = /^(https:\/\/[\w.-]+(:\d+)?\/[\w.~/-]+?(\.git)?\/?|git@[\w.-]+:[\w.~/-]+?(\.git)?|ssh:\/\/[\w.@-]+(:\d+)?\/[\w.~/-]+)$/;

/** Accepts `owner/repo` as GitHub shorthand. */
export function normalizeRemote(input: string): string {
  const value = input.trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) return `https://github.com/${value.replace(/\.git$/, '')}.git`;
  if (!REMOTE_URL.test(value)) throw new ProjectError('Enter a repository URL like https://github.com/you/site.git, or owner/repo.');
  return value;
}

export async function gitSetRemote(root: string, input: string) {
  const url = normalizeRemote(input);
  const existing = await git(root, ['remote', 'get-url', 'origin'], { allowFail: true });
  await git(root, existing.code === 0 ? ['remote', 'set-url', 'origin', url] : ['remote', 'add', 'origin', url]);
  return url;
}

/** Folder name for a clone, from the repository path. */
export function repoName(url: string): string {
  return /([^/:]+?)(?:\.git)?\/?$/.exec(url)?.[1] ?? 'repository';
}

/** Clones a repository (URL or owner/repo) into a new folder under `parent` and returns its path. */
export async function gitClone(parent: string, input: string, folderName: (name: string) => string) {
  const url = normalizeRemote(input);
  fs.mkdirSync(parent, { recursive: true });
  const target = folderName(repoName(url));
  try {
    await git(parent, ['clone', '--', url, target], { timeout: 600_000 });
  } catch (err) {
    fs.rmSync(target, { recursive: true, force: true });
    throw err;
  }
  return target;
}

export async function gitCommit(root: string, message: string) {
  if (!message.trim()) throw new ProjectError('Write a commit message first.');
  const status = await gitStatus(root);
  if (!status.identity) throw new ProjectError('Set your name and email before committing.');
  if (!status.files.length) throw new ProjectError('Nothing to commit — the project matches the last commit.');
  await git(root, ['add', '-A', '--', '.']);
  await git(root, ['commit', '-m', message.trim()]);
}

export async function gitPush(root: string) {
  const status = await gitStatus(root);
  if (!status.remote) throw new ProjectError('Connect a GitHub repository first.');
  if (!status.lastCommit) throw new ProjectError('Make a first commit before pushing.');
  const args = status.upstream ? ['push'] : ['push', '-u', 'origin', status.branch ?? 'HEAD'];
  await git(root, args, { timeout: 180_000 });
}

export async function gitPull(root: string) {
  const status = await gitStatus(root);
  if (!status.remote) throw new ProjectError('Connect a GitHub repository first.');
  if (status.upstream) await git(root, ['pull', '--ff-only'], { timeout: 180_000 });
  else await git(root, ['pull', '--ff-only', 'origin', status.branch ?? 'main'], { timeout: 180_000 });
}

/** Asks Git Credential Manager for the stored GitHub token (it opens its sign-in window if needed). */
export async function githubCredential(root: string) {
  const r = await git(root, ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', timeout: 180_000, allowFail: true });
  const fields = Object.fromEntries(r.stdout.split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (r.code !== 0 || !fields.password) throw new ProjectError('Could not sign in to GitHub. Create the repository on github.com and paste its URL instead.');
  return fields as { username: string; password: string; protocol: string; host: string };
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Creates a GitHub repository with the signed-in account and connects it as origin. */
export async function createGithubRepo(root: string, name: string, isPrivate: boolean, fetcher: Fetcher) {
  const repoName = name.trim().replace(/\s+/g, '-');
  if (!/^[\w.-]{1,100}$/.test(repoName)) throw new ProjectError('Repository names can use letters, numbers, dashes, dots and underscores.');
  const cred = await githubCredential(root);
  const credInput = `protocol=https\nhost=github.com\nusername=${cred.username}\npassword=${cred.password}\n\n`;
  const res = await fetcher('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cred.password}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'OpenCanvas' },
    body: JSON.stringify({ name: repoName, private: isPrivate, auto_init: false }),
  });
  const body = (await res.json().catch(() => ({}))) as { clone_url?: string; html_url?: string; message?: string; errors?: { message?: string }[] };
  if (res.status === 401) {
    await git(root, ['credential', 'reject'], { input: credInput, allowFail: true });
    throw new ProjectError('GitHub sign-in expired. Try again to sign in.');
  }
  if (!res.ok || !body.clone_url) {
    const detail = body.errors?.[0]?.message ?? body.message ?? `HTTP ${res.status}`;
    if (/already exists/i.test(detail)) throw new ProjectError(`You already have a repository named ${repoName}. Pick another name or connect it by URL.`);
    if (res.status === 403 || res.status === 404) throw new ProjectError('GitHub didn’t allow creating repositories with this sign-in. Create it on github.com and paste its URL.');
    throw new ProjectError(`GitHub: ${detail}`);
  }
  await git(root, ['credential', 'approve'], { input: credInput, allowFail: true });
  await gitSetRemote(root, body.clone_url);
  return { url: body.clone_url, htmlUrl: body.html_url ?? body.clone_url };
}

/** Browser URL for a remote, when it can be derived (GitHub, GitLab, Bitbucket style). */
export function remoteWebUrl(remote: string): string | null {
  const ssh = /^git@([\w.-]+):(.+?)(\.git)?$/.exec(remote);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  const https = /^https:\/\/([\w.-]+(?::\d+)?)\/(.+?)(\.git)?\/?$/.exec(remote);
  return https ? `https://${https[1]}/${https[2]}` : null;
}
