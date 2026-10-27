import type { AiEvent, AiModel, AiSettings, AiStatus } from './ai';
import type { VoiceCapabilities, VoiceChatMessage, VoiceSpeakResult } from './voice';
import type { DesignSystemDocument, Token, ValidationIssue } from './design-system';
import type { VariantGenerateRequest, VariantRecord } from './variants';
import type { FontCatalog } from './fonts';
import type { InspirationBoard, InspirationProviderInfo, InspirationResult } from './inspiration';
import type { DesignReference, DesignSystemConfig, DirectionConfig, PageMutation, ProjectPagesState } from './project-config';
import type { TerminalDataEvent, TerminalExitEvent, TerminalSession } from './terminal';
import type {
  BuildCheckResult,
  EditCommand,
  EditResult,
  ExportReport,
  ExportResult,
  FileChange,
  FileNode,
  GitStatus,
  GoLiveResult,
  ImportedProject,
  ImportResult,
  McpApplied,
  McpRequest,
  McpStatus,
  OpenedFile,
  PreviewStatus,
  ProjectInfo,
  RecentProject,
  SourceElementInfo,
  TemplateId,
  TemplateMeta,
  ThemePreference,
} from './types';

export interface ProjectSetup {
  direction: DirectionConfig;
  uploads: Record<string, string>;
}

export interface PickedImage {
  file: string;
  name: string;
  dataUrl: string;
}

export type { DesignReference };

/** What the editor knows that the main process doesn't: where the user is looking. */
export interface AiTurnContext {
  /** Selected element id and name. */
  selection?: { id: string; name: string; tag: string } | null;
  /** Page shown in the active frame. */
  page?: { name: string; path: string } | null;
  /** Width of the active frame, to hint which breakpoint the user is designing. */
  frameWidth?: number | null;
  /** Replies the user chose to remember; shown to the model at the start of every turn. */
  memory?: string[];
}

export interface OpenCanvasApi {
  templates(): Promise<TemplateMeta[]>;
  recentProjects(): Promise<RecentProject[]>;
  defaultLocation(): Promise<string>;
  /** `setup` comes from "Get help from AI": its direction is saved with the project; uploads map reference ids to picked image files. */
  createProject(template: TemplateId, name: string, setup?: ProjectSetup): Promise<ProjectInfo>;
  openProjectDialog(): Promise<ProjectInfo | null>;
  openProject(root: string): Promise<ProjectInfo>;
  /** Picks a file and opens the project that contains it. */
  openFileDialog(): Promise<OpenedFile | null>;
  /** Clones a GitHub repository (URL or owner/repo) into the projects folder and opens it. */
  cloneGithub(repo: string): Promise<ProjectInfo>;
  /** Picks a .zip, unpacks it into the projects folder and opens it. Null when the dialog is cancelled. */
  importZip(): Promise<ImportedProject | null>;
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
  /** Copies files from disk (absolute paths) into the project folder `dir`. */
  importFiles(sources: string[], dir: string): Promise<ImportResult>;
  /** Native file picker, then import; null when cancelled. */
  importDialog(dir: string, imagesOnly: boolean): Promise<ImportResult | null>;
  /** Absolute path of a file dropped from the OS (empty for in-memory files). */
  pathForFile(file: File): string;
  applyEdit(command: EditCommand): Promise<EditResult>;
  inspect(id: string): Promise<SourceElementInfo | { error: string }>;
  revert(changes: FileChange[], direction: 'undo' | 'redo'): Promise<{ ok: boolean; error?: string }>;
  googleFonts(): Promise<FontCatalog>;
  startPreview(): Promise<void>;
  stopPreview(): Promise<void>;
  previewStatus(): Promise<PreviewStatus>;
  installDependencies(): Promise<{ ok: boolean; error?: string; project: ProjectInfo }>;
  cancelInstall(): Promise<void>;
  exportZip(): Promise<ExportResult>;
  /** Fast static checks of what the export will contain. */
  validateExport(): Promise<ExportReport>;
  /** Installs and builds the export in a clean temp folder; streams its log through onCheckLog. */
  checkBuild(): Promise<BuildCheckResult>;
  cancelBuildCheck(): Promise<void>;
  onCheckLog(cb: (text: string) => void): () => void;
  revealFile(file: string): Promise<void>;
  revealProject(): Promise<void>;
  git: {
    status(): Promise<GitStatus>;
    init(): Promise<void>;
    setIdentity(name: string, email: string): Promise<void>;
    /** Accepts a full URL or GitHub `owner/repo`; returns the stored URL. */
    setRemote(url: string): Promise<string>;
    /** Creates a repository on the signed-in GitHub account and connects it as origin. */
    createRepo(name: string, isPrivate: boolean): Promise<{ url: string; htmlUrl: string }>;
    commit(message: string): Promise<void>;
    push(): Promise<void>;
    pull(): Promise<void>;
    openRemote(): Promise<void>;
  };
  publish: {
    /** Gets the pushed commit live on Vercel (deploying or waiting for the Git-triggered build). */
    vercel(): Promise<GoLiveResult>;
    /** Opens an https link in the browser. */
    open(url: string): Promise<void>;
  };
  mcp: {
    status(): Promise<McpStatus>;
    setEnabled(enabled: boolean): Promise<McpStatus>;
    setPort(port: number): Promise<McpStatus>;
    regenerateToken(): Promise<McpStatus>;
    /** Opens Cursor's "add MCP server" deeplink for this server. */
    installCursor(): Promise<void>;
    reply(id: number, reply: { ok: boolean; value?: unknown; error?: string }): Promise<void>;
    onStatus(cb: (status: McpStatus) => void): () => void;
    onApplied(cb: (applied: McpApplied) => void): () => void;
    onRequest(cb: (request: McpRequest) => void): () => void;
  };
  projectConfig: {
    /** Pages and direction for the open project (defaults when the project has no config file). */
    get(): Promise<ProjectPagesState>;
    /** Saves the direction; `uploads` maps reference ids to picked image files to copy into the project. */
    setDirection(direction: DirectionConfig, uploads?: Record<string, string>): Promise<ProjectPagesState>;
  };
  workspace: {
    get(fallbackPageId?: string | null): Promise<import('./workspace-layout').WorkspaceState>;
    set(workspace: import('./workspace-layout').WorkspaceState): Promise<void>;
  };
  pages: {
    create(name: string, viewType?: import('./project-config').PageViewType): Promise<PageMutation>;
    duplicate(id: string): Promise<PageMutation>;
    rename(id: string, name: string): Promise<PageMutation>;
    reorder(ids: string[]): Promise<PageMutation>;
    remove(id: string): Promise<PageMutation>;
  };
  direction: {
    /** Native image picker; returns the file and a preview, without copying anything. */
    pickImage(): Promise<PickedImage | null>;
    /** Data URL of a reference image stored in the open project. */
    image(rel: string): Promise<string>;
    /** Native picker for a CSS or token JSON file; null when cancelled. Throws when the file has no tokens. */
    importDesignSystem(): Promise<DesignSystemConfig | null>;
  };
  designSystem: {
    get(): Promise<{ document: DesignSystemDocument; issues: ValidationIssue[]; cssFile: string }>;
    setActiveTheme(themeId: string): Promise<DesignSystemDocument>;
    upsertToken(token: Token, summary?: string): Promise<DesignSystemDocument>;
    impact(tokenId: string): Promise<{
      tokenId: string;
      dependentTokens: string[];
      components: string[];
      styleUsages: number;
      styleKeys: string[];
      cssVar: string;
    }>;
    historyRestore(changeId: string): Promise<DesignSystemDocument>;
    export(format: 'css' | 'tokens-json'): Promise<string>;
    /** Re-sync generated CSS from the saved document. */
    syncCss(): Promise<string>;
  };
  inspiration: {
    providers(): Promise<InspirationProviderInfo[]>;
    search(provider: string, query: string): Promise<InspirationResult[]>;
    /** Signs in through the provider's site in the browser. Resolves when the sign-in finishes. */
    connect(provider: string): Promise<InspirationProviderInfo>;
    disconnect(provider: string): Promise<InspirationProviderInfo>;
    boards(provider: string): Promise<InspirationBoard[]>;
    boardItems(provider: string, boardId: string): Promise<InspirationResult[]>;
    /** Downloads the image of one of the provider's results, ready to add as a reference upload. */
    image(provider: string, url: string): Promise<PickedImage>;
  };
  ai: {
    status(): Promise<AiStatus>;
    setSettings(settings: AiSettings): Promise<AiStatus>;
    /** Stores the key for the selected provider, encrypted. The key can't be read back. */
    setKey(key: string): Promise<AiStatus>;
    clearKey(): Promise<AiStatus>;
    listModels(): Promise<AiModel[]>;
    /** Sends a tiny request with the current settings; resolves with the model's reply or throws a readable error. */
    test(): Promise<string>;
    /** Starts a turn; resolves with its id once it has started. Progress arrives through onEvent. */
    send(request: string, context?: AiTurnContext): Promise<string>;
    answer(id: string, answer: string): Promise<void>;
    approve(id: string, allow: boolean): Promise<void>;
    cancel(): Promise<void>;
    /** Forgets the conversation. */
    reset(): Promise<void>;
    onEvent(cb: (event: AiEvent) => void): () => void;
    /** How the voice orb listens/speaks for the selected provider. */
    voiceCapabilities(): Promise<VoiceCapabilities>;
    /** Short tool-free reply for the voice loop. */
    voiceReply(messages: VoiceChatMessage[]): Promise<string>;
    /** Speak text via the provider TTS when available, else browser speech. */
    voiceSpeak(text: string): Promise<VoiceSpeakResult>;
    /** Transcribe a mic clip (base64) when provider STT is available. */
    voiceTranscribe(audioBase64: string, mime: string): Promise<string>;
  };
  variants: {
    generate(request: VariantGenerateRequest): Promise<{ setId: string; turnId: string; variants: VariantRecord[] }>;
    cancel(): Promise<void>;
    list(): Promise<VariantRecord[]>;
    apply(id: string): Promise<{ ok: boolean; error?: string; selectId?: string | null }>;
    discard(id: string): Promise<void>;
    discardSet(setId: string): Promise<void>;
    retry(id: string): Promise<{ turnId: string; variant: VariantRecord }>;
    onChanged(cb: (variants: VariantRecord[]) => void): () => void;
  };
  terminal: {
    /** Null when terminals can run here, otherwise the reason they can't. */
    unavailable(): Promise<string | null>;
    /** Opens a shell in the project folder. */
    create(opts?: { cols?: number; rows?: number; title?: string }): Promise<TerminalSession>;
    list(): Promise<TerminalSession[]>;
    /** Recent output kept in memory, for reattaching after a reload. */
    scrollback(id: string): Promise<string>;
    write(id: string, data: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    rename(id: string, title: string): Promise<TerminalSession | null>;
    /** Ends the session and everything it started, and removes it. */
    kill(id: string): Promise<void>;
    onData(cb: (event: TerminalDataEvent) => void): () => void;
    onExit(cb: (event: TerminalExitEvent) => void): () => void;
    /** Sessions opened by the main process (the AI's command runs). */
    onCreated(cb: (session: TerminalSession) => void): () => void;
  };
  setUnsaved(value: boolean): Promise<void>;
  setTheme(preference: ThemePreference): Promise<void>;
  onPreviewStatus(cb: (status: PreviewStatus) => void): () => void;
  onInstallLog(cb: (text: string) => void): () => void;
  onFilesChanged(cb: (paths: string[]) => void): () => void;
}
