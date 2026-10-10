import type { EditCommand, InsertKind, ProjectInfo, TemplateId } from '../../shared/types';
import { api } from './api';
import { sendToPreview } from './bridge';
import { getState, hasUnsaved, initialState, setState, toast, VIEWPORT_BREAKPOINT, type HistoryEntry } from './store';

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export async function refreshTree() {
  if (!getState().project) return;
  try {
    setState({ fileTree: await api.fileTree() });
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

async function loadProject(project: ProjectInfo) {
  setState({ ...initialState, project, leftWidth: getState().leftWidth, rightWidth: getState().rightWidth });
  await refreshTree();
  for (const warning of project.warnings) toast(warning, 'info');
  const entry = project.entryFile ? 'src/App.jsx' : null;
  const tree = getState().fileTree;
  const appFile = ['src/App.jsx', 'src/App.tsx', 'src/App.js'].find((f) => tree && containsPath(tree, f)) ?? entry;
  if (appFile) await openFile(appFile, false);
  if (project.framework === 'vite-react') await api.startPreview();
  else setState({ mode: 'code' });
}

function containsPath(node: { path: string; children?: any[] }, path: string): boolean {
  if (node.path === path) return true;
  return (node.children ?? []).some((c) => containsPath(c, path));
}

function confirmDiscard(): boolean {
  return !hasUnsaved() || window.confirm('You have unsaved changes in the code editor. Discard them?');
}

export async function createProject(template: TemplateId, name: string) {
  if (!confirmDiscard()) return;
  setState({ busy: true });
  try {
    await loadProject(await api.createProject(template, name));
  } catch (err) {
    toast(errorMessage(err), 'error');
  } finally {
    setState({ busy: false });
  }
}

export async function openProjectDialog() {
  if (!confirmDiscard()) return;
  try {
    const project = await api.openProjectDialog();
    if (project) await loadProject(project);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

export async function openRecent(root: string) {
  if (!confirmDiscard()) return;
  try {
    await loadProject(await api.openProject(root));
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

export async function closeProject() {
  if (!confirmDiscard()) return;
  await api.closeProject();
  await api.setUnsaved(false);
  setState({ ...initialState });
}

export async function installDependencies() {
  setState({ installing: true, installLog: '' });
  const result = await api.installDependencies();
  setState({ installing: false, project: result.project });
  if (!result.ok) {
    toast(result.error ?? 'Install failed.', 'error');
    return;
  }
  toast('Dependencies installed.', 'success');
  await api.startPreview();
}

export async function cancelInstall() {
  await api.cancelInstall();
}

export async function restartPreview() {
  await api.startPreview();
}

/** package.json / vite config changed: re-detect the project and restart the preview so new dependencies are picked up. */
export async function reloadProjectConfig() {
  if (!getState().project || getState().installing) return;
  const before = JSON.stringify(getState().project);
  const project = await api.refreshProject();
  setState({ project });
  if (JSON.stringify(project) !== before) {
    toast('Project configuration changed — restarting the preview.', 'info');
    await api.startPreview();
  }
}

/* ---------- Files & code view ---------- */

export async function openFile(path: string, switchToCode = true) {
  const state = getState();
  if (!state.buffers[path]) {
    try {
      const content = await api.readFile(path);
      setState((s) => ({ buffers: { ...s.buffers, [path]: { content, saved: content } } }));
    } catch (err) {
      toast(errorMessage(err), 'error');
      return;
    }
  }
  setState((s) => ({
    activeFile: path,
    openFiles: s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path],
    mode: switchToCode ? 'code' : s.mode,
  }));
}

export function closeFile(path: string) {
  const buffer = getState().buffers[path];
  if (buffer && buffer.content !== buffer.saved && !window.confirm(`Discard unsaved changes to ${path}?`)) return;
  setState((s) => {
    const openFiles = s.openFiles.filter((f) => f !== path);
    const buffers = { ...s.buffers };
    delete buffers[path];
    return { openFiles, buffers, activeFile: s.activeFile === path ? openFiles[openFiles.length - 1] ?? null : s.activeFile };
  });
  void api.setUnsaved(hasUnsaved());
}

export function updateBuffer(path: string, content: string) {
  setState((s) => ({ buffers: { ...s.buffers, [path]: { ...s.buffers[path], content } } }));
  void api.setUnsaved(hasUnsaved());
}

export async function saveFile(path = getState().activeFile) {
  if (!path) return;
  const buffer = getState().buffers[path];
  if (!buffer || buffer.content === buffer.saved) return;
  try {
    const change = await api.writeFile(path, buffer.content);
    setState((s) => ({
      buffers: { ...s.buffers, [path]: { content: buffer.content, saved: buffer.content } },
      past: [...s.past, { label: `Edit ${path}`, changes: [change] }],
      future: [],
    }));
    void api.setUnsaved(hasUnsaved());
    toast(`Saved ${path}`, 'success');
  } catch (err) {
    toast(`Could not save ${path}: ${errorMessage(err)}`, 'error');
  }
}

export async function createFileOrFolder(kind: 'file' | 'folder', parentDir: string, name: string): Promise<boolean> {
  const clean = name.trim().replace(/^\/+|\/+$/g, '');
  if (!clean) return false;
  if (/[<>:"|?*\\]/.test(clean) || clean.split('/').some((part) => !part || part === '.' || part === '..')) {
    toast('Use a plain name such as Card.jsx or components/Card.jsx.', 'error');
    return false;
  }
  const rel = parentDir ? `${parentDir}/${clean}` : clean;
  try {
    if (kind === 'file') {
      const change = await api.createFile(rel);
      setState((s) => ({ past: [...s.past, { label: `Create ${rel}`, changes: [change] }], future: [] }));
      await refreshTree();
      await openFile(rel);
    } else {
      await api.createFolder(rel);
      await refreshTree();
    }
    return true;
  } catch (err) {
    toast(errorMessage(err), 'error');
    return false;
  }
}

const within = (file: string, rel: string) => file === rel || file.startsWith(`${rel}/`);

export async function deletePath(rel: string, isDir: boolean) {
  const dirty = Object.entries(getState().buffers).some(([p, b]) => within(p, rel) && b.content !== b.saved);
  const what = isDir ? `the folder ${rel} and everything in it` : rel;
  if (!window.confirm(`Delete ${what}?${dirty ? ' Unsaved changes in open files will be lost.' : ''}`)) return;
  try {
    const result = await api.deletePath(rel);
    setState((s) => {
      const buffers = Object.fromEntries(Object.entries(s.buffers).filter(([p]) => !within(p, rel)));
      const openFiles = s.openFiles.filter((p) => !within(p, rel));
      const activeFile = s.activeFile && within(s.activeFile, rel) ? openFiles[openFiles.length - 1] ?? null : s.activeFile;
      const past = result.undoable ? [...s.past, { label: `Delete ${rel}`, changes: result.changes }] : s.past;
      return { buffers, openFiles, activeFile, past, future: result.undoable ? [] : s.future };
    });
    void api.setUnsaved(hasUnsaved());
    toast(result.undoable ? `Deleted ${rel}` : `Deleted ${rel} (contains binary files — this cannot be undone)`, 'success');
    await refreshTree();
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

export async function renamePath(rel: string, newName: string): Promise<boolean> {
  const clean = newName.trim();
  const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  if (!clean || clean === rel.slice(parent ? parent.length + 1 : 0)) return true;
  if (/[<>:"|?*\\/]/.test(clean) || clean === '.' || clean === '..') {
    toast('Use a plain name without slashes.', 'error');
    return false;
  }
  const to = parent ? `${parent}/${clean}` : clean;
  try {
    const result = await api.renamePath(rel, to);
    const move = (p: string) => (within(p, rel) ? to + p.slice(rel.length) : p);
    setState((s) => ({
      buffers: Object.fromEntries(Object.entries(s.buffers).map(([p, b]) => [move(p), b])),
      openFiles: s.openFiles.map(move),
      activeFile: s.activeFile ? move(s.activeFile) : null,
      past: result.undoable ? [...s.past, { label: `Rename ${rel}`, changes: result.changes }] : s.past,
      future: result.undoable ? [] : s.future,
    }));
    toast(`Renamed to ${to}. Imports that reference the old path are not updated automatically.`, 'info');
    await refreshTree();
    return true;
  } catch (err) {
    toast(errorMessage(err), 'error');
    return false;
  }
}

/** Reloads clean buffers from disk after visual edits or external changes. */
export async function syncBuffersFromDisk(paths?: string[]) {
  const { buffers } = getState();
  const targets = Object.keys(buffers).filter((p) => !paths || paths.includes(p));
  for (const path of targets) {
    const buffer = getState().buffers[path];
    if (!buffer || buffer.content !== buffer.saved) continue;
    try {
      const content = await api.readFile(path);
      if (content !== buffer.saved) {
        setState((s) => ({ buffers: { ...s.buffers, [path]: { content, saved: content } } }));
      }
    } catch {
      /* file may have been deleted */
    }
  }
}

/* ---------- Selection ---------- */

export async function refreshSourceInfo() {
  const selection = getState().selection;
  if (!selection) {
    setState({ sourceInfo: null, sourceError: null });
    return;
  }
  const info = await api.inspect(selection.id);
  if (getState().selection?.id !== selection.id) return;
  if ('error' in info) setState({ sourceInfo: null, sourceError: info.error });
  else setState({ sourceInfo: info, sourceError: null });
}

export function selectElement(id: string | null, uid?: string, scroll = true) {
  if (!id) {
    sendToPreview('select', { id: null });
    setState({ selection: null, sourceInfo: null });
    return;
  }
  sendToPreview('select', { id, uid, scroll });
}

/* ---------- Edits & history ---------- */

export async function runEdit(command: EditCommand, label: string): Promise<boolean> {
  if (getState().busy) return false;
  setState({ busy: true });
  try {
    const result = await api.applyEdit(command);
    if (!result.ok) {
      toast(result.error ?? 'Edit failed.', 'error');
      return false;
    }
    if (result.changes.length) {
      const entry: HistoryEntry = { label, changes: result.changes, selectId: result.selectId };
      setState((s) => ({ past: [...s.past, entry], future: [] }));
    }
    afterChange(result.selectId ?? null, result.changes.map((c) => c.path));
    return true;
  } catch (err) {
    toast(errorMessage(err), 'error');
    return false;
  } finally {
    setState({ busy: false });
  }
}

function afterChange(selectId: string | null, paths: string[]) {
  if (selectId) {
    setState({ pendingSelectId: selectId });
    sendToPreview('sync');
  } else {
    selectElement(null);
  }
  void syncBuffersFromDisk(paths);
  void refreshTree();
  void refreshSourceInfo();
}

export async function setStyles(styles: Record<string, string>, label?: string) {
  const { selection, viewport } = getState();
  if (!selection) return;
  const props = Object.keys(styles);
  await runEdit({ type: 'setStyle', id: selection.id, breakpoint: VIEWPORT_BREAKPOINT[viewport], styles }, label ?? `Set ${props[0]}`);
}

export function setStyle(prop: string, value: string) {
  return setStyles({ [prop]: value });
}

export async function insertElement(kind: InsertKind) {
  const { selection, domTree } = getState();
  const parentId = selection?.id ?? domTree[0]?.id ?? null;
  if (!parentId) {
    toast('The preview has no editable elements yet. Wait for it to load, then try again.', 'error');
    return;
  }
  await runEdit({ type: 'insert', parentId, kind }, `Insert ${kind}`);
}

export async function removeSelected() {
  const { selection } = getState();
  if (!selection) return;
  await runEdit({ type: 'remove', id: selection.id }, `Delete ${selection.name}`);
}

export async function moveSelected(direction: 'up' | 'down') {
  const { selection } = getState();
  if (!selection) return;
  await runEdit({ type: 'move', id: selection.id, direction }, `Move ${selection.name} ${direction}`);
}

export async function undo() {
  const { past, busy } = getState();
  const entry = past[past.length - 1];
  if (!entry || busy) return;
  if (hasUnsaved()) {
    toast('Save or discard code editor changes before undoing.', 'error');
    return;
  }
  const result = await api.revert(entry.changes, 'undo');
  if (!result.ok) {
    toast(result.error ?? 'Undo failed.', 'error');
    return;
  }
  setState((s) => ({ past: s.past.slice(0, -1), future: [entry, ...s.future] }));
  toast(`Undid: ${entry.label}`);
  afterChange(getState().selection?.id ?? null, entry.changes.map((c) => c.path));
}

export async function redo() {
  const { future, busy } = getState();
  const entry = future[0];
  if (!entry || busy) return;
  if (hasUnsaved()) {
    toast('Save or discard code editor changes before redoing.', 'error');
    return;
  }
  const result = await api.revert(entry.changes, 'redo');
  if (!result.ok) {
    toast(result.error ?? 'Redo failed.', 'error');
    return;
  }
  setState((s) => ({ past: [...s.past, entry], future: s.future.slice(1) }));
  toast(`Redid: ${entry.label}`);
  afterChange(entry.selectId ?? getState().selection?.id ?? null, entry.changes.map((c) => c.path));
}

export function revealInCode(file: string, line: number) {
  void openFile(file).then(() => setState({ revealLine: { file, line } }));
}

export { errorMessage };
