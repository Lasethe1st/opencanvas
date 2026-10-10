/** Bundle entry used by automated tests to exercise main-process services without Electron. */
export * from '../shared/canvas';
export * from '../shared/source/ast';
export * from '../shared/source/css';
export * from '../shared/source/jsx';
export { applyEdit, inspectElement, relocate, revertChanges } from './services/edits';
export { buildProjectZip, runInstructions } from './services/exporter';
export { detectProject, listTree, safeResolve, writeFiles } from './services/project';
export { generateTemplate, TEMPLATES } from './templates';
