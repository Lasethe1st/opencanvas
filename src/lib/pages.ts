/** Pages on the shared canvas: loading the project config, page changes as undoable steps, and keeping frames in step. */
import { placeBelow, presetFrame, type FrameLayout } from '../../shared/canvas';
import type { DirectionConfig, PageConfig, PageMutation } from '../../shared/project-config';
import { CONFIG_FILE } from '../../shared/project-config';
import { fillRoute } from '../../shared/source/routes';
import { errorMessage, refreshTree, syncBuffersFromDisk } from './actions';
import { api } from './api';
import { displayRect, fitFrame, setActiveFrame } from './canvas';
import { getState, pageOf, setState, toast } from './store';

let loadSeq = 0;

export async function loadProjectConfig() {
  if (!getState().project) return;
  const seq = ++loadSeq;
  try {
    const state = await api.projectConfig.get();
    if (seq !== loadSeq || !getState().project) return;
    setState({ projectConfig: state });
    reconcileFrames();
  } catch (err) {
    toast(`Could not read the project’s pages: ${errorMessage(err)}`, 'error');
  }
}

/** True when a file change may have changed pages or direction. */
export const touchesConfig = (paths: string[]) => paths.some((p) => p === CONFIG_FILE || /^src\/routes\.[jt]sx$/.test(p) || /(^|\/)(app|pages)\//.test(p));

/** Drops frames of pages that no longer exist and gives every page without a frame a desktop frame. */
export function reconcileFrames() {
  const { projectConfig, frames, frameRuntime, project } = getState();
  if (!projectConfig || !frames.length) return;
  const ids = new Set(projectConfig.pages.map((p) => p.id));
  let next: FrameLayout[] = frames.filter((f) => !f.pageId || ids.has(f.pageId));
  if (!next.length) next = frames.slice(0, 1).map((f) => ({ ...f, pageId: undefined }));
  const first = projectConfig.pages[0];
  for (const page of projectConfig.pages) {
    const has = next.some((f) => (f.pageId ?? first?.id) === page.id);
    if (has) continue;
    const rects = next.map((f) => displayRect(f, frameRuntime[f.id]));
    const frame = { ...presetFrame('desktop', placeBelow(rects), project?.breakpoints), name: page.name, pageId: page.id };
    next = [...next, frame];
  }
  if (next.length !== frames.length || next.some((f, i) => f !== frames[i])) {
    const activeFrameId = next.some((f) => f.id === getState().activeFrameId) ? getState().activeFrameId : next[0].id;
    setState({ frames: next, activeFrameId });
  }
}

/** Preview URL for a page, or null while a dynamic route still needs example values. */
export function pageUrl(base: string, page: PageConfig | null, routeValues?: Record<string, string>, ocv?: string | null): string | null {
  let url: string;
  if (!page || page.path === '/') {
    url = base;
  } else {
    const path = fillRoute(page.path, routeValues);
    if (path === null) return null;
    url = base.replace(/\/+$/, '') + path;
  }
  if (!ocv) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}ocv=${encodeURIComponent(ocv)}`;
}

export function setRouteValues(frameId: string, routeValues: Record<string, string>) {
  setState((s) => ({ frames: s.frames.map((f) => (f.id === frameId ? { ...f, routeValues } : f)) }));
}

export function framesOf(pageId: string): FrameLayout[] {
  const s = getState();
  return s.frames.filter((f) => pageOf(f, s)?.id === pageId);
}

export function activePage(): PageConfig | null {
  const s = getState();
  return pageOf(s.frames.find((f) => f.id === s.activeFrameId) ?? s.frames[0], s);
}

export function focusPage(id: string) {
  const frames = framesOf(id);
  const frame = frames.find((f) => f.id === getState().activeFrameId) ?? frames[0];
  if (!frame) return;
  setActiveFrame(frame.id);
  fitFrame(frame.id);
}

async function mutate(run: () => Promise<PageMutation>, label: (m: PageMutation) => string): Promise<PageMutation | null> {
  if (getState().busy) return null;
  setState({ busy: true });
  try {
    const result = await run();
    if (result.changes.length) setState((s) => ({ past: [...s.past, { label: label(result), changes: result.changes }], future: [] }));
    setState({ projectConfig: result.state });
    reconcileFrames();
    const paths = result.changes.map((c) => c.path);
    void syncBuffersFromDisk(paths);
    void refreshTree();
    return result;
  } catch (err) {
    toast(errorMessage(err), 'error');
    return null;
  } finally {
    setState({ busy: false });
  }
}

export async function createPage(name: string) {
  const result = await mutate(() => api.pages.create(name), (m) => `Add page ${m.page?.name ?? name}`);
  if (result?.page) focusPage(result.page.id);
}

export async function duplicatePage(id: string) {
  const result = await mutate(() => api.pages.duplicate(id), (m) => `Duplicate page as ${m.page?.name ?? ''}`.trim());
  if (result?.page) focusPage(result.page.id);
}

export async function renamePage(id: string, name: string) {
  const page = getState().projectConfig?.pages.find((p) => p.id === id);
  const clean = name.trim();
  if (!page || !clean || clean === page.name) return;
  const result = await mutate(() => api.pages.rename(id, clean), () => `Rename page to ${clean}`);
  if (!result) return;
  const frames = getState().frames.map((f) => (pageOf(f)?.id === id && f.name === page.name ? { ...f, name: clean } : f));
  setState({ frames });
}

export async function movePage(id: string, step: -1 | 1) {
  const pages = getState().projectConfig?.pages ?? [];
  const i = pages.findIndex((p) => p.id === id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= pages.length) return;
  const ids = pages.map((p) => p.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await mutate(() => api.pages.reorder(ids), () => `Move page ${pages[i].name} ${step < 0 ? 'up' : 'down'}`);
}

export async function deletePage(id: string) {
  await mutate(() => api.pages.remove(id), (m) => `Delete page ${m.page?.name ?? ''}`.trim());
}

/** Saves project-level direction. Preferences only: nothing on the canvas is restyled. */
export async function saveDirection(direction: DirectionConfig, uploads?: Record<string, string>): Promise<boolean> {
  try {
    setState({ projectConfig: await api.projectConfig.setDirection(direction, uploads) });
    return true;
  } catch (err) {
    toast(`Could not save the direction: ${errorMessage(err)}`, 'error');
    return false;
  }
}
