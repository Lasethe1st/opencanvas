import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Copy01Icon, Delete02Icon, RefreshIcon, Tick02Icon, ViewIcon } from '@hugeicons/core-free-icons';
import { fitBox, rememberSize, sizeOf, type BlockVariant, type PreviewSource } from '../../lib/variant-blocks';
import { useTheme } from '../../lib/theme';

/** `corner-shape` isn't in the CSS typings yet; browsers without it fall back to a plain rounded corner. */
const SQUIRCLE = { cornerShape: 'squircle' } as CSSProperties;
const EASE = [0.23, 1, 0.32, 1] as const;
const SPRING = { type: 'spring', visualDuration: 0.38, bounce: 0.08 } as const;

const BLOCK = { maxW: 340, maxH: 196, minW: 150, minH: 76 };
const THUMB = { maxW: 92, maxH: 56, minW: 56, minH: 40, maxScale: 1 };

type Nat = { w: number; h: number; x: number; y: number };
const icon = (i: Parameters<typeof HugeiconsIcon>[0]['icon'], size = 15) => <HugeiconsIcon icon={i} size={size} strokeWidth={1.8} aria-hidden />;

export interface VariantActions {
  apply?: (id: string) => void | Promise<void>;
  discard?: (id: string) => void | Promise<void>;
  retry?: (id: string) => void | Promise<void>;
  /** Show the variant in place on the real canvas. */
  preview?: (id: string) => void;
  /** Standalone snippets: copy the HTML. */
  copy?: (id: string) => void;
}

/* ───────────────────────── live preview ───────────────────────── */

const SNIPPET_W = 640;

function snippetDoc(html: string, dark: boolean) {
  const fg = dark ? '#ececec' : '#161616';
  return `<!doctype html><html style="color-scheme:${dark ? 'dark' : 'light'}"><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:transparent}body{display:inline-block;padding:22px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:${fg};line-height:1.4}</style></head><body>${html}</body></html>`;
}

/**
 * Draws one variant live. A page variant is the real page with the variant switched on, cropped to the element it replaces;
 * a snippet is its own tiny document. Either way the iframe is measured once it has rendered and reports its natural size.
 */
function LiveFrame({ id, source, fit, nat, onNat }: { id: string; source: PreviewSource; fit: { scale: number; dx: number; dy: number }; nat: Nat | null; onNat: (n: Nat) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const dark = useTheme().resolved === 'dark';
  const iw = source.kind === 'frame' ? source.width : SNIPPET_W;
  const ih = source.kind === 'frame' ? source.height : 1600;

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let tries = 0;
    let timer = 0;
    let lateTimer = 0;
    let ro: ResizeObserver | null = null;
    const read = (): Nat | null => {
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) return null;
      if (source.kind === 'html') {
        const r = doc.body.getBoundingClientRect();
        return r.width > 2 && r.height > 2 ? { x: 0, y: 0, w: Math.ceil(r.width), h: Math.ceil(r.height) } : null;
      }
      const el = doc.querySelector(`[data-oc-id="${source.elementId.replace(/"/g, '\\"')}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2 ? { x: r.left + win.scrollX, y: r.top + win.scrollY, w: Math.ceil(r.width), h: Math.ceil(r.height) } : null;
    };
    const settle = () => {
      const n = read();
      if (n) {
        onNat(n);
        const doc = frame.contentDocument;
        const watched = source.kind === 'html' ? doc?.body : doc?.querySelector(`[data-oc-id="${(source as { elementId: string }).elementId}"]`);
        if (watched && typeof ResizeObserver !== 'undefined' && !ro) {
          const view = frame.contentWindow as (Window & { ResizeObserver?: typeof ResizeObserver }) | null;
          ro = new (view?.ResizeObserver ?? ResizeObserver)(() => { const m = read(); if (m) onNat(m); });
          ro.observe(watched as Element);
        }
        // Pages animate in; look again once they have settled so the crop lands on the final position.
        if (!lateTimer) lateTimer = window.setTimeout(() => { const m = read(); if (m) onNat(m); lateTimer = window.setTimeout(() => { const k = read(); if (k) onNat(k); }, 900); }, 500);
        return;
      }
      // The page is still hydrating, or the element hasn't mounted yet.
      if (++tries > 45) {
        onNat({ x: 0, y: 0, w: Math.min(iw, 640), h: Math.min(ih, 420) });
        return;
      }
      timer = window.setTimeout(settle, 90);
    };
    const onLoad = () => { tries = 0; window.clearTimeout(timer); settle(); };
    frame.addEventListener('load', onLoad);
    if (frame.contentDocument?.readyState === 'complete') onLoad();
    return () => {
      frame.removeEventListener('load', onLoad);
      window.clearTimeout(timer);
      window.clearTimeout(lateTimer);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, source.kind === 'frame' ? source.url : (source as { html: string }).html, dark]);

  const n = nat ?? { x: 0, y: 0, w: 0, h: 0 };
  const frameStyle: CSSProperties = {
    position: 'absolute', left: 0, top: 0, width: iw, height: ih, border: 0, background: 'transparent', pointerEvents: 'none',
    transformOrigin: '0 0', transform: `translate(${-n.x * fit.scale}px, ${-n.y * fit.scale}px) scale(${fit.scale})`,
  };
  // The crop is clipped to the element itself, so neighbouring page content never shows in the block's padding.
  return (
    <div aria-hidden style={{ position: 'absolute', left: fit.dx, top: fit.dy, width: n.w * fit.scale, height: n.h * fit.scale, overflow: 'hidden', opacity: nat ? 1 : 0, transition: 'opacity 0.18s ease-out' }}>
      {source.kind === 'frame' ? (
        <iframe ref={ref} src={source.url} title="Variant preview" tabIndex={-1} style={frameStyle} sandbox="allow-scripts allow-same-origin allow-forms" />
      ) : (
        <iframe ref={ref} srcDoc={snippetDoc(source.html, dark)} title="Variant preview" tabIndex={-1} style={frameStyle} sandbox="allow-same-origin" />
      )}
    </div>
  );
}

/** One preview in a box sized to its content. Shared by the block, the dialog and the thumbnails. */
function Stage({ v, box, className, style, children, onMeasured }: { v: BlockVariant; box: Parameters<typeof fitBox>[1]; className?: string; style?: CSSProperties; children?: ReactNode; onMeasured?: () => void }) {
  const [nat, setNat] = useState<Nat | null>(() => {
    return sizeOf(v.id);
  });
  const natRef = useRef<Nat | null>(nat);
  const onNat = useCallback((n: Nat) => {
    const prev = natRef.current;
    if (prev && prev.w === n.w && prev.h === n.h && prev.x === n.x && prev.y === n.y) return;
    natRef.current = n;
    rememberSize(v.id, n);
    setNat(n);
    onMeasured?.();
  }, [v.id, onMeasured]);
  const fit = fitBox(nat ?? (sizeOf(v.id) ?? null), box);
  const dark = useTheme().resolved === 'dark';
  const plate = v.source?.kind === 'html' ? (dark ? '#1b1b1d' : '#ffffff') : undefined;
  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', width: fit.w, height: fit.h, background: plate, ...style }}>
      {v.source && <LiveFrame id={v.id} source={v.source} fit={fit} nat={nat} onNat={onNat} />}
      {children}
    </div>
  );
}

/* ───────────────────────── a block ───────────────────────── */

function Shimmer() {
  return <div aria-hidden className="vb-shimmer absolute inset-0" />;
}

function Block({ v, index, hidden, onOpen, actions }: { v: BlockVariant; index: number; hidden: boolean; onOpen: () => void; actions: VariantActions }) {
  const failed = v.status === 'failed' || v.status === 'stale';
  const ready = v.status === 'ready' && !!v.source;
  const letter = String.fromCharCode(65 + index);
  const [, setTick] = useState(0);
  const remeasured = useCallback(() => setTick((t) => t + 1), []);
  const size = fitBox(sizeOf(v.id), BLOCK);
  return (
    <div role="listitem" className="vb-item" style={{ scrollSnapAlign: 'start', flex: '0 0 auto', width: size.w }}>
      <div className="relative" style={{ width: size.w, height: size.h }}>
        {!hidden && (
          <motion.button
            type="button"
            layoutId={`vb-${v.id}`}
            layout="position"
            onClick={ready ? onOpen : undefined}
            disabled={!ready}
            aria-label={`${v.label} — open`}
            className="vb-block group absolute inset-0 block cursor-pointer border border-foreground/10 bg-muted/40 p-0 text-left outline-none transition-[box-shadow,transform] focus-visible:ring-2 focus-visible:ring-foreground/40 enabled:hover:shadow-[0_6px_20px_rgb(0_0_0/0.12)] enabled:active:scale-[0.985] disabled:cursor-default"
            style={{ borderRadius: 24, ...SQUIRCLE, overflow: 'hidden' }}
            whileTap={ready ? { scale: 0.985 } : undefined}
            transition={SPRING}
          >
            {ready ? (
              <Stage v={v} box={BLOCK} onMeasured={remeasured} style={{ position: 'absolute', left: 0, top: 0 }} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                {v.status === 'generating' ? <Shimmer /> : <span className="px-4 text-center">{v.error || 'This variant didn’t finish'}</span>}
              </div>
            )}
          </motion.button>
        )}
        {failed && actions.retry && (
          <button type="button" onClick={() => void actions.retry?.(v.id)} className="vb-retry absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background px-2.5 py-1 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-foreground/40">
            {icon(RefreshIcon, 13)} {v.status === 'stale' ? 'Regenerate' : 'Retry'}
          </button>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 px-1 text-xs text-foreground">
        <span className="grid size-4 shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">{letter}</span>
        <span className="truncate">{v.label}</span>
      </div>
    </div>
  );
}

/* ───────────────────────── the row ───────────────────────── */

/** A row of rounded blocks that scrolls sideways. Click one and it opens into a dialog with a thumbnail track to flip between the rest. */
export function VariantRow({ items, actions = {}, className, pad = 0 }: { items: BlockVariant[]; actions?: VariantActions; className?: string; pad?: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((v) => v.id === openId) ?? null;
  // A discarded variant takes the dialog with it.
  useEffect(() => { if (openId && !items.some((v) => v.id === openId)) setOpenId(null); }, [items, openId]);
  return (
    <LayoutGroup id={`vb-${items[0]?.id ?? 'x'}`}>
      <div className={`vb ${className ?? ''}`} data-tw="">
        <div
          role="list"
          aria-label="Variants"
          className="vb-row flex items-start gap-3 overflow-x-auto overscroll-x-contain pb-2"
          style={{ scrollSnapType: 'x proximity', scrollbarWidth: 'thin', paddingInline: pad }}
          tabIndex={items.length > 1 ? 0 : undefined}
        >
          {items.map((v, i) => (
            <Block key={v.id} v={v} index={i} hidden={openId === v.id} onOpen={() => setOpenId(v.id)} actions={actions} />
          ))}
        </div>
      </div>
      <VariantDialog items={items} openId={open ? open.id : null} setOpenId={setOpenId} actions={actions} />
    </LayoutGroup>
  );
}

/* ───────────────────────── the dialog ───────────────────────── */

function VariantDialog({ items, openId, setOpenId, actions }: { items: BlockVariant[]; openId: string | null; setOpenId: (id: string | null) => void; actions: VariantActions }) {
  const ready = useMemo(() => items.filter((v) => v.status === 'ready' && v.source), [items]);
  const current = ready.find((v) => v.id === openId) ?? null;
  const index = current ? ready.indexOf(current) : -1;
  const trackRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const close = useCallback(() => setOpenId(null), [setOpenId]);
  const go = useCallback((step: number) => {
    if (!ready.length) return;
    setOpenId(ready[(index + step + ready.length) % ready.length].id);
  }, [index, ready, setOpenId]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current, close, go]);

  // Keep the active thumbnail in view.
  useLayoutEffect(() => {
    trackRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [openId]);

  const big = { maxW: Math.min(760, vp.w - 56), maxH: Math.max(220, Math.min(560, vp.h - 270)), minW: 220, minH: 160, maxScale: 1.4 };
  const panelW = Math.min(vp.w - 32, Math.max(360, fitBox(current ? sizeOf(current.id) : null, big).w + 32));

  return createPortal(
    <AnimatePresence>
      {current && (
        <motion.div
          key="vb-overlay"
          data-tw=""
          data-ctx-shell=""
          data-vb-dialog=""
          className="vb fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 500 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16, ease: EASE } }}
          transition={{ duration: 0.2, ease: EASE }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" onPointerDown={close} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label={`${current.label}`} className="relative flex max-h-full flex-col items-center gap-3" style={{ width: panelW }}>
            <motion.div
              key={current.id}
              layoutId={`vb-${current.id}`}
              transition={SPRING}
              className="relative max-w-full border border-foreground/10 bg-background p-0 shadow-[0_24px_64px_rgb(0_0_0/0.35)]"
              style={{ borderRadius: 28, ...SQUIRCLE, overflow: 'hidden' }}
            >
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14, duration: 0.18, ease: EASE }}>
                <Stage v={current} box={big} />
              </motion.div>
              <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full border border-foreground/10 bg-background/85 text-foreground outline-none backdrop-blur hover:bg-background focus-visible:ring-2 focus-visible:ring-foreground/40">
                {icon(Cancel01Icon, 15)}
              </button>
            </motion.div>

            <motion.div className="flex w-full flex-col items-center gap-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }} transition={{ delay: 0.1, duration: 0.24, ease: EASE }}>
              <div className="flex w-full max-w-full flex-col items-center gap-0.5 text-center">
                <div className="text-sm font-medium text-white drop-shadow">{current.label}</div>
                {current.notes && <div className="max-w-[56ch] text-xs text-white/75">{current.notes}</div>}
              </div>

              <div className="flex max-w-full items-center gap-2 rounded-full border border-foreground/10 bg-background/90 p-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.2)] backdrop-blur">
                {actions.apply && (
                  <button type="button" onClick={() => void actions.apply?.(current.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background outline-none transition-transform active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-foreground/50">
                    {icon(Tick02Icon)} Apply
                  </button>
                )}
                {actions.preview && (
                  <button type="button" onClick={() => { actions.preview?.(current.id); close(); }} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm text-foreground outline-none transition-[background-color,transform] hover:bg-accent active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-foreground/40">
                    {icon(ViewIcon)} Preview on canvas
                  </button>
                )}
                {actions.copy && (
                  <button type="button" onClick={() => actions.copy?.(current.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm text-foreground outline-none transition-[background-color,transform] hover:bg-accent active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-foreground/40">
                    {icon(Copy01Icon)} Copy HTML
                  </button>
                )}
                {actions.discard && (
                  <button type="button" onClick={() => void actions.discard?.(current.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm text-[color:var(--destructive)] outline-none transition-[background-color,transform] hover:bg-[color:var(--destructive)]/10 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[color:var(--destructive)]/50">
                    {icon(Delete02Icon)} Discard
                  </button>
                )}
              </div>

              {ready.length > 1 && (
                <div ref={trackRef} role="tablist" aria-label="All variants" className="vb-track flex max-w-full items-center gap-2 overflow-x-auto rounded-[22px] border border-foreground/10 bg-background/85 p-2 backdrop-blur" style={{ ...SQUIRCLE, scrollbarWidth: 'none' }}>
                  {ready.map((v, i) => {
                    const on = v.id === current.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        aria-current={on ? 'true' : undefined}
                        aria-label={`${String.fromCharCode(65 + i)}: ${v.label}`}
                        title={v.label}
                        onClick={() => setOpenId(v.id)}
                        className={`relative shrink-0 border-0 bg-transparent p-0 outline-none transition-[transform,opacity] focus-visible:ring-2 focus-visible:ring-foreground/50 ${on ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                        style={{ borderRadius: 14, ...SQUIRCLE, boxShadow: on ? '0 0 0 2px var(--foreground, currentColor)' : '0 0 0 1px rgb(127 127 127 / 0.25)' }}
                      >
                        <Stage v={v} box={THUMB} style={{ borderRadius: 14, ...SQUIRCLE }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
