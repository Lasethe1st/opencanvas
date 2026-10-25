/** Persist split layout per project (`.opencanvas/workspace.json` via Electron; localStorage fallback in browser). */
import { normalizeWorkspace, type WorkspaceState } from '../../shared/workspace-layout';
import { api } from './api';
import { getState, setState } from './store';

const key = (root: string) => `oc-workspace:v1:${root.replace(/\\/g, '/').toLowerCase()}`;

export async function loadWorkspace(root: string, fallbackPageId: string | null) {
  try {
    if (typeof api.workspace?.get === 'function') {
      const ws = await api.workspace.get(fallbackPageId);
      if (getState().project?.root === root) setState({ workspace: ws });
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    const raw = localStorage.getItem(key(root));
    const parsed = raw ? JSON.parse(raw) : null;
    if (getState().project?.root === root) setState({ workspace: normalizeWorkspace(parsed, fallbackPageId) });
  } catch {
    if (getState().project?.root === root) setState({ workspace: normalizeWorkspace(null, fallbackPageId) });
  }
}

export function saveWorkspace(root: string, workspace: WorkspaceState) {
  void (async () => {
    try {
      if (typeof api.workspace?.set === 'function') {
        await api.workspace.set(workspace);
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      localStorage.setItem(key(root), JSON.stringify(workspace));
    } catch {
      /* storage blocked */
    }
  })();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleWorkspaceSave() {
  const s = getState();
  if (!s.project) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const cur = getState();
    if (cur.project) saveWorkspace(cur.project.root, cur.workspace);
  }, 400);
}
