import { moveSelected, redo, removeSelected, undo } from './actions';
import { getState } from './store';

export function handleShortcut(key: string, meta: boolean, shift: boolean, alt = false): boolean {
  const { mode, selection } = getState();
  if (meta && key.toLowerCase() === 'z') {
    if (shift) void redo();
    else void undo();
    return true;
  }
  if (meta && key.toLowerCase() === 'y') {
    void redo();
    return true;
  }
  if (mode === 'visual' && selection && (key === 'Delete' || key === 'Backspace')) {
    void removeSelected();
    return true;
  }
  if (mode === 'visual' && selection && alt && (key === 'ArrowUp' || key === 'ArrowDown')) {
    void moveSelected(key === 'ArrowUp' ? 'up' : 'down');
    return true;
  }
  return false;
}
