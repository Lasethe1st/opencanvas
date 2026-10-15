import type { Framework, ProjectInfo } from '../../shared/types';

/** What every adapter gets to look at: the parsed package.json and a few cheap file checks. */
export interface DetectContext {
  root: string;
  pkg: Record<string, any>;
  deps: Record<string, string>;
  hasNodeModules: boolean;
  exists(rel: string): boolean;
  read(rel: string): string | null;
}

/** The framework-specific parts of `ProjectInfo`. */
export interface AdapterDetails {
  entryFile: string | null;
  stylesFile: string;
  managedPreview: boolean;
  editableRoots: string[];
  warnings: string[];
}

/** How to start the preview: a script under dist-electron and the environment it needs. */
export interface PreviewLaunch {
  script: string;
  env: Record<string, string>;
}

export interface PreviewContext {
  appRoot: string;
  cacheDir: string;
}

export interface FrameworkAdapter {
  id: Framework;
  label: string;
  supports: { preview: boolean; visualEdit: boolean };
  detect(ctx: DetectContext): boolean;
  details(ctx: DetectContext): AdapterDetails;
  /** Throws a readable message when the preview can't start yet. */
  startPreview?(info: ProjectInfo, ctx: PreviewContext): PreviewLaunch;
}
