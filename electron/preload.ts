import { contextBridge, ipcRenderer } from 'electron';
import type { OpenCanvasApi } from '../shared/api';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

function subscribe<T>(channel: string, callback: (value: T) => void) {
  const listener = (_event: unknown, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: OpenCanvasApi = {
  templates: () => invoke('templates:list'),
  recentProjects: () => invoke('projects:recent'),
  defaultLocation: () => invoke('projects:defaultLocation'),
  createProject: (template, name) => invoke('project:create', template, name),
  openProjectDialog: () => invoke('project:openDialog'),
  openProject: (root) => invoke('project:open', root),
  refreshProject: () => invoke('project:refresh'),
  closeProject: () => invoke('project:close'),
  fileTree: () => invoke('files:tree'),
  readFile: (rel) => invoke('files:read', rel),
  writeFile: (rel, content) => invoke('files:write', rel, content),
  createFile: (rel) => invoke('files:createFile', rel),
  createFolder: (rel) => invoke('files:createFolder', rel),
  applyEdit: (command) => invoke('edit:apply', command),
  inspect: (id) => invoke('edit:inspect', id),
  revert: (changes, direction) => invoke('edit:revert', changes, direction),
  startPreview: () => invoke('preview:start'),
  stopPreview: () => invoke('preview:stop'),
  previewStatus: () => invoke('preview:status'),
  deletePath: (rel) => invoke('files:delete', rel),
  renamePath: (from, to) => invoke('files:rename', from, to),
  installDependencies: () => invoke('preview:install'),
  cancelInstall: () => invoke('preview:cancelInstall'),
  exportZip: () => invoke('export:zip'),
  revealFile: (file) => invoke('export:reveal', file),
  revealProject: () => invoke('export:revealProject'),
  setUnsaved: (value) => invoke('app:setUnsaved', value),
  setTheme: (preference) => invoke('app:setTheme', preference),
  onPreviewStatus: (cb) => subscribe('preview:status', cb),
  onInstallLog: (cb) => subscribe('preview:installLog', cb),
  onFilesChanged: (cb) => subscribe('project:filesChanged', cb),
};

contextBridge.exposeInMainWorld('oc', api);
