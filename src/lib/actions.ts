import type { EditCommand, FileChange, ImportResult, InsertKind, McpApplied, McpRequest, ProjectInfo, TemplateId } from '../../shared/types';
import { mergeChanges } from '../../shared/history';
import type { ProjectSetup } from '../../shared/api';
import { api } from './api';
import { runAudit } from './audit';
import { sendToPreview } from './bridge';
import { loadLayout } from './canvas';
import { loadProjectConfig, touchesConfig } from './pages';
import { resetTerminals } from './terminal';
import { activeBreakpoint, findPath, getState, hasUnsaved, initialState, setState, toast, useStore, type HistoryEntry, type SelectionItem, type TreeNode } from './store';

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
  const { leftWidth, rightWidth, leftTab, mcp, aiStatus, terminalOpen, terminals, activeTerminal } = getState();
  const sameProject = getState().project?.root === project.root;
  if (!sameProject) resetTerminals();
  setState({ ...initialState, project, leftWidth, rightWidth, leftTab, mcp, aiStatus, terminalOpen, ...(sameProject ? { terminals, activeTerminal } : {}) });
  loadLayout(project);
  await Promise.all([refreshTree(), loadProjectConfig()]);
  for (const warning of project.warnings) toast(warning, 'info');
  const entry = project.entryFile ? 'src/App.jsx' : null;
  const tree = getState().fileTree;
  const appFile = ['src/App.jsx', 'src/App.tsx', 'src/App.js'].find((f) => tree && containsPath(tree, f)) ?? entry;
  if (appFile) await openFile(appFile, false);
  if (project.canPreview) await api.startPreview();
  else setState({ mode: 'code' });
}

function containsPath(node: { path: string; children?: any[] }, path: string): boolean {
  if (node.path === path) return true;
  return (node.children ?? []).some((c) => containsPath(c, path));
}

function confirmDiscard(): boolean {
  return !hasUnsaved() || window.confirm('You have unsaved changes in the code editor. Discard them?');
}

export async function createProject(template: TemplateId, name: string, setup?: ProjectSetup): Promise<boolean> {
  if (!confirmDiscard()) return false;
  setState({ busy: true });
  try {
    await loadProject(await api.createProject(template, name, setup));
    return true;
  } catch (err) {
    toast(errorMessage(err), 'error');
    return false;
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

export async function openFileFromDisk() {
  if (!confirmDiscard()) return;
  try {
    const opened = await api.openFileDialog();
    if (!opened) return;
    await loadProject(opened.project);
    if (/\.(m?[jt]sx?|cjs|css|scss|html?|json|md|txt|svg)$/i.test(opened.file)) await openFile(opened.file);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

/** Resolves true once the cloned project is open. */
export async function importFromGithub(repo: string): Promise<boolean> {
  if (!confirmDiscard()) return false;
  setState({ busy: true });
  try {
    await loadProject(await api.cloneGithub(repo));
    return true;
  } catch (err) {
    toast(errorMessage(err), 'error');
    return false;
  } finally {
    setState({ busy: false });
  }
}

export async function importZip() {
  if (!confirmDiscard()) return;
  setState({ busy: true });
  try {
    const imported = await api.importZip();
    if (!imported) return;
    await loadProject(imported.project);
    setState({ importSummary: imported });
  } catch (err) {
    toast(errorMessage(err), 'error');
  } finally {
    setState({ busy: false });
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
  resetTerminals();
  setState({ ...initialState, leftTab: getState().leftTab, mcp: getState().mcp, aiStatus: getState().aiStatus, terminalOpen: getState().terminalOpen });
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

/** Applies an edit as one history entry; `prefix` changes (e.g. an imported file) join the same entry. */
export async function runEdit(command: EditCommand, label: string, prefix: FileChange[] = []): Promise<boolean> {
  if (getState().busy) return false;
  setState({ busy: true });
  try {
    const result = await api.applyEdit(command);
    if (!result.ok) {
      toast(result.error ?? 'Edit failed.', 'error');
      return false;
    }
    if (result.changes.length || prefix.length) {
      const entry: HistoryEntry = { label, changes: [...prefix, ...result.changes], selectId: result.selectId };
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
  if (touchesConfig(paths)) void loadProjectConfig();
}

const extraIds = () => getState().multiSelect.map((m) => m.id);
const groupSuffix = () => (getState().multiSelect.length ? ` on ${getState().multiSelect.length + 1} elements` : '');

export async function setStyles(styles: Record<string, string>, label?: string) {
  const { selection } = getState();
  if (!selection) return;
  const props = Object.keys(styles);
  const state = getState().styleState;
  await runEdit(
    { type: 'setStyle', id: selection.id, breakpoint: activeBreakpoint(), styles, state, extraIds: extraIds() },
    (label ?? `Set ${props[0]}`) + (state === 'hover' ? ' (hover)' : '') + groupSuffix(),
  );
}

export async function setTag(tag: string) {
  const { selection } = getState();
  if (!selection || selection.tag === tag) return;
  await runEdit({ type: 'setTag', id: selection.id, tag }, `Change to <${tag}>`);
}

export function setStyle(prop: string, value: string) {
  return setStyles({ [prop]: value });
}

/** Sets font-family; a Google font is also linked from index.html in the same undo step. */
export async function setFontFamily(value: string, googleFont?: string) {
  const { selection } = getState();
  if (!selection) return;
  const label = value ? `Set font to ${value.split(',')[0].replace(/['"]/g, '')}` : 'Reset font';
  await runEdit({ type: 'setStyle', id: selection.id, breakpoint: activeBreakpoint(), styles: { 'font-family': value }, googleFont, state: getState().styleState, extraIds: extraIds() }, label + groupSuffix());
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

const pathOf = (m: SelectionItem) => findPath(getState().domTree, m.uid) ?? findPathById(getState().domTree, m.id) ?? [];

/** Selected elements, without duplicates and without members nested inside another member. */
function topLevelSelection(): SelectionItem[] {
  const { selection, multiSelect } = getState();
  if (!selection) return [];
  const members = [selection, ...multiSelect];
  const ids = new Set(members.map((m) => m.id));
  return members.filter((m, i) => members.findIndex((o) => o.id === m.id) === i && !pathOf(m).slice(0, -1).some((n) => ids.has(n.id)));
}

export async function removeSelected() {
  const { selection, multiSelect } = getState();
  if (!selection) return;
  if (!multiSelect.length) {
    await runEdit({ type: 'remove', id: selection.id }, `Delete ${selection.name}`);
    return;
  }
  const [first, ...rest] = topLevelSelection();
  await runEdit({ type: 'remove', id: first.id, extraIds: rest.map((m) => m.id) }, `Delete ${multiSelect.length + 1} elements`);
}

export async function duplicateSelected() {
  const top = topLevelSelection();
  if (!top.length) return;
  const [first, ...rest] = top;
  await runEdit({ type: 'duplicate', id: first.id, extraIds: rest.map((m) => m.id) }, top.length === 1 ? `Duplicate ${first.name}` : `Duplicate ${top.length} elements`);
}

export async function groupSelected() {
  const top = topLevelSelection();
  if (!top.length) return;
  const [first, ...rest] = top;
  await runEdit({ type: 'group', id: first.id, extraIds: rest.map((m) => m.id) }, top.length === 1 ? `Group ${first.name}` : `Group ${top.length} elements`);
}

export async function ungroupSelected() {
  const { selection, multiSelect } = getState();
  if (!selection || multiSelect.length) return;
  await runEdit({ type: 'ungroup', id: selection.id }, `Ungroup ${selection.name}`);
}

/* ---------- Keyboard navigation of the element tree ---------- */

function selectNode(node: TreeNode | undefined) {
  if (!node) return false;
  setState({ multiSelect: [] });
  selectElement(node.id, node.uid);
  return true;
}

export function selectParent() {
  const { selection } = getState();
  if (!selection) return false;
  return selectNode(pathOf(selection).slice(-2, -1)[0]);
}

export function selectFirstChild() {
  const { selection } = getState();
  if (!selection) return false;
  return selectNode(pathOf(selection).at(-1)?.children[0]);
}

export function selectSibling(step: 1 | -1) {
  const { selection, domTree } = getState();
  if (!selection) return selectNode(domTree[0]);
  const path = pathOf(selection);
  const node = path.at(-1);
  const siblings = path.length > 1 ? path[path.length - 2].children : domTree;
  if (!node) return false;
  const index = siblings.findIndex((n) => n.uid === node.uid);
  return selectNode(siblings[(index + step + siblings.length) % siblings.length]);
}

export function selectAllSiblings() {
  const { selection, domTree } = getState();
  const path = selection ? pathOf(selection) : [];
  const siblings = path.length > 1 ? path[path.length - 2].children : domTree;
  if (!siblings.length) return false;
  const items = siblings.map((n) => ({ id: n.id, uid: n.uid, name: n.name }));
  const current = selection ? items.findIndex((i) => i.uid === path.at(-1)?.uid) : -1;
  if (current >= 0) items.push(...items.splice(current, 1));
  selectMany(items);
  return true;
}

function findPathById(nodes: TreeNode[], id: string): TreeNode[] | null {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const sub = findPathById(node.children, id);
    if (sub) return [node, ...sub];
  }
  return null;
}

/** Selects several layers at once; the last becomes the primary selection shown in the inspector. */
export function selectMany(items: SelectionItem[]) {
  if (!items.length) return;
  const primary = items[items.length - 1];
  setState({ multiSelect: items.slice(0, -1) });
  sendToPreview('select', { id: primary.id, uid: primary.uid, additive: 'keep' });
}

export function toggleInSelection(item: SelectionItem) {
  const { selection } = getState();
  if (!selection) return selectElement(item.id, item.uid);
  sendToPreview('select', { id: item.id, uid: item.uid, additive: 'toggle' });
}

/* ---------- Assets ---------- */

/** URL an imported file is served at: files in public/ are served from the site root. */
export const assetUrl = (rel: string) => (rel.startsWith('public/') ? rel.slice('public'.length) : `/${rel}`);
const altFor = (rel: string) => rel.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');

function recordImport(result: ImportResult, label: string) {
  if (result.undoable && result.changes.length) setState((s) => ({ past: [...s.past, { label, changes: result.changes }], future: [] }));
}

function importLabel(result: ImportResult) {
  return result.files.length === 1 ? `Import ${result.files[0]}` : `Import ${result.files.length} files`;
}

async function afterImport(result: ImportResult) {
  recordImport(result, importLabel(result));
  await refreshTree();
  toast(`${importLabel(result).replace('Import', 'Imported')}${result.undoable ? '' : ' (includes binary files — not undoable)'}`, 'success');
}

/** Native picker → copies files into `dir` (public/ by default, where they are served as /name). */
export async function importAssets(dir = 'public') {
  try {
    const result = await api.importDialog(dir, false);
    if (result) await afterImport(result);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

/** Files dropped from Explorer/Finder. */
export async function importDroppedFiles(files: File[], dir = 'public'): Promise<ImportResult | null> {
  const paths = files.map((f) => api.pathForFile(f)).filter(Boolean);
  if (!paths.length) {
    toast('Those items could not be read from disk.', 'error');
    return null;
  }
  try {
    const result = await api.importFiles(paths, dir);
    await afterImport(result);
    return result;
  } catch (err) {
    toast(errorMessage(err), 'error');
    return null;
  }
}

/** Picks an image file for the selected <img>: imports it into public/ and sets src in one undo step. */
export async function chooseImageForSelection() {
  const { selection } = getState();
  if (!selection) return;
  try {
    const result = await api.importDialog('public', true);
    if (!result) return;
    const rel = result.files[0];
    const ok = await runEdit({ type: 'setAttribute', id: selection.id, name: 'src', value: assetUrl(rel) }, `Set image to ${rel}`, result.undoable ? result.changes : []);
    if (!ok) recordImport(result, importLabel(result));
    await refreshTree();
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

/** Inserts an <img> for each imported image (the import joins the first insert's undo step). */
export async function insertImages(result: ImportResult) {
  const images = result.files.filter((f) => /\.(svg|png|jpe?g|gif|webp|avif|ico)$/i.test(f));
  for (const [i, rel] of images.entries()) {
    const { selection, domTree } = getState();
    const parentId = selection?.id ?? domTree[0]?.id ?? null;
    if (!parentId) {
      toast('The preview has no editable elements yet. Wait for it to load, then try again.', 'error');
      return;
    }
    const prefix = i === 0 && result.undoable ? result.changes : [];
    await runEdit({ type: 'insert', parentId, kind: 'image', image: { src: assetUrl(rel), alt: altFor(rel) } }, `Insert ${rel}`, prefix);
  }
}

/** Image tool: choose a file and insert it; cancelling inserts nothing. */
export async function insertImageFromDisk() {
  try {
    const result = await api.importDialog('public', true);
    if (!result) return;
    await refreshTree();
    await insertImages(result);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

export async function moveSelected(direction: 'up' | 'down') {
  const { selection } = getState();
  if (!selection) return;
  await runEdit({ type: 'move', id: selection.id, direction }, `Move ${selection.name} ${direction}`);
}

/** Resolves once no edit is in flight, so a quick Ctrl+Z after an edit undoes that edit instead of being dropped. */
function idle(timeout = 5000): Promise<void> {
  if (!getState().busy) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeout);
    const unsubscribe = useStore.subscribe((s) => !s.busy && done());
    function done() {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
  });
}

/** Returns a short description of the outcome (also used by MCP's undo tool). */
export async function undo(): Promise<string> {
  await idle();
  const { past, busy } = getState();
  const entry = past[past.length - 1];
  if (!entry || busy) return 'Nothing to undo.';
  if (hasUnsaved()) {
    const message = 'Save or discard code editor changes before undoing.';
    toast(message, 'error');
    return message;
  }
  const result = await api.revert(entry.changes, 'undo');
  if (!result.ok) {
    toast(result.error ?? 'Undo failed.', 'error');
    return result.error ?? 'Undo failed.';
  }
  setState((s) => ({ past: s.past.slice(0, -1), future: [entry, ...s.future] }));
  toast(`Undid: ${entry.label}`);
  afterChange(getState().selection?.id ?? null, entry.changes.map((c) => c.path));
  return `Undid: ${entry.label}`;
}

export async function redo(): Promise<string> {
  await idle();
  const { future, busy } = getState();
  const entry = future[0];
  if (!entry || busy) return 'Nothing to redo.';
  if (hasUnsaved()) {
    const message = 'Save or discard code editor changes before redoing.';
    toast(message, 'error');
    return message;
  }
  const result = await api.revert(entry.changes, 'redo');
  if (!result.ok) {
    toast(result.error ?? 'Redo failed.', 'error');
    return result.error ?? 'Redo failed.';
  }
  setState((s) => ({ past: [...s.past, entry], future: s.future.slice(1) }));
  toast(`Redid: ${entry.label}`);
  afterChange(entry.selectId ?? getState().selection?.id ?? null, entry.changes.map((c) => c.path));
  return `Redid: ${entry.label}`;
}

/* ---------- MCP ---------- */

/** Puts an edit made through MCP (already written by the main process) into the undo history. */
export function recordExternalEdit(applied: McpApplied) {
  setState((s) => {
    const top = s.past[s.past.length - 1];
    if (applied.turnId && top?.turnId === applied.turnId) {
      const merged: HistoryEntry = { ...top, changes: mergeChanges(top.changes, applied.changes), selectId: applied.selectId === undefined ? top.selectId : applied.selectId };
      return { past: [...s.past.slice(0, -1), merged], future: [] };
    }
    const entry: HistoryEntry = { label: applied.label, changes: applied.changes, selectId: applied.selectId, turnId: applied.turnId };
    return { past: [...s.past, entry], future: [] };
  });
  const paths = applied.changes.map((c) => c.path);
  if (applied.selectId === undefined) {
    void syncBuffersFromDisk(paths);
    void refreshTree();
    void refreshSourceInfo();
  } else {
    afterChange(applied.selectId, paths);
  }
}

async function answerMcp(request: McpRequest): Promise<unknown> {
  switch (request.action) {
    case 'undo':
      return undo();
    case 'redo':
      return redo();
    case 'select': {
      if (typeof request.arg !== 'string') throw new Error('An element id is required.');
      setState({ pendingSelectId: request.arg, multiSelect: [] });
      sendToPreview('sync');
      return true;
    }
    case 'selection': {
      const { selection, multiSelect } = getState();
      if (!selection) return { selected: [] };
      return { selected: [...multiSelect, selection].map((m) => ({ id: m.id, name: m.name })), primary: { id: selection.id, tag: selection.tag, name: selection.name } };
    }
    case 'audit': {
      const report = await runAudit();
      setState({ auditOpen: true });
      return report;
    }
  }
}

export function handleMcpRequest(request: McpRequest) {
  answerMcp(request).then(
    (value) => api.mcp.reply(request.id, { ok: true, value }),
    (err) => api.mcp.reply(request.id, { ok: false, error: errorMessage(err) }),
  );
}

export function revealInCode(file: string, line: number) {
  void openFile(file).then(() => setState({ revealLine: { file, line } }));
}

export { errorMessage };
