/** Adds OpenCanvas to a loaded Next.js config in memory. The project's next.config file is never written. */
import path from 'node:path';
import { injectSourceIds } from '../shared/source/jsx';

export interface NextOpenCanvasOptions {
  projectRoot: string;
  editableRoots: string[];
  loaderPath: string;
  clientPath: string;
}

const MARK = Symbol.for('opencanvas.next-config');
const CLIENT_ENTRIES = ['main-app', 'main'];

/** Puts the bridge client first in the App Router and Pages Router client entries. */
export function addClientEntry(entries: Record<string, any>, clientPath: string): Record<string, any> {
  for (const key of CLIENT_ENTRIES) {
    const value = entries[key];
    if (!value) continue;
    if (typeof value === 'string') entries[key] = value === clientPath ? value : [clientPath, value];
    else if (Array.isArray(value)) !value.includes(clientPath) && value.unshift(clientPath);
    else if (typeof value === 'object' && value.import) {
      const list = ([] as string[]).concat(value.import);
      value.import = list.includes(clientPath) ? list : [clientPath, ...list];
    }
  }
  return entries;
}

export function withOpenCanvas<T extends Record<string, any>>(config: T, opts: NextOpenCanvasOptions): T {
  if (config[MARK as any]) return config;
  const userWebpack = typeof config.webpack === 'function' ? config.webpack : null;
  const include = opts.editableRoots.map((r) => path.join(opts.projectRoot, r));
  const webpack = (webpackConfig: any, ctx: any) => {
    const out = (userWebpack ? userWebpack(webpackConfig, ctx) : webpackConfig) ?? webpackConfig;
    out.module = out.module ?? {};
    out.module.rules = out.module.rules ?? [];
    out.module.rules.unshift({
      test: /\.(jsx|tsx|js)$/,
      enforce: 'pre',
      include,
      exclude: /[\\/]node_modules[\\/]/,
      use: [{ loader: opts.loaderPath, options: { projectRoot: opts.projectRoot } }],
    });
    if (!ctx?.isServer) {
      const entry = out.entry;
      out.entry = async () => addClientEntry(typeof entry === 'function' ? await entry() : { ...entry }, opts.clientPath);
    }
    return out;
  };
  return Object.assign(Object.create(Object.getPrototypeOf(config)), config, { webpack, [MARK]: true });
}

/** What the loader does to one file: source ids on host elements, nothing else. */
export function transformForNext(code: string, file: string, projectRoot: string): string {
  const rel = path.relative(projectRoot, file).split(path.sep).join('/');
  return injectSourceIds(code, file, rel).code;
}
