import type { AiEvent } from './ai';
import { runningLineFor } from './change-line';

/** One project with a turn in flight. The composer pill and its popover read this list. */
export interface RunningJob {
  turnId: string;
  projectRoot: string;
  projectName: string;
  /** Home chat this turn belongs to, when the work is not only on the canvas. */
  chatId: string | null;
  /** Present-tense line, same copy as the thread (`Editing App.tsx`, `Browsing…`). */
  line: string;
  place: 'home' | 'canvas';
}

export interface RunningContext {
  project: { root: string; name: string } | null;
  homeProjectRoot: string | null;
  homeProjectName: string | null;
  homeActiveChatId: string | null;
}

function upsert(jobs: RunningJob[], job: RunningJob): RunningJob[] {
  const index = jobs.findIndex((item) => item.turnId === job.turnId);
  if (index < 0) return [...jobs, job];
  const next = jobs.slice();
  next[index] = { ...next[index], ...job, line: job.line || next[index].line };
  return next;
}

/** Fold one AI event into the list of projects that still have work in flight. */
export function reduceRunningJobs(jobs: RunningJob[], event: AiEvent, ctx: RunningContext): RunningJob[] {
  if (event.type === 'start') {
    if (ctx.project) {
      return upsert(jobs, {
        turnId: event.turnId,
        projectRoot: ctx.project.root,
        projectName: ctx.project.name,
        chatId: null,
        line: '',
        place: 'canvas',
      });
    }
    if (ctx.homeProjectRoot) {
      const name = ctx.homeProjectName || ctx.homeProjectRoot.split(/[/\\]/).filter(Boolean).pop() || 'Project';
      return upsert(jobs, {
        turnId: event.turnId,
        projectRoot: ctx.homeProjectRoot,
        projectName: name,
        chatId: ctx.homeActiveChatId,
        line: '',
        place: 'home',
      });
    }
    return jobs;
  }
  if (event.type === 'tool-start') {
    const line = runningLineFor(event.tool, event.summary, event.file);
    if (!line) return jobs;
    return jobs.map((job) => (job.turnId === event.turnId ? { ...job, line } : job));
  }
  if (event.type === 'done' || event.type === 'error') return jobs.filter((job) => job.turnId !== event.turnId);
  return jobs;
}
