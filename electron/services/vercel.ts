import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { GoLiveResult } from '../../shared/types';
import { git, githubCredential } from './git';
import { ProjectError } from './project';

type RunResult = { code: number; stdout: string; stderr: string };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const HOST = /^[\w.-]+$/;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs the Vercel CLI. Arguments are fixed or validated hostnames, so the Windows shell (needed for vercel.cmd) sees no user text. */
function vercel(cwd: string, args: string[], timeout = 60_000): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn('vercel', args, {
      cwd,
      windowsHide: true,
      shell: process.platform === 'win32',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end();
  });
}

/** The JSON document the CLI prints after its progress lines. */
export function extractJson<T = any>(text: string): T | null {
  const end = text.lastIndexOf('}');
  for (let i = text.indexOf('{'); i !== -1 && i < end; i = text.indexOf('{', i + 1)) {
    if (i > 0 && text[i - 1] !== '\n') continue;
    try {
      return JSON.parse(text.slice(i, end + 1)) as T;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** The address to share: a custom domain if there is one, else the shortest project alias (not the per-branch one). */
export function publicAlias(aliases: string[]): string | null {
  const usable = aliases.filter((a) => HOST.test(a) && !/-git-/.test(a));
  const custom = usable.filter((a) => !a.endsWith('.vercel.app'));
  const pick = (list: string[]) => [...list].sort((a, b) => a.length - b.length)[0];
  return pick(custom) ?? pick(usable) ?? null;
}

/** "owner/repo" for a GitHub remote. */
export function githubSlug(remote: string): string | null {
  return /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(remote)?.[1] ?? null;
}

export function vercelImportUrl(remote: string): string {
  const slug = githubSlug(remote);
  return slug ? `https://vercel.com/new/import?s=${encodeURIComponent(`https://github.com/${slug}`)}` : 'https://vercel.com/new';
}

export async function vercelAccount(cwd: string): Promise<{ installed: boolean; user: string | null }> {
  const r = await vercel(cwd, ['whoami'], 30_000);
  if (r.code === 127 || /not recognized|command not found|ENOENT/i.test(r.stderr)) return { installed: false, user: null };
  const user = r.code === 0 ? r.stdout.trim().split('\n').pop()?.trim() || null : null;
  return { installed: true, user };
}

function linkedProject(root: string): { projectId: string; orgId: string } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8'));
  } catch {
    return null;
  }
}

interface CliDeployment {
  url: string;
  state: string;
  meta?: { githubCommitSha?: string };
}

async function aliasesFor(root: string, url: string) {
  if (!HOST.test(url)) return [];
  const r = await vercel(root, ['inspect', url, '--format', 'json']);
  return extractJson<{ aliases?: string[] }>(r.stdout)?.aliases ?? [];
}

function failed(state: string) {
  return /ERROR|CANCELED/.test(state);
}

/** Waits for the deployment Vercel starts for `sha` when the linked project is connected to GitHub. */
async function waitForGitDeployment(root: string, sha: string, appearWithin: number): Promise<CliDeployment | null> {
  const started = Date.now();
  for (;;) {
    const r = await vercel(root, ['ls', '--format', 'json']);
    const deployment = extractJson<{ deployments?: CliDeployment[] }>(r.stdout)?.deployments?.find((d) => d.meta?.githubCommitSha === sha);
    if (deployment && (deployment.state === 'READY' || failed(deployment.state))) return deployment;
    if (!deployment && Date.now() - started > appearWithin) return null;
    if (Date.now() - started > 10 * 60_000) throw new ProjectError('Vercel is taking unusually long. Check the deployment on vercel.com.');
    await sleep(3000);
  }
}

async function deployWithCli(root: string): Promise<GoLiveResult> {
  const r = await vercel(root, ['deploy', '--prod', '--yes'], 15 * 60_000);
  const out = extractJson<{ deployment?: { url?: string; productionUrl?: string; inspectorUrl?: string; readyState?: string } }>(r.stdout)?.deployment;
  if (r.code !== 0 || !out?.url) {
    const line = `${r.stderr}\n${r.stdout}`.split('\n').find((l) => /Error|error:/.test(l))?.trim();
    throw new ProjectError(line ? `Vercel: ${line.replace(/^Error:\s*/, '')}` : 'Vercel could not deploy the site.');
  }
  if (out.readyState && failed(out.readyState)) throw new ProjectError('The Vercel build failed. Open the deployment on vercel.com to see the log.');
  const live = out.productionUrl ?? `https://${out.url}`;
  return { status: 'live', url: live.startsWith('http') ? live : `https://${live}`, inspectUrl: out.inspectorUrl ?? null };
}

interface GithubDeployment {
  id: number;
  creator?: { login?: string };
  statuses_url: string;
}

/** Finds the deployment Vercel reported to GitHub for `sha`, for people who connected Vercel on the website. */
async function waitForGithubDeployment(root: string, slug: string, sha: string, fetcher: Fetcher, appearWithin: number): Promise<GoLiveResult | null> {
  const cred = await githubCredential(root);
  const headers = { Authorization: `Bearer ${cred.password}`, Accept: 'application/vnd.github+json', 'User-Agent': 'OpenCanvas' };
  const get = async <T>(url: string): Promise<T | null> => {
    const res = await fetcher(url, { headers });
    return res.ok ? ((await res.json()) as T) : null;
  };
  const started = Date.now();
  for (;;) {
    const list = (await get<GithubDeployment[]>(`https://api.github.com/repos/${slug}/deployments?sha=${sha}&per_page=20`)) ?? [];
    const deployment = list.find((d) => /vercel/i.test(d.creator?.login ?? ''));
    if (deployment) {
      const [latest] = (await get<{ state: string; environment_url?: string; target_url?: string }[]>(deployment.statuses_url)) ?? [];
      if (latest?.state === 'success') return { status: 'live', url: latest.environment_url || latest.target_url || null, inspectUrl: latest.target_url ?? null };
      if (latest && /failure|error/.test(latest.state)) throw new ProjectError('The Vercel build failed. Open the deployment on vercel.com to see the log.');
    } else if (Date.now() - started > appearWithin) {
      return null;
    }
    if (Date.now() - started > 10 * 60_000) throw new ProjectError('Vercel is taking unusually long. Check the deployment on vercel.com.');
    await sleep(3000);
  }
}

/** Puts the pushed commit live on Vercel, or explains what the user needs to do first. */
export async function goLiveOnVercel(root: string, fetcher: Fetcher): Promise<GoLiveResult> {
  const sha = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
  const remote = (await git(root, ['remote', 'get-url', 'origin'], { allowFail: true })).stdout.trim();
  const slug = githubSlug(remote);
  const account = await vercelAccount(root);

  if (account.user) {
    if (linkedProject(root)) {
      const deployment = await waitForGitDeployment(root, sha, 45_000);
      if (deployment) {
        if (failed(deployment.state)) throw new ProjectError('The Vercel build failed. Open the deployment on vercel.com to see the log.');
        const alias = publicAlias(await aliasesFor(root, deployment.url));
        return { status: 'live', url: `https://${alias ?? deployment.url}`, inspectUrl: null };
      }
    }
    return deployWithCli(root);
  }

  if (slug) {
    const found = await waitForGithubDeployment(root, slug, sha, fetcher, 25_000);
    if (found) return found;
  }
  return { status: 'needs-vercel', importUrl: vercelImportUrl(remote), reason: account.installed ? 'signed-out' : 'no-account' };
}
