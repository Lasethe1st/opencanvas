import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { BlossomCarousel, type BlossomCarouselHandle } from '@blossom-carousel/react';
import '@blossom-carousel/react/style.css';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { rememberSize, sizeOf, type BlockVariant, type PreviewSource } from '../../lib/variant-blocks';
import { useTheme } from '../../lib/theme';

/** `corner-shape` isn't in the CSS typings yet; browsers without it fall back to a plain rounded corner. */
const SQUIRCLE = { cornerShape: 'squircle' } as CSSProperties;
const EASE = [0.23, 1, 0.32, 1] as const;
const SPRING = { type: 'spring', visualDuration: 0.38, bounce: 0.08 } as const;
/** Every block, and the stage in the dialog, is a landscape rectangle: width : height = 1.5 : 1. */
const RATIO = 1.5;
const GAP = 8;

type Nat = { w: number; h: number; x: number; y: number };

export interface VariantActions {
  /** Use this variant (double-click). For snippets this copies the HTML. */
  apply?: (id: string) => void | Promise<void>;
  /** Only the popup offers this; it shows as a small red button on a block. */
  discard?: (id: string) => void | Promise<void>;
  retry?: (id: string) => void | Promise<void>;
}

/* ───────────────────────── live preview ───────────────────────── */

const SNIPPET_W = 640;

function snippetDoc(html: string, dark: boolean) {
  const fg = dark ? '#ececec' : '#161616';
  return `<!doctype html><html style="color-scheme:${dark ? 'dark' : 'light'}"><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:transparent}body{display:inline-block;padding:22px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:${fg};line-height:1.4}</style></head><body>${html}</body></html>`;
}

/**
 * Draws one variant live. A page variant is the real page with the variant switched on, clipped to the element it replaces;
 * a snippet is its own small document. The iframe is measured once rendered and reports the element's natural size.
 */
function LiveFrame({ id, source, fit, nat, onNat, round }: { id: string; source: PreviewSource; fit: { scale: number; dx: number; dy: number }; nat: Nat | null; onNat: (n: Nat) => void; round: number }) {
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
  // Clipped to the element itself, so neighbouring page content never shows around it.
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', left: fit.dx, top: fit.dy, width: n.w * fit.scale, height: n.h * fit.scale, overflow: 'hidden', borderRadius: round,
        boxShadow: source.kind === 'frame' ? '0 1px 2px rgb(0 0 0 / 0.08), 0 10px 28px rgb(0 0 0 / 0.1)' : undefined,
        opacity: nat ? 1 : 0, transition: 'opacity 0.18s ease-out',
      }}
    >
      {source.kind === 'frame' ? (
        <iframe ref={ref} src={source.url} title="Variant preview" tabIndex={-1} style={frameStyle} sandbox="allow-scripts allow-same-origin allow-forms" />
      ) : (
        <iframe ref={ref} srcDoc={snippetDoc(source.html, dark)} title="Variant preview" tabIndex={-1} style={frameStyle} sandbox="allow-same-origin" />
      )}
    </div>
  );
}

/**
 * Fills its parent (which sets the size) with one variant on a soft plate: the element is scaled to fit whole, centred, with room around it.
 * Shared by the blocks, the dialog and the thumbnails.
 */
function Stage({ v, pad, maxScale = 1.4, round = 8 }: { v: BlockVariant; pad: number; maxScale?: number; round?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [nat, setNat] = useState<Nat | null>(() => sizeOf(v.id));
  const natRef = useRef<Nat | null>(nat);
  const dark = useTheme().resolved === 'dark';

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onNat = useCallback((n: Nat) => {
    const prev = natRef.current;
    if (prev && prev.w === n.w && prev.h === n.h && prev.x === n.x && prev.y === n.y) return;
    natRef.current = n;
    rememberSize(v.id, n);
    setNat(n);
  }, [v.id]);

  const n = nat ?? { w: 320, h: 160, x: 0, y: 0 };
  const scale = Math.max(0.02, Math.min((box.w - pad * 2) / n.w, (box.h - pad * 2) / n.h, maxScale));
  const fit = { scale, dx: (box.w - n.w * scale) / 2, dy: (box.h - n.h * scale) / 2 };
  const plate = dark ? '#1c1c1e' : '#f1f1ef';
  return (
    <div ref={host} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: plate }}>
      {v.source && box.w > 0 && <LiveFrame id={v.id} source={v.source} fit={fit} nat={nat} onNat={onNat} round={round} />}
    </div>
  );
}

/* ───────────────────────── a block ───────────────────────── */

function Block({ v, index, hidden, onOpen, actions }: { v: BlockVariant; index: number; hidden: boolean; onOpen: () => void; actions: VariantActions }) {
  const failed = v.status === 'failed' || v.status === 'stale';
  const ready = v.status === 'ready' && !!v.source;
  return (
    <div role="listitem" data-blossom-slide className="vb-item group relative" style={{ aspectRatio: RATIO, width: 'var(--vb-w)', flex: '0 0 var(--vb-w)', scrollSnapAlign: 'start' }}>
      {!hidden && (
        <motion.button
          type="button"
          layoutId={`vb-${v.id}`}
          layout="position"
          onClick={ready ? onOpen : undefined}
          disabled={!ready}
          aria-label={`Variant ${String.fromCharCode(65 + index)}: ${v.label}`}
          className="vb-block absolute inset-0 block cursor-pointer border border-foreground/10 p-0 text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-foreground/40 enabled:hover:shadow-[0_8px_24px_rgb(0_0_0/0.14)] disabled:cursor-default"
          style={{ borderRadius: 22, ...SQUIRCLE, overflow: 'hidden' }}
          whileTap={ready ? { scale: 0.985 } : undefined}
          transition={SPRING}
        >
          {ready ? (
            <Stage v={v} pad={18} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/40 text-xs text-muted-foreground">
              {v.status === 'generating' ? <div aria-hidden className="vb-shimmer absolute inset-0" /> : <span className="px-4 text-center">{v.error || 'This variant didn’t finish'}</span>}
            </div>
          )}
        </motion.button>
      )}
      {failed && actions.retry && (
        <button type="button" onClick={() => void actions.retry?.(v.id)} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background px-2.5 py-1 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-foreground/40">
          <HugeiconsIcon icon={RefreshIcon} size={13} strokeWidth={1.8} aria-hidden /> {v.status === 'stale' ? 'Regenerate' : 'Retry'}
        </button>
      )}
      {actions.discard && !hidden && v.status !== 'generating' && (
        <button
          type="button"
          onClick={() => void actions.discard?.(v.id)}
          aria-label={`Discard variant ${String.fromCharCode(65 + index)}`}
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-full border border-foreground/10 bg-background/90 text-[color:var(--destructive)] opacity-0 outline-none backdrop-blur transition-opacity hover:bg-[color:var(--destructive)]/10 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[color:var(--destructive)]/50 group-hover:opacity-100"
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} aria-hidden />
        </button>
      )}
    </div>
  );
}

/* ───────────────────────── the row ───────────────────────── */

/**
 * A row of 3:2 blocks on a native-scroll carousel. `per` is how many show at once (a fraction leaves the next one peeking).
 * A soft fade on the right edge says there are more. Click a block to open it in the dialog.
 */
export function VariantRow({ items, actions = {}, per = 3, itemWidth, className, pad = 0 }: { items: BlockVariant[]; actions?: VariantActions; per?: number; itemWidth?: number; className?: string; pad?: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((v) => v.id === openId) ?? null;
  const carousel = useRef<BlossomCarouselHandle>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  // A discarded variant takes the dialog with it.
  useEffect(() => { if (openId && !items.some((v) => v.id === openId)) setOpenId(null); }, [items, openId]);

  useEffect(() => {
    const el = carousel.current?.element as HTMLElement | undefined;
    if (!el) return;
    const read = () => setEdges({ start: el.scrollLeft > 4, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', read); ro.disconnect(); };
  }, [items.length]);

  const width = itemWidth ? `${itemWidth}px` : `calc((100% - ${GAP * Math.max(0, per - 1)}px) / ${per})`;
  return (
    <LayoutGroup id={`vb-${items[0]?.id ?? 'x'}`}>
      <div className={`vb relative ${className ?? ''}`} data-tw="">
        <BlossomCarousel
          ref={carousel}
          as="div"
          role="list"
          aria-label="Variants"
          className="vb-row"
          style={{ display: 'flex', gap: GAP, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', paddingInline: pad, scrollPaddingInline: pad, ['--vb-w' as string]: width }}
        >
          {items.map((v, i) => (
            <Block key={v.id} v={v} index={i} hidden={openId === v.id} onOpen={() => setOpenId(v.id)} actions={actions} />
          ))}
        </BlossomCarousel>
        <div aria-hidden className="vb-fade vb-fade--end" style={{ opacity: edges.end ? 1 : 0 }} />
        <div aria-hidden className="vb-fade vb-fade--start" style={{ opacity: edges.start ? 1 : 0 }} />
      </div>
      <VariantDialog items={items} openId={open ? open.id : null} setOpenId={setOpenId} actions={actions} />
    </LayoutGroup>
  );
}

/* ───────────────────────── the dialog ───────────────────────── */

/** The variant, large on its stage, and the track of thumbnails. Click a thumbnail to see it; double-click to use it. */
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
  const use = useCallback(async (id: string) => {
    close();
    await actions.apply?.(id);
  }, [actions, close]);
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
      else if (e.key === 'Enter') { e.preventDefault(); void use(current.id); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current, close, go, use]);

  // Keep the active thumbnail in view.
  useLayoutEffect(() => {
    trackRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [openId]);

  const stageW = Math.max(280, Math.min(800, vp.w - 48, (vp.h - 170) * RATIO));

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
          <div role="dialog" aria-modal="true" aria-label="Variants" className="relative flex flex-col items-center gap-4" style={{ width: stageW }}>
            <motion.div
              key={current.id}
              layoutId={`vb-${current.id}`}
              transition={SPRING}
              onDoubleClick={() => void use(current.id)}
              className="relative w-full border border-foreground/10 shadow-[0_24px_64px_rgb(0_0_0/0.35)]"
              style={{ aspectRatio: RATIO, borderRadius: 30, ...SQUIRCLE, overflow: 'hidden' }}
            >
              <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14, duration: 0.18, ease: EASE }}>
                <Stage v={current} pad={Math.round(stageW * 0.07)} maxScale={1.6} round={12} />
              </motion.div>
            </motion.div>

            {ready.length > 1 && (
              <motion.div
                ref={trackRef}
                role="tablist"
                aria-label="All variants"
                className="vb-track flex max-w-full items-center gap-2 overflow-x-auto p-1.5"
                style={{ scrollbarWidth: 'none' }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }}
                transition={{ delay: 0.1, duration: 0.24, ease: EASE }}
              >
                {ready.map((v, i) => {
                  const on = v.id === current.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      aria-current={on ? 'true' : undefined}
                      aria-label={`Variant ${String.fromCharCode(65 + i)}: ${v.label}. Double-click to use`}
                      onClick={() => setOpenId(v.id)}
                      onDoubleClick={() => void use(v.id)}
                      className={`relative shrink-0 border-0 bg-transparent p-0 outline-none transition-[transform,opacity,box-shadow] focus-visible:ring-2 focus-visible:ring-white/70 ${on ? 'opacity-100' : 'opacity-65 hover:opacity-100'}`}
                      style={{ width: 96, aspectRatio: RATIO, borderRadius: 14, ...SQUIRCLE, overflow: 'hidden', boxShadow: on ? '0 0 0 2px #fff, 0 6px 16px rgb(0 0 0 / 0.3)' : '0 0 0 1px rgb(255 255 255 / 0.25)', transform: on ? 'scale(1.04)' : undefined }}
                    >
                      <Stage v={v} pad={7} maxScale={1} round={3} />
                    </button>
                  );
                })}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
