import type { Framework } from '../../shared/types';
import { next } from './next';
import type { FrameworkAdapter } from './types';
import { viteReact } from './vite-react';

const cra: FrameworkAdapter = {
  id: 'cra',
  label: 'Create React App',
  supports: { preview: false, visualEdit: false },
  detect: ({ deps }) => !!deps['react-scripts'],
  details: () => ({
    entryFile: null,
    stylesFile: 'src/open-canvas.css',
    managedPreview: false,
    editableRoots: [],
    warnings: ['Create React App projects are not supported for preview yet. You can browse and edit files in code view.'],
  }),
};

/** In detection order: a Next.js app may also list react and vite. */
export const ADAPTERS: FrameworkAdapter[] = [next, viteReact, cra];

export function adapterFor(framework: Framework): FrameworkAdapter | null {
  return ADAPTERS.find((a) => a.id === framework) ?? null;
}

export type { AdapterDetails, DetectContext, FrameworkAdapter, PreviewContext, PreviewLaunch } from './types';
