import type {
  EditCommand,
  EditResult,
  ExportResult,
  FileChange,
  FileNode,
  PreviewStatus,
  ProjectInfo,
  RecentProject,
  SourceElementInfo,
  TemplateId,
  TemplateMeta,
  ThemePreference,
} from './types';

export interface OpenCanvasApi {
  templates(): Promise<TemplateMeta[]>;
  recentProjects(): Promise<RecentProject[]>;
  defaultLocation(): Promise<string>;
  createProject(template: TemplateId, name: string): Promise<ProjectInfo>;
  openProjectDialog(): Promise<ProjectInfo | null>;
  openProject(root: string): Promise<ProjectInfo>;
  refreshProject(): Promise<ProjectInfo>;
  closeProject(): Promise<void>;
  fileTree(): Promise<FileNode>;
  readFile(rel: string): Promise<string>;
  writeFile(rel: string, content: string): Promise<FileChange>;
  createFile(rel: string): Promise<FileChange>;
  createFolder(rel: string): Promise<void>;
  /** Deletes a file or folder. `undoable` is false when binary files were involved (no history entry). */
  deletePath(rel: string): Promise<{ changes: FileChange[]; undoable: boolean }>;
  renamePath(from: string, to: string): Promise<{ changes: FileChange[]; undoable: boolean }>;
  applyEdit(command: EditCommand): Promise<EditResult>;
  inspect(id: string): Promise<SourceElementInfo | { error: string }>;
  revert(changes: FileChange[], direction: 'undo' | 'redo'): Promise<{ ok: boolean; error?: string }>;
  startPreview(): Promise<void>;
  stopPreview(): Promise<void>;
  previewStatus(): Promise<PreviewStatus>;
  installDependencies(): Promise<{ ok: boolean; error?: string; project: ProjectInfo }>;
  cancelInstall(): Promise<void>;
  exportZip(): Promise<ExportResult>;
  revealFile(file: string): Promise<void>;
  revealProject(): Promise<void>;
  setUnsaved(value: boolean): Promise<void>;
  setTheme(preference: ThemePreference): Promise<void>;
  onPreviewStatus(cb: (status: PreviewStatus) => void): () => void;
  onInstallLog(cb: (text: string) => void): () => void;
  onFilesChanged(cb: (paths: string[]) => void): () => void;
}
