import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from 'bloom-menu';
import { motion } from 'framer-motion';

const SEED = 8;
const CLOSE_MS = 320;
export const ROW = 'flex w-full cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors duration-150 hover:bg-accent aria-disabled:pointer-events-none data-[disabled]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-muted-foreground';
export type SideItem = { id: string; label: string; icon: ReactNode; hint?: string; disabled?: boolean; danger?: boolean; section?: string };

/** Keyboard for an open side bloom: ↑/↓ move, Enter picks, ←/Esc close it. Returns true when it handled the key. */
export function sideBloomKey(e: KeyboardEvent, items: SideItem[], focus: number, setFocus: (n: number) => void, onPick: (it: SideItem) => void, onClose: () => void) {
  const live = items.filter((i) => !i.disabled);
  const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (e.key === 'Escape' || e.key === 'ArrowLeft') { stop(); onClose(); return true; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    stop();
    const cur = live.indexOf(items[focus]);
    const next = live[(cur + (e.key === 'ArrowDown' ? 1 : live.length - 1) + (cur < 0 && e.key === 'ArrowUp' ? 1 : 0)) % live.length];
    setFocus(items.indexOf(next));
    return true;
  }
  if (e.key === 'Enter') { stop(); const it = items[focus]; if (it && !it.disabled) onPick(it); return true; }
  return false;
}

const SIDE_W = 196;

/** "More…" blooms a second glass panel out to the side of its row (flips left when there's no room on the right). */
export function SideBloom({ open, anchor, items, focus, setFocus, onPick, onClose, overSide, width = SIDE_W }: {
  width?: number; open: boolean; anchor: HTMLElement | null; items: SideItem[]; focus: number; setFocus: (n: number) => void;
  onPick: (it: SideItem) => void; onClose: () => void; overSide: React.MutableRefObject<boolean>;
}) {
  const [shown, setShown] = useState(false);
  const [phase, setPhase] = useState(false);
  useEffect(() => {
    if (open) { setShown(true); const id = requestAnimationFrame(() => setPhase(true)); return () => cancelAnimationFrame(id); }
    setPhase(false);
    overSide.current = false;
    const t = window.setTimeout(() => setShown(false), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown || !anchor) return null;
  const panel = anchor.closest('.ctx-bloom')?.getBoundingClientRect();
  const r = anchor.getBoundingClientRect();
  const left = panel && panel.right + 6 + width > window.innerWidth - 8;
  const x = left ? (panel?.left ?? r.left) - 6 - SEED : (panel?.right ?? r.right) + 6;
  const sideH = items.length * 32 + items.filter((it, i) => it.section && it.section !== items[i - 1]?.section).length * 24 + 16;
  const y = Math.max(8, Math.min(r.top, window.innerHeight - 8 - sideH));
  return createPortal(
    <div data-tw="" data-bloom-menu="" onContextMenu={(e) => e.preventDefault()} onPointerEnter={() => (overSide.current = true)} onPointerLeave={() => (overSide.current = false)}
      style={{ position: 'fixed', top: y, left: x, width: SEED, height: SEED, zIndex: 401 }}>
      <Menu.Root open={phase} onOpenChange={(next) => !next && onClose()} direction="bottom" anchor={left ? 'end' : 'start'} bounce={0.12} visualDuration={0.24}>
        <Menu.Container buttonSize={SEED} menuWidth={width} menuRadius={14} buttonRadius={SEED / 2} className="ctx-bloom border text-foreground" style={{ boxShadow: phase ? '0 8px 24px rgb(0 0 0 / 0.12)' : 'none' }}>
          <Menu.Trigger className="opacity-0"><span className="sr-only">More elements</span></Menu.Trigger>
          <Menu.Content className="flex flex-col" style={{ width: width - 2, boxSizing: 'border-box' }}>
            <div className="flex flex-col p-1.5" style={{ width: width - 2, boxSizing: 'border-box' }}>
              {items.map((it, i) => {
                const off = !!it.disabled;
                const heading = it.section && it.section !== items[i - 1]?.section;
                return (
                  <Fragment key={it.id}>
                  {heading && <div className={`px-2.5 pb-1 text-[11px] font-medium text-muted-foreground ${i ? 'pt-2' : 'pt-1'}`}>{it.section}</div>}
                  <motion.div style={{ pointerEvents: off ? 'none' : undefined }} onMouseEnter={() => setFocus(i)} initial={{ opacity: 0, x: left ? 4 : -4 }} animate={phase ? { opacity: off ? 0.4 : 1, x: 0 } : { opacity: 0, x: left ? 4 : -4 }} transition={{ delay: phase ? 0.04 + 0.02 * i : 0, duration: 0.16, ease: 'easeOut' }}>
                    <Menu.Item disabled={off} className={`${ROW} ${it.danger ? 'ctx-danger' : ''} ${i === focus ? 'bg-accent' : ''}`} onSelect={() => onPick(it)}>
                      {it.icon}
                      <span className="flex-1">{it.label}</span>
                      {it.hint && <span className="text-xs text-muted-foreground">{it.hint}</span>}
                    </Menu.Item>
                  </motion.div>
                  </Fragment>
                );
              })}
            </div>
          </Menu.Content>
        </Menu.Container>
      </Menu.Root>
    </div>,
    document.body,
  );
}

