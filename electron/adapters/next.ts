import fs from 'node:fs';
import path from 'node:path';
import type { DetectContext, FrameworkAdapter } from './types';

const SCRIPT_EXTS = ['tsx', 'jsx', 'js', 'ts'];
export const NEXT_ROOTS = ['app', 'pages', 'src', 'components'];

/** The file every page goes through: the root layout (App Router) or the custom App (Pages Router). */
export function nextEntry(exists: (rel: string) => boolean): string | null {
  for (const base of ['app/layout', 'src/app/layout', 'pages/_app', 'src/pages/_app']) {
    for (const ext of SCRIPT_EXTS) if (exists(`${base}.${ext}`)) return `${base}.${ext}`;
  }
  return null;
}

function nextVersion(root: string): string | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'next', 'package.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

export const next: FrameworkAdapter = {
  id: 'next',
  label: 'Next.js',
  supports: { preview: true, visualEdit: true },
  detect: ({ deps }) => !!deps.next,
  details(ctx: DetectContext) {
    const warnings: string[] = [];
    const entryFile = nextEntry(ctx.exists);
    const appDir = ctx.exists('src/app') || ctx.exists('src/pages') ? 'src/app' : 'app';
    const stylesFile = `${entryFile ? path.posix.dirname(entryFile) : appDir}/open-canvas.css`;
    const editableRoots = NEXT_ROOTS.filter((r) => ctx.exists(r));
    if (!entryFile) warnings.push('No root layout or pages/_app was found, so style edits can’t be loaded. Add app/layout or pages/_app to edit styles visually.');
    const version = ctx.hasNodeModules ? nextVersion(ctx.root) : null;
    if (!ctx.hasNodeModules || !version) warnings.push('Dependencies are not installed. Install them to start the preview.');
    else if (Number(version.split('.')[0]) < 13) warnings.push(`Next.js ${version} is older than OpenCanvas supports (13 or later). The preview may not start.`);
    return { entryFile, stylesFile, managedPreview: false, editableRoots: editableRoots.length ? editableRoots : ['app'], warnings };
  },
  startPreview(info, { appRoot }) {
    if (!nextVersion(info.root)) throw new Error('Next.js isn’t installed in this project. Use "Install dependencies" to run the preview.');
    return { script: 'next-server.mjs', env: { OC_APP_ROOT: appRoot } };
  },
};
