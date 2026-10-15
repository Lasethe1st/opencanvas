import type { DetectContext, FrameworkAdapter } from './types';

const MANAGED_DEPS = new Set(['react', 'react-dom', 'vite', '@vitejs/plugin-react']);

function findEntry(ctx: DetectContext): string | null {
  const html = ctx.read('index.html');
  if (!html) return null;
  const match = /<script[^>]*type=["']module["'][^>]*src=["']\/?([^"']+)["']/i.exec(html);
  if (!match) return null;
  const rel = match[1].replace(/^\.\//, '');
  return ctx.exists(rel) ? rel : null;
}

export const viteReact: FrameworkAdapter = {
  id: 'vite-react',
  label: 'React + Vite',
  supports: { preview: true, visualEdit: true },
  detect: ({ deps }) => !!(deps.vite && deps.react),
  details(ctx) {
    const managedPreview = Object.keys(ctx.deps).every((d) => MANAGED_DEPS.has(d));
    const entryFile = findEntry(ctx);
    const warnings: string[] = [];
    if (!entryFile) warnings.push('Could not find the module entry script in index.html; styles file import must be added manually.');
    if (!ctx.hasNodeModules && !managedPreview) warnings.push('Dependencies are not installed. Install them to start the preview.');
    return { entryFile, stylesFile: 'src/open-canvas.css', managedPreview, editableRoots: ['src'], warnings };
  },
  startPreview(info, { appRoot, cacheDir }) {
    if (!info.hasNodeModules && !info.managedPreview) throw new Error('Dependencies are not installed. Use "Install dependencies" to run the preview.');
    const managed = info.managedPreview && !info.hasNodeModules;
    return {
      script: 'preview-server.mjs',
      env: { OC_APP_ROOT: appRoot, OC_MANAGED: managed ? '1' : '0', OC_CACHE_DIR: cacheDir },
    };
  },
};
