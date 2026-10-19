import { getState, setState } from './store';

const PREFIX = 'oc-panels:';
const key = () => {
  const root = getState().project?.root;
  return root ? PREFIX + root.replace(/\\/g, '/').toLowerCase() : null;
};

/** Restore the per-project panel visibility. */
export function loadPanels() {
  let hidden = { left: false, right: false };
  try {
    const k = key();
    const raw = k ? JSON.parse(localStorage.getItem(k) ?? 'null') : null;
    if (raw) hidden = { left: !!raw.left, right: !!raw.right };
  } catch {
    /* ignore bad storage */
  }
  setState({ panelsHidden: hidden });
}

function apply(next: { left: boolean; right: boolean }) {
  // Focus inside a panel that is about to hide moves to the canvas.
  const active = document.activeElement as HTMLElement | null;
  const panel = active?.closest<HTMLElement>('.panel--left, .panel--right');
  if (panel && ((panel.classList.contains('panel--left') && next.left) || (panel.classList.contains('panel--right') && next.right))) {
    const center = document.querySelector<HTMLElement>('.workspace__center');
    if (center) {
      if (!center.hasAttribute('tabindex')) center.tabIndex = -1;
      center.focus({ preventScroll: true });
    }
  }
  setState({ panelsHidden: next });
  try {
    const k = key();
    if (k) localStorage.setItem(k, JSON.stringify(next));
  } catch {
    /* storage full or blocked */
  }
}

/** Ctrl+\\: hide both panels, or bring both back when any is hidden. */
export function togglePanels() {
  const { left, right } = getState().panelsHidden;
  const hide = !(left && right);
  apply({ left: hide, right: hide });
}
