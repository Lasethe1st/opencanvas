import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { chooseImageForSelection, setFontFamily, setStyle, setStyles } from '../../lib/actions';
import { editSelectedText } from '../../lib/inline-edit';
import { useStore, type Selection } from '../../lib/store';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ArrowDown01Icon, Tick02Icon, AlignHorizontalSpaceAroundIcon, Edit02Icon, FitToScreenIcon, FrameIcon, ImageUploadIcon, PaintBucketIcon, Resize01Icon, SquareRoundCornerIcon, TextAlignLeft01Icon, TextColorIcon, TextFontIcon, TextIcon } from '@hugeicons/core-free-icons';
import { TextAlignCenter, TextAlignLeft, TextAlignRight } from '../../lib/hugeicons';
import { createPortal } from 'react-dom';
import { Menu } from 'bloom-menu';
import { MergeLayer, radiusOf, type MergeBox } from '../MergeLayer';

/* ───────── What each kind of element offers ───────── */

type Kind = 'text' | 'box' | 'image' | 'button';
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'label', 'li', 'strong', 'em', 'small', 'blockquote']);
const kindOf = (tag: string): Kind => (tag === 'img' ? 'image' : tag === 'button' ? 'button' : TEXT_TAGS.has(tag) ? 'text' : 'box');

type PillId = 'edit' | 'font' | 'size' | 'color' | 'align' | 'padding' | 'margin' | 'box-size' | 'fill' | 'corners' | 'replace' | 'fit' | 'label-color';
const LAYOUT: Record<Kind, { left: PillId[]; right: PillId[] }> = {
  text: { left: ['edit', 'font', 'size'], right: ['color', 'align'] },
  box: { left: ['padding', 'margin', 'box-size'], right: ['fill', 'corners'] },
  image: { left: ['replace', 'fit'], right: ['corners'] },
  button: { left: ['edit', 'fill'], right: ['label-color', 'corners'] },
};
const META: Record<PillId, { label: string; icon: IconSvgElement }> = {
  edit: { label: 'Edit', icon: Edit02Icon },
  font: { label: 'Font', icon: TextFontIcon },
  size: { label: 'Size', icon: TextIcon },
  color: { label: 'Colour', icon: TextColorIcon },
  align: { label: 'Align', icon: TextAlignLeft01Icon },
  padding: { label: 'Spacing', icon: AlignHorizontalSpaceAroundIcon },
  margin: { label: 'Margin', icon: FrameIcon },
  'box-size': { label: 'Size', icon: Resize01Icon },
  fill: { label: 'Fill', icon: PaintBucketIcon },
  corners: { label: 'Corners', icon: SquareRoundCornerIcon },
  replace: { label: 'Replace', icon: ImageUploadIcon },
  fit: { label: 'Fit', icon: FitToScreenIcon },
  'label-color': { label: 'Text', icon: TextColorIcon },
};

/* ───────── Values ───────── */

const px = (v: string | undefined, fallback = 0) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : fallback;
};

function toHex(css: string | undefined): string {
  const m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(css ?? '');
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

const FONTS = [
  ['Inter', 'Inter, system-ui, sans-serif'],
  ['System', 'system-ui, sans-serif'],
  ['Georgia', 'Georgia, serif'],
  ['Baskerville', "'Libre Baskerville', Georgia, serif"],
  ['Mono', 'ui-monospace, SFMono-Regular, monospace'],
] as const;

const ALIGNS = ['left', 'center', 'right'] as const;
const ALIGN_ICON = { left: TextAlignLeft, center: TextAlignCenter, right: TextAlignRight } as const;

const PillIcon = ({ icon }: { icon: IconSvgElement }) => <HugeiconsIcon icon={icon} size={18} strokeWidth={1.8} className="dockpill__icon" />;

/**
 * A number you change in place: type into it (Enter/blur commits, Esc reverts), scroll over it, or drag
 * left/right on the pill. Shift steps ×10.
 */
function Scrub({ value, min = 0, step = 1, unit = 'px', onChange, label, icon }: { value: number; min?: number; step?: number; unit?: string; onChange: (n: number) => void; label: string; icon?: IconSvgElement }) {
  const [draft, setDraft] = useState(String(value));
  const live = useRef(value);
  const wrap = useRef<HTMLLabelElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<number | null>(null);
  useEffect(() => {
    live.current = value;
    setDraft(String(value));
  }, [value]);
  const nudge = (n: number) => {
    const next = Math.max(min, Math.round(n * 10) / 10);
    live.current = next;
    setDraft(String(next));
    // Coalesce wheel/drag bursts into one edit.
    if (pending.current != null) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      pending.current = null;
      if (live.current !== value) onChange(live.current);
    }, 220);
  };
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? -e.deltaY : e.deltaX) > 0 ? 1 : -1;
      nudge(live.current + dir * step * (e.shiftKey ? 10 : 1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isFinite(n) && Math.max(min, n) !== value) onChange(Math.max(min, n));
    else setDraft(String(value));
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.target === input.current || e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const v0 = live.current;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      document.body.style.cursor = 'ew-resize';
      nudge(v0 + Math.round(dx / 4) * step * (ev.shiftKey ? 10 : 1));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      if (!moved) input.current?.select();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <label ref={wrap} className="dockpill__scrub" title={`${label}: drag, scroll or type`} onPointerDown={onPointerDown}>
      {icon && <PillIcon icon={icon} />}
      <input
        ref={input}
        aria-label={label}
        inputMode="decimal"
        style={{ width: `${Math.min(6, Math.max(1, draft.length)) + 0.4}ch` }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            setDraft(String(value));
            e.currentTarget.value = String(value);
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(live.current + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
          }
        }}
      />
      <span className="dockpill__unit">{unit}</span>
    </label>
  );
}

/** The pill is the swatch: clicking anywhere on it opens the colour picker; the change lands when the picker closes. */
function Swatch({ value, label, text, onCommit }: { value: string; label: string; text: string; onCommit: (hex: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => el.value !== value && onCommit(el.value);
    el.addEventListener('change', on);
    return () => el.removeEventListener('change', on);
  }, [onCommit, value]);
  return (
    <label className="dockpill__main dockpill__colour" title={`${label} ${value}`}>
      <span className="dockpill__chip" style={{ background: value }} />
      <span className="dockpill__label">{text}</span>
      <input ref={ref} type="color" aria-label={label} defaultValue={value} key={value} className="dockpill__picker" />
    </label>
  );
}

/* ───────── Font: the pill shows the current font; clicking blooms a searchable list ───────── */

const FONT_W = 220;
const fontKey = (v: string) => v.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();

function FontPill({ family, icon }: { family: string | undefined; icon: IconSvgElement }) {
  const name = family?.split(',')[0].replace(/['"]/g, '').trim() || 'Font';
  const current = FONTS.find(([, v]) => fontKey(v) === name.toLowerCase())?.[1] ?? '';
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState(false);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState(0);
  const list = FONTS.filter(([n]) => n.toLowerCase().includes(query.trim().toLowerCase()));
  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    setQuery('');
    setFocus(Math.max(0, FONTS.findIndex(([, v]) => v === current)));
    setAt({ x: r.left, y: r.top - 6 });
    requestAnimationFrame(() => setPhase(true));
  };
  const close = (refocus = true) => {
    setPhase(false);
    window.setTimeout(() => setAt(null), 300);
    if (refocus) btn.current?.focus();
  };
  const choose = (v: string | undefined) => {
    if (v && v !== current) void setFontFamily(v);
    close();
  };
  return (
    <>
      <button ref={btn} type="button" className="dockpill__main" aria-haspopup="listbox" aria-expanded={phase} title={`Font: ${name}`} onClick={() => (phase ? close() : open())}>
        <PillIcon icon={icon} />
        <span className="dockpill__label dockpill__value">{name}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} className="dockpill__caret" />
      </button>
      {at && createPortal(
        <div data-tw="" data-bloom-menu="" onPointerDown={(e) => e.stopPropagation()} style={{ position: 'fixed', top: at.y - 8, left: at.x, width: 8, height: 8, zIndex: 400 }}>
          <Menu.Root open={phase} onOpenChange={(next) => !next && close(false)} direction="top" anchor="start" bounce={0.12} visualDuration={0.26}>
            <Menu.Container buttonSize={8} menuWidth={FONT_W} menuRadius={16} buttonRadius={4} className="ctx-bloom border text-foreground" style={{ boxShadow: phase ? '0 8px 24px rgb(0 0 0 / 0.12)' : 'none' }}>
              <Menu.Trigger className="opacity-0"><span className="sr-only">Fonts</span></Menu.Trigger>
              <Menu.Content className="flex flex-col" style={{ width: FONT_W - 2, boxSizing: 'border-box' }}>
                <div className="flex flex-col p-1.5" style={{ width: FONT_W - 2, boxSizing: 'border-box' }}>
                  <input
                    autoFocus
                    className="font-bloom__search"
                    placeholder="Search fonts…"
                    aria-label="Search fonts"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setFocus(0); }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (list.length) setFocus((f) => (f + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length);
                      } else if (e.key === 'Enter') { e.preventDefault(); if (list[focus]) choose(list[focus][1]); }
                      else if (e.key === 'Escape') { e.preventDefault(); close(); }
                    }}
                  />
                  <div role="listbox" aria-label="Fonts" className="font-bloom__list" style={{ height: Math.min(220, FONTS.length * 32) }}>
                    {list.map(([n, v], i) => (
                      <div
                        key={n}
                        role="option"
                        aria-selected={v === current}
                        className={`font-bloom__item${i === focus ? ' is-focused' : ''}`}
                        style={{ fontFamily: v }}
                        onMouseEnter={() => setFocus(i)}
                        onClick={() => choose(v)}
                      >
                        <span className="flex-1 truncate">{n}</span>
                        {v === current && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />}
                      </div>
                    ))}
                    {!list.length && <div className="font-bloom__empty">No matches</div>}
                  </div>
                </div>
              </Menu.Content>
            </Menu.Container>
          </Menu.Root>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ───────── One pill: the pill is the control ───────── */

function PillBody({ id, sel }: { id: PillId; sel: Selection }) {
  const c = sel.computed;
  const meta = META[id];
  switch (id) {
    case 'edit':
      return (
        <button type="button" className="dockpill__main" onClick={editSelectedText}>
          <PillIcon icon={meta.icon} />
          <span className="dockpill__label">{meta.label}</span>
        </button>
      );
    case 'replace':
      return (
        <button type="button" className="dockpill__main" onClick={() => void chooseImageForSelection()}>
          <PillIcon icon={meta.icon} />
          <span className="dockpill__label">{meta.label}</span>
        </button>
      );
    case 'font':
      return <FontPill family={c['font-family']} icon={meta.icon} />;
    case 'size':
      return <Scrub label="Font size" icon={meta.icon} value={px(c['font-size'], 16)} min={6} onChange={(n) => void setStyle('font-size', `${n}px`)} />;
    case 'padding':
      return <Scrub label="Spacing inside" icon={meta.icon} value={px(c['padding-top'])} step={4} onChange={(n) => void setStyle('padding', `${n}px`)} />;
    case 'margin':
      return <Scrub label="Spacing outside" icon={meta.icon} value={px(c['margin-top'])} step={4} onChange={(n) => void setStyle('margin', `${n}px`)} />;
    case 'corners':
      return <Scrub label="Corner radius" icon={meta.icon} value={px(c['border-radius'])} step={2} onChange={(n) => void setStyle('border-radius', `${n}px`)} />;
    case 'box-size':
      return (
        <span className="dockpill__pair">
          <Scrub label="Width" icon={meta.icon} unit="w" value={Math.round(px(c.width))} step={10} min={1} onChange={(n) => void setStyles({ width: `${n}px` }, 'Set width')} />
          <Scrub label="Height" unit="h" value={Math.round(px(c.height))} step={10} min={1} onChange={(n) => void setStyles({ height: `${n}px` }, 'Set height')} />
        </span>
      );
    case 'color':
    case 'label-color':
      return <Swatch label="Text colour" text={meta.label} value={toHex(c.color)} onCommit={(hex) => void setStyle('color', hex)} />;
    case 'fill':
      return <Swatch label="Fill colour" text={meta.label} value={toHex(c['background-color'])} onCommit={(hex) => void setStyle('background-color', hex)} />;
    case 'align': {
      const cur = (ALIGNS as readonly string[]).includes(c['text-align'] ?? '') ? (c['text-align'] as (typeof ALIGNS)[number]) : c['text-align'] === 'end' ? 'right' : 'left';
      const next = ALIGNS[(ALIGNS.indexOf(cur) + 1) % ALIGNS.length];
      const Icon = ALIGN_ICON[cur];
      return (
        <button type="button" className="dockpill__main" aria-label={`Align ${cur}; click for ${next}`} title={`Align: ${cur} (click for ${next})`} onClick={() => void setStyle('text-align', next)}>
          <Icon size={18} />
          <span className="dockpill__label">{cur === 'center' ? 'Centre' : cur[0].toUpperCase() + cur.slice(1)}</span>
        </button>
      );
    }
    case 'fit':
      return (
        <label className="dockpill__main dockpill__select" title="Image fit">
          <PillIcon icon={meta.icon} />
          <select aria-label="Image fit" value={c['object-fit'] || 'fill'} onChange={(e) => void setStyle('object-fit', e.target.value)} onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}>
            {['cover', 'contain', 'fill', 'none'].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
      );
  }
}

function Pill({ id, sel, side, leaving }: { id: PillId; sel: Selection; side: 'left' | 'right'; leaving: boolean }) {
  return (
    <div className={`dockpill dockpill--${side} dockpill--${id}${leaving ? ' is-leaving' : ''}`} data-goo>
      <PillBody id={id} sel={sel} />
    </div>
  );
}

/* ───────── The row: pills · dock · pills, fused by a goo layer ───────── */

type Blob = MergeBox;

/** The pills grow out of the dock when something is selected and melt back into it when it isn't. */
export function DockRow({ children, tucked = false }: { children: ReactNode; tucked?: boolean }) {
  const picked = useStore((s) => s.selection);
  // While you chat in the dock the pills melt back into it.
  const sel = tucked ? null : picked;
  const row = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Selection | null>(sel);
  const [leaving, setLeaving] = useState(false);
  const [blobs, setBlobs] = useState<Blob[]>([]);

  // Keep the last selection around while the pills melt away.
  useEffect(() => {
    if (sel) {
      setShown(sel);
      setLeaving(false);
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = window.setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, 280);
    return () => window.clearTimeout(t);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const kind = shown ? kindOf(shown.tag) : null;

  // Mirror the real shapes into the goo layer, frame by frame while anything is moving.
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    let raf = 0;
    let still = 0;
    let last = '';
    const measure = () => {
      const box = el.getBoundingClientRect();
      const next: Blob[] = [];
      for (const n of el.querySelectorAll<HTMLElement>('[data-goo], [data-slot="shapeshift-shell"]')) {
        const r = n.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(n);
        next.push({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, r: radiusOf(cs, r.width, r.height), o: parseFloat(cs.opacity) });
      }
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        still = 0;
        setBlobs(next);
      } else still++;
      raf = still > 20 ? 0 : requestAnimationFrame(measure);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(measure);
      still = 0;
    };
    wake();
    const ro = new ResizeObserver(wake);
    ro.observe(el);
    const mo = new MutationObserver(wake);
    mo.observe(el, { childList: true, subtree: true, attributes: true });
    for (const ev of ['transitionrun', 'animationstart', 'focusin', 'pointerdown'] as const) el.addEventListener(ev, wake);
    window.addEventListener('resize', wake);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      for (const ev of ['transitionrun', 'animationstart', 'focusin', 'pointerdown'] as const) el.removeEventListener(ev, wake);
      window.removeEventListener('resize', wake);
    };
  }, []);

  const set = shown && kind ? LAYOUT[kind] : null;
  const pill = (id: PillId, side: 'left' | 'right') => (
    <Pill key={`${shown!.id}:${id}`} id={id} sel={shown!} side={side} leaving={leaving} />
  );

  return (
    <div className="dockrow" ref={row} onPointerDown={(e) => e.stopPropagation()}>
      <div className="dockrow__goo" aria-hidden>
        <MergeLayer boxes={blobs} />
      </div>
      {set && <div className="dockrow__side dockrow__side--left" role="toolbar" aria-label="Change the selected element">{set.left.map((id) => pill(id, 'left'))}</div>}
      {children}
      {set && <div className="dockrow__side dockrow__side--right" role="toolbar" aria-label="More changes">{set.right.map((id) => pill(id, 'right'))}</div>}
    </div>
  );
}
