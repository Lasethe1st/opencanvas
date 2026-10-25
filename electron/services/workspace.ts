/** Per-project workspace chrome (split layout) in `.opencanvas/workspace.json`. */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeWorkspace, type WorkspaceState } from '../../shared/workspace-layout';

export const WORKSPACE_FILE = '.opencanvas/workspace.json';

export function readWorkspace(root: string, fallbackPageId: string | null): WorkspaceState {
  const file = path.join(root, WORKSPACE_FILE);
  try {
    if (!fs.existsSync(file)) return normalizeWorkspace(null, fallbackPageId);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return normalizeWorkspace(raw, fallbackPageId);
  } catch {
    return normalizeWorkspace(null, fallbackPageId);
  }
}

export function writeWorkspace(root: string, workspace: WorkspaceState): void {
  const dir = path.join(root, '.opencanvas');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(root, WORKSPACE_FILE);
  const payload = {
    version: 1,
    focusedPaneId: workspace.focusedPaneId,
    activePageId: workspace.activePageId,
    layout: workspace.layout,
    maximizedPaneId: workspace.maximizedPaneId,
    restoreLayout: workspace.restoreLayout,
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
