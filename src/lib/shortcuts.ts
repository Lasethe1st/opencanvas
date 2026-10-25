import { togglePanels } from './panels';
import type { InsertKind } from '../../shared/types';
import { setInteract } from '../components/TopBar';
import {
  duplicateSelected,
  groupSelected,
  insertElement,
  insertImageFromDisk,
  moveSelected,
  redo,
  removeSelected,
  selectAllSiblings,
  selectElement,
  selectFirstChild,
  selectParent,
  selectSibling,
  undo,
  ungroupSelected,
} from './actions';
import { fitAll, fitSelection, layoutRedo, layoutUndo, zoomBy, zoomToLevel } from './canvas';
import { editSelectedText, INLINE_TAGS } from './inline-edit';
import { getState, setState } from './store';

export const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const ALT = IS_MAC ? '⌥' : 'Alt';

/** Shown in the shortcuts dialog (Ctrl+/ or ?). Each entry is a list of alternative key combos. */
export const SHORTCUT_GROUPS: { title: string; items: { keys: string[][]; label: string }[] }[] = [
  {
    title: 'General',
    items: [
      { keys: [[MOD, 'Z']], label: 'Undo' },
      { keys: [[MOD, 'Shift', 'Z'], [MOD, 'Y']], label: 'Redo' },
      { keys: [[MOD, 'S']], label: 'Save file' },
      { keys: [[MOD, '`']], label: 'Show / hide terminal' },
      { keys: [[MOD, 'E']], label: 'Switch between Visual and Code' },
      { keys: [['P']], label: 'Preview (interact with the page)' },
      { keys: [[MOD, 'Shift', 'E']], label: 'Export project' },
      { keys: [[MOD, '/'], ['?']], label: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Tools & insert',
    items: [
      { keys: [['V']], label: 'Select tool' },
      { keys: [['H'], ['Space', 'drag']], label: 'Hand tool / pan' },
      { keys: [['/']], label: 'Insert any element…' },
      { keys: [['F']], label: 'Insert section…' },
      { keys: [['R']], label: 'Insert container' },
      { keys: [['T']], label: 'Insert text' },
      { keys: [['I']], label: 'Insert image from a file' },
      { keys: [['B']], label: 'Insert button' },
      { keys: [['L']], label: 'Insert link' },
    ],
  },
  {
    title: 'Selection',
    items: [
      { keys: [['Tab'], ['Shift', 'Tab']], label: 'Next / previous sibling' },
      { keys: [['Enter']], label: 'Edit text, or select first child' },
      { keys: [['Shift', 'Enter']], label: 'Select parent' },
      { keys: [[MOD, 'A']], label: 'Select all siblings' },
      { keys: [[MOD, 'Click'], ['Shift', 'Click']], label: 'Add to / remove from selection' },
      { keys: [['Esc']], label: 'Clear selection' },
      { keys: [['F2']], label: 'Rename layer' },
    ],
  },
  {
    title: 'Edit elements',
    items: [
      { keys: [[MOD, 'D']], label: 'Duplicate' },
      { keys: [[MOD, 'G']], label: 'Group in a container' },
      { keys: [[MOD, 'Shift', 'G']], label: 'Ungroup' },
      { keys: [['Delete'], ['Backspace']], label: 'Delete' },
      { keys: [[ALT, '↑'], [MOD, '[']], label: 'Move up (earlier in the page)' },
      { keys: [[ALT, '↓'], [MOD, ']']], label: 'Move down (later in the page)' },
      { keys: [['↑'], ['↓']], label: 'In a number field: step by 1 (Shift 10, Alt 0.1)' },
    ],
  },
  {
    title: 'Canvas',
    items: [
      { keys: [[MOD, '+'], [MOD, '−']], label: 'Zoom in / out' },
      { keys: [[MOD, '0']], label: 'Zoom to 100%' },
      { keys: [['Shift', '1']], label: 'Fit all frames' },
      { keys: [['Shift', '2']], label: 'Zoom to selection' },
      { keys: [[MOD, ALT, 'Z']], label: 'Undo layout change' },
      { keys: [[MOD, ALT, 'Shift', 'Z']], label: 'Redo layout change' },
    ],
  },
];

const INSERT_KEYS: Record<string, InsertKind> = { f: 'section', r: 'div', t: 'paragraph', b: 'button', l: 'link' };

/**
 * Global shortcuts. Called for keydowns in the editor window (outside text fields) and for keys the
 * preview frames forward. Returns true when the key was handled.
 */
export function handleShortcut(key: string, meta: boolean, shift: boolean, alt = false): boolean {
  const { mode, selection, interact, multiSelect, project } = getState();
  const visual = mode === 'visual';
  const lower = key.toLowerCase();
  const plain = !meta && !alt;

  if (meta && alt && lower === 'z') {
    if (shift) layoutRedo();
    else layoutUndo();
    return true;
  }
  if (meta && lower === 'z') {
    if (shift) void redo();
    else void undo();
    return true;
  }
  if (meta && lower === 'y') {
    void redo();
    return true;
  }
  if ((meta && key === '/') || (plain && key === '?')) {
    setState({ shortcutsOpen: true });
    return true;
  }
  if (meta && alt && (key === 'ArrowRight' || key === 'ArrowLeft')) {
    const { openProjects, activeProjectRoot } = getState();
    if (openProjects.length > 1) {
      const i = Math.max(0, openProjects.findIndex((t) => t.root === activeProjectRoot));
      const next = openProjects[(i + (key === 'ArrowRight' ? 1 : openProjects.length - 1)) % openProjects.length];
      void import('./actions').then((m) => m.switchProjectTab(next.root));
      return true;
    }
  }
  if (plain && key === 'Escape' && getState().selectedAgentNodeId) {
    setState({ selectedAgentNodeId: null });
    return true;
  }
  if (meta && !alt && lower === 'e') {
    if (shift) setState({ exportOpen: true });
    else setState({ mode: visual ? 'code' : 'visual' });
    return true;
  }
  if (!visual) return false;
  if (meta && !alt && !shift && key === '\\') {
    togglePanels();
    return true;
  }
  if (plain && !shift && lower === 'p') {
    setInteract(!interact);
    return true;
  }
  if (meta && (key === '=' || key === '+')) {
    zoomBy(1.25);
    return true;
  }
  if (meta && key === '-') {
    zoomBy(0.8);
    return true;
  }
  if (meta && key === '0') {
    zoomToLevel(1);
    return true;
  }
  if (shift && !meta && (key === '!' || key === '1')) {
    fitAll();
    return true;
  }
  if (shift && !meta && (key === '@' || key === '2')) {
    fitSelection();
    return true;
  }
  if (interact) return false;
  if (plain && !shift && lower === 'v') {
    setState({ tool: 'select' });
    return true;
  }
  if (plain && !shift && lower === 'h') {
    setState({ tool: 'hand' });
    return true;
  }

  const editable = !!project?.editable;
  if (editable && plain && !shift) {
    if (key === '/') {
      window.dispatchEvent(new Event('oc-open-insert'));
      return true;
    }
    if (lower === 'i') {
      void insertImageFromDisk();
      return true;
    }
    if (INSERT_KEYS[lower]) {
      void insertElement(INSERT_KEYS[lower]);
      return true;
    }
  }

  if (key === 'Tab' && !meta && !alt) return selectSibling(shift ? -1 : 1) || true;
  if (meta && !shift && lower === 'a') return selectAllSiblings() || true;
  if (!selection) return false;

  const grouped = multiSelect.length > 0;
  if (key === 'Escape') {
    if (grouped) setState({ multiSelect: [] });
    else selectElement(null);
    return true;
  }
  if (key === 'Enter' && shift && !meta) return selectParent() || true;
  if (key === 'Enter' && !meta && !grouped) {
    if (INLINE_TAGS.has(selection.tag)) editSelectedText();
    else selectFirstChild();
    return true;
  }
  if (key === 'F2' && !grouped) {
    setState({ leftTab: 'layers' });
    setTimeout(() => window.dispatchEvent(new Event('oc-rename-layer')), 0);
    return true;
  }
  if (!editable) return false;
  if (key === 'Delete' || key === 'Backspace') {
    void removeSelected();
    return true;
  }
  if (meta && !alt && lower === 'd') {
    void duplicateSelected();
    return true;
  }
  if (meta && !alt && lower === 'g') {
    void (shift ? ungroupSelected() : groupSelected());
    return true;
  }
  if (!grouped && ((alt && !meta && (key === 'ArrowUp' || key === 'ArrowDown')) || (meta && (key === '[' || key === ']')))) {
    void moveSelected(key === 'ArrowUp' || key === '[' ? 'up' : 'down');
    return true;
  }
  return false;
}
