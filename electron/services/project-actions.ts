import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectError } from './project';

/** Whether the folder is a git repository (the Update action only makes sense for these). */
export function isGitRepo(root: string): boolean {
  try {
    return fs.existsSync(path.join(root, '.git'));
  } catch {
    return false;
  }
}

/**
 * Deletes a project's folder from disk. The caller must type the folder's name, and a few folders are never deleted
 * whatever the name: a drive root, the home folder, the projects folder itself, or anything shallower than two levels.
 */
export function deleteProjectFolder(root: string, typedName: string, protectedDirs: string[] = []): void {
  const target = path.resolve(root);
  const name = path.basename(target);
  if (!name || typedName.trim() !== name) throw new ProjectError(`Type "${name}" exactly to delete it.`);
  const parts = target.split(path.sep).filter(Boolean);
  const blocked = [os.homedir(), ...protectedDirs].map((p) => path.resolve(p));
  if (parts.length < 2 || path.parse(target).root === target || blocked.includes(target)) {
    throw new ProjectError('That folder is too important to delete from here.');
  }
  if (!fs.existsSync(path.join(target, 'package.json'))) throw new ProjectError('That folder is not an OpenCanvas project.');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
}
