import type { FileChange } from './types';

/**
 * Combines two consecutive change sets into one history step: per file, the earliest `before` and the latest `after`,
 * so undoing the combined step restores every file to how it was before the first change.
 */
export function mergeChanges(earlier: FileChange[], later: FileChange[]): FileChange[] {
  const out = earlier.map((c) => ({ ...c }));
  for (const change of later) {
    const existing = out.find((c) => c.path === change.path);
    if (existing) existing.after = change.after;
    else out.push({ ...change });
  }
  return out;
}
