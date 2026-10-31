import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { chooseImageForSelection, setFontFamily, setStyle, setStyles } from '../../lib/actions';
import { editSelectedText } from '../../lib/inline-edit';
import { useStore, type Selection } from '../../lib/store';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { AlignHorizontalSpaceAroundIcon, Edit02Icon, FitToScreenIcon, FrameIcon, ImageUploadIcon, PaintBucketIcon, Resize01Icon, SquareRoundCornerIcon, TextAlignLeft01Icon, TextColorIcon, TextFontIcon, TextIcon } from '@hugeicons/core-free-icons';
import { TextAlignCenter, TextAlignLeft, TextAlignRight } from '../../lib/hugeicons';
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
const META: Record<PillId, { label: string; icon: IconSvgElement; action?: boolean }> = {
  edit: { label: 'Edit', icon: Edit02Icon, action: true },
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

/* ───────── Small controls (they live inside an expanded pill) ───────── */

const px = (v: string | undefined, fallback = 0) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : fallback;
};

function toHex(css: string | undefined): string {
  const m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(css ?? '');
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

function Stepper({ value, min = 0, step = 1, unit = 'px', onChange, label }: { value: number; min?: number; step?: number; unit?: string; onChange: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n !== value) onChange(Math.max(min, n));
    else setDraft(String(value));
  };
  return (
    <span className="dockpill__ctl" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <input aria-label={label} inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())} />
      <span className="dockpill__unit">{unit}</span>
      <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(value + step)}>+</button>
    </span>
  );
}

function ColorControl({ value, label, onCommit }: { value: string; label: string; onCommit: (hex: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => onCommit(el.value);
    el.addEventListener('change', on); // fires when the picker closes, not on every drag
    return () => el.removeEventListener('change', on);
  }, [onCommit]);
  return (
    <span className="dockpill__ctl">
      <input ref={ref} type="color" aria-label={label} defaultValue={value} key={value} className="dockpill__swatch" />
      <code>{value}</code>
    </span>
  );
}

const FONTS = [
  ['Inter', 'Inter, system-ui, sans-serif'],
  ['System', 'system-ui, sans-serif'],
  ['Georgia', 'Georgia, serif'],
  ['Baskerville', "'Libre Baskerville', Georgia, serif"],
  ['Mono', 'ui-monospace, SFMono-Regular, monospace'],
] as const;

function Control({ id, sel }: { id: PillId; sel: Selection }) {
  const c = sel.computed;
  switch (id) {
    case 'font': {
      const current = FONTS.find(([, v]) => c['font-family']?.toLowerCase().startsWith(v.split(',')[0].replace(/['"]/g, '').toLowerCase()))?.[1] ?? '';
      return (
        <span className="dockpill__ctl">
          <select aria-label="Font" value={current} onChange={(e) => e.target.value && void setFontFamily(e.target.value)}>
            {!current && <option value="">{c['font-family']?.split(',')[0].replace(/['"]/g, '') || 'Font'}</option>}
            {FONTS.map(([n, v]) => (
              <option key={n} value={v}>{n}</option>
            ))}
          </select>
        </span>
      );
    }
    case 'size':
      return <Stepper label="Font size" value={px(c['font-size'], 16)} min={6} onChange={(n) => void setStyle('font-size', `${n}px`)} />;
    case 'color':
      return <ColorControl label="Text colour" value={toHex(c.color)} onCommit={(hex) => void setStyle('color', hex)} />;
    case 'label-color':
      return <ColorControl label="Text colour" value={toHex(c.color)} onCommit={(hex) => void setStyle('color', hex)} />;
    case 'fill':
      return <ColorControl label="Fill colour" value={toHex(c['background-color'])} onCommit={(hex) => void setStyle('background-color', hex)} />;
    case 'align':
      return (
        <span className="dockpill__ctl" role="radiogroup" aria-label="Alignment">
          {([['left', <TextAlignLeft key="l" size={15} />], ['center', <TextAlignCenter key="c" size={15} />], ['right', <TextAlignRight key="r" size={15} />]] as const).map(([v, icon]) => (
            <button key={v} type="button" role="radio" aria-checked={c['text-align'] === v} aria-label={`Align ${v}`} className={c['text-align'] === v ? 'is-on' : undefined} onClick={() => void setStyle('text-align', v)}>
              {icon}
            </button>
          ))}
        </span>
      );
    case 'padding':
      return <Stepper label="Spacing inside" value={px(c['padding-top'])} step={4} onChange={(n) => void setStyle('padding', `${n}px`)} />;
    case 'margin':
      return <Stepper label="Spacing outside" value={px(c['margin-top'])} step={4} onChange={(n) => void setStyle('margin', `${n}px`)} />;
    case 'corners':
      return <Stepper label="Corner radius" value={px(c['border-radius'])} step={2} onChange={(n) => void setStyle('border-radius', `${n}px`)} />;
    case 'box-size':
      return (
        <span className="dockpill__ctl">
          <Stepper label="Width" unit="w" value={Math.round(px(c.width))} step={10} min={1} onChange={(n) => void setStyles({ width: `${n}px` }, 'Set width')} />
          <Stepper label="Height" unit="h" value={Math.round(px(c.height))} step={10} min={1} onChange={(n) => void setStyles({ height: `${n}px` }, 'Set height')} />
        </span>
      );
    case 'fit':
      return (
        <span className="dockpill__ctl">
          <select aria-label="Image fit" value={c['object-fit'] || 'fill'} onChange={(e) => void setStyle('object-fit', e.target.value)}>
            {['cover', 'contain', 'fill', 'none'].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </span>
      );
    default:
      return null;
  }
}

/* ───────── One pill ───────── */

function Pill({ id, sel, open, onToggle, side, leaving }: { id: PillId; sel: Selection; open: boolean; onToggle: () => void; side: 'left' | 'right'; leaving: boolean }) {
  const meta = META[id];
  const run = () => {
    if (id === 'edit') editSelectedText();
    else if (id === 'replace') void chooseImageForSelection();
  };
  return (
    <div className={`dockpill dockpill--${side}${open ? ' is-open' : ''}${leaving ? ' is-leaving' : ''}`} data-goo>
      <button type="button" className="dockpill__main" aria-expanded={meta.action ? undefined : open} onClick={meta.action ? run : onToggle}>
        <HugeiconsIcon icon={meta.icon} size={18} strokeWidth={1.8} className="dockpill__icon" />
        <span className="dockpill__label">{meta.label}</span>
      </button>
      {!meta.action && (
        <div className="dockpill__reveal" aria-hidden={!open} inert={!open}>
          <div className="dockpill__inner">{open && <Control id={id} sel={sel} />}</div>
        </div>
      )}
    </div>
  );
}

/* ───────── The row: pills · dock · pills, fused by a goo layer ───────── */

type Blob = MergeBox;

/** The pills grow out of the dock when something is selected and melt back into it when it isn't. */
export function DockRow({ children }: { children: ReactNode }) {
  const sel = useStore((s) => s.selection);
  const row = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Selection | null>(sel);
  const [leaving, setLeaving] = useState(false);
  const [open, setOpen] = useState<PillId | null>(null);
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
    setOpen(null);
    const t = window.setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, 280);
    return () => window.clearTimeout(t);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  // A different kind of element closes whatever was open.
  const kind = shown ? kindOf(shown.tag) : null;
  useEffect(() => setOpen(null), [kind, shown?.id]);

  // Esc, or a click anywhere else, folds the open pill back in.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    const onDown = (e: PointerEvent) => {
      if (!row.current?.querySelector('.dockpill.is-open')?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

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
    <Pill key={`${shown!.id}:${id}`} id={id} sel={shown!} open={open === id} onToggle={() => setOpen((cur) => (cur === id ? null : id))} side={side} leaving={leaving} />
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
