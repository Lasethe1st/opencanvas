import { moveSelected, redo, removeSelected, undo } from './actions';
import { fitAll, fitSelection, layoutRedo, layoutUndo, zoomBy, zoomToLevel } from './canvas';
import { editSelectedText } from './inline-edit';
import { getState, setState } from './store';

export function handleShortcut(key: string, meta: boolean, shift: boolean, alt = false): boolean {
  const { mode, selection, interact } = getState();
  const visual = mode === 'visual';
  if (meta && alt && key.toLowerCase() === 'z') {
    if (shift) layoutRedo();
    else layoutUndo();
    return true;
  }
  if (meta && key.toLowerCase() === 'z') {
    if (shift) void redo();
    else void undo();
    return true;
  }
  if (meta && key.toLowerCase() === 'y') {
    void redo();
    return true;
  }
  if (!visual) return false;
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
  if (!meta && !shift && !alt && (key === 'v' || key === 'V')) {
    setState({ tool: 'select' });
    return true;
  }
  if (!meta && !shift && !alt && (key === 'h' || key === 'H')) {
    setState({ tool: 'hand' });
    return true;
  }
  if (selection && key === 'Enter' && !meta) {
    editSelectedText();
    return true;
  }
  if (selection && (key === 'Delete' || key === 'Backspace')) {
    void removeSelected();
    return true;
  }
  if (selection && alt && (key === 'ArrowUp' || key === 'ArrowDown')) {
    void moveSelected(key === 'ArrowUp' ? 'up' : 'down');
    return true;
  }
  return false;
}
