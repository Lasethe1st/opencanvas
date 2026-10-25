/** Bundle entry used by automated tests to exercise main-process services without Electron. */
export * from '../shared/canvas';
export * from '../shared/fonts';
export * from '../shared/numeric';
export * from '../shared/source/ast';
export * from '../shared/source/css';
export * from '../shared/source/jsx';
export * from '../shared/source/routes';
export * from '../shared/project-config';
export * from '../shared/design-tokens';
export * from '../shared/design-system';
export { buildDesignContext, buildDesignSystemBrief, describeStyle } from '../shared/design-context';
export { createPage, deletePage, duplicatePage, pagesState, readConfig, renamePage, reorderPages, writeDirection } from './services/project-config';
export { listProviders, searchProvider } from './services/inspiration';
export { importFiles } from './services/assets';
export { applyEdit, inspectElement, relocate, revertChanges } from './services/edits';
export {
  applyVariant,
  beginVariantSet,
  discardVariant,
  discardVariantSet,
  fileHash,
  listVariants,
  proposeVariant,
  pruneVariants,
  readVariantIndex,
  replaceElementInFile,
  ensureVariantsGitignore,
} from './services/variants';
export * from '../shared/variants';
export * from '../shared/variant-resolve';
export * from '../shared/build-stages';
export * from '../shared/agent-graph';
export * from '../shared/three';
export * from '../shared/workspace-layout';
export { createWorkspacePage } from './services/project-config';
export { readWorkspace, writeWorkspace } from './services/workspace';
export { createVariantTools, VARIANT_TOOL_NAMES } from './services/mcp-tools';
export { faviconHrefs, projectFavicon } from './services/favicon';
export { extractJson, githubSlug, goLiveOnVercel, publicAlias, vercelImportUrl } from './services/vercel';
export { friendlyError, git, gitClone, gitCommit, gitInit, gitPush, gitSetIdentity, gitSetRemote, gitStatus, normalizeRemote, parseStatus, remoteWebUrl, repoName } from './services/git';
export { buildProjectZip, runInstructions } from './services/exporter';
export { BUILD_CHECK_TIMEOUT, envExampleFor, importsOf, packageOf, runBuildCheck, validateExport } from './services/export-validate';
export { McpServer, readMcpSettings, writeMcpSettings, newToken } from './services/mcp';
export { createMcpTools, MCP_INSTRUCTIONS } from './services/mcp-tools';
export { detectProject, findProjectRoot, isEditablePath, listTree, projectSummary, safeResolve, writeFiles } from './services/project';
export { extractZip, safeEntryPath, ZIP_LIMITS, ZipImportError } from './services/zip-import';
export { ADAPTERS, adapterFor } from './adapters';
export { nextEntry } from './adapters/next';
export { addClientEntry, transformForNext, withOpenCanvas } from './next-config';
export * from '../shared/ai';
export * from '../shared/history';
export * from '../shared/ai-chat';
export { SaveeClient, SaveeError, pkcePair, resourceMetadataUrl, toBoard, toResult } from './services/savee';
export { connectProvider, disconnectProvider, providerBoards, saveeProvider, setProviders } from './services/inspiration';
export { aiKeyName, aiNotReadyReason, normalizeAiSettings, readAiSettings, redact, SecretStore, writeAiSettings } from './services/ai-keys';
export { listModels, readSse, streamChat, testConnection } from './services/ai-providers';
export { AiAgent, approvalSummary, COMMAND_OUTPUT_LIMIT, describeCall, MAX_STEPS } from './services/ai-agent';
export { generateTemplate, TEMPLATES } from './templates';
export * from '../shared/terminal';
export { commandShell, defaultShell, stripAnsi, TerminalError, TerminalManager, terminalEnv } from './services/terminal';
export { killTree, runCommand } from './services/processes';
