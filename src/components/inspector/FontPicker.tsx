import { Check, ChevronDown, Search } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { firstFamily, fontStack, googleFamilyParam, previewWeight, type FontCategory, type GoogleFont } from '../../../shared/fonts';
import { setFontFamily } from '../../lib/actions';
import { loadFontPreview, useGoogleFonts, useProjectFonts } from '../../lib/fonts';
import { cx, InputShell } from '../../ui/primitives.jsx';
import { StyleField } from './fields';
import { useStyleValue } from './useStyleValue';

interface FontOption {
  key: string;
  group: string;
  label: string;
  stack: string;
  category: FontCategory | null;
  font?: GoogleFont;
}

const SYSTEM: [string, string, FontCategory | null][] = [
  ['System UI', 'system-ui, sans-serif', 'sans-serif'],
  ['Arial', 'Arial, Helvetica, sans-serif', 'sans-serif'],
  ['Helvetica', 'Helvetica, Arial, sans-serif', 'sans-serif'],
  ['Verdana', 'Verdana, sans-serif', 'sans-serif'],
  ['Georgia', 'Georgia, serif', 'serif'],
  ['Times New Roman', "'Times New Roman', Times, serif", 'serif'],
  ['Courier New', "'Courier New', monospace", 'monospace'],
  ['Monospace', 'ui-monospace, monospace', 'monospace'],
  ['Inherit', 'inherit', null],
];

const CATEGORIES: { id: FontCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sans-serif', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'handwriting', label: 'Script' },
  { id: 'monospace', label: 'Mono' },
];

const CATEGORY_HINT: Record<FontCategory, string> = {
  'sans-serif': 'Sans',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Script',
  monospace: 'Mono',
};

const MAX_GOOGLE_ROWS = 200;
const MENU_WIDTH = 300;
const MENU_HEIGHT = 400;

function rank(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(' ').some((w) => w.startsWith(q))) return 2;
  return n.includes(q) ? 3 : -1;
}

export function FontMenu({
  anchor,
  current,
  onClose,
  onPick = (stack, google) => void setFontFamily(stack, google),
}: {
  anchor: HTMLElement;
  current: string;
  onClose: (refocus: boolean) => void;
  onPick?: (stack: string, googleFamily?: string) => void;
}) {
  const catalog = useGoogleFonts(true);
  const projectFamilies = useProjectFonts(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FontCategory | 'all'>('all');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const currentFamily = firstFamily(current).toLowerCase();

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const below = window.innerHeight - r.bottom - 8;
    const height = Math.min(MENU_HEIGHT, Math.max(below, r.top - 8) - 4);
    const top = below >= Math.min(MENU_HEIGHT, 280) ? r.bottom + 4 : Math.max(8, r.top - 4 - height);
    setPos({ left, top, width: MENU_WIDTH, height });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !anchor.contains(t)) onClose(false);
    };
    const onBlur = () => onClose(false);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onBlur);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onBlur);
      window.removeEventListener('blur', onBlur);
    };
  }, [anchor, onClose]);

  const { options, googleTotal } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fonts = catalog?.fonts ?? [];
    const byFamily = new Map(fonts.map((f) => [f.family.toLowerCase(), f]));
    const fits = (label: string, cat: FontCategory | null) => (category === 'all' || cat === category) && (!q || rank(label, q) >= 0);
    const list: FontOption[] = [];

    const seen = new Set<string>();
    for (const family of projectFamilies) {
      const font = byFamily.get(family.toLowerCase());
      const cat = font?.category ?? 'sans-serif';
      if (seen.has(family.toLowerCase()) || !fits(family, cat)) continue;
      seen.add(family.toLowerCase());
      list.push({ key: `p:${family}`, group: 'In this project', label: family, stack: fontStack(family, cat), category: cat, font });
    }
    for (const [label, stack, cat] of SYSTEM) {
      if (fits(label, cat) && (category === 'all' || cat)) list.push({ key: `s:${label}`, group: 'System', label, stack, category: cat });
    }
    let google = fonts.filter((f) => !seen.has(f.family.toLowerCase()) && fits(f.family, f.category));
    if (q) google = google.map((f, i) => ({ f, r: rank(f.family, q) * 100000 + i })).sort((a, b) => a.r - b.r).map((x) => x.f);
    for (const f of google.slice(0, MAX_GOOGLE_ROWS)) {
      list.push({ key: `g:${f.family}`, group: 'Google Fonts', label: f.family, stack: fontStack(f.family, f.category), category: f.category, font: f });
    }
    if (q && !list.some((o) => o.label.toLowerCase() === q)) {
      list.push({ key: 'custom', group: 'Custom', label: `Use “${query.trim()}”`, stack: query.trim(), category: null });
    }
    return { options: list, googleTotal: google.length };
  }, [catalog, projectFamilies, query, category]);

  useEffect(() => setActive(0), [query, category]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const byKey = new Map(options.filter((o) => o.font).map((o) => [o.key, o.font!]));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const font = e.isIntersecting && byKey.get((e.target as HTMLElement).dataset.key ?? '');
          if (font) loadFontPreview(font);
        }
      },
      { root: list, rootMargin: '200px 0px' },
    );
    list.querySelectorAll('[data-key]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [options]);

  const pick = (o: FontOption) => {
    onClose(true);
    onPick(o.stack, o.font ? googleFamilyParam(o.font) : undefined);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.max(0, Math.min(options.length - 1, i + step)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[active]) pick(options[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
    }
  };

  let lastGroup: string | null = null;
  return createPortal(
    <div ref={menuRef} className="popover font-menu" style={{ position: 'fixed', ...pos }} role="dialog" aria-label="Choose font" onKeyDown={onKeyDown}>
      <div className="font-menu__search">
        <Search size={13} />
        <input
          autoFocus
          value={query}
          placeholder="Search fonts"
          aria-label="Search fonts"
          role="combobox"
          aria-expanded
          aria-controls="oc-font-list"
          aria-activedescendant={options[active] ? `oc-font-${active}` : undefined}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="font-menu__chips" role="radiogroup" aria-label="Font category">
        {CATEGORIES.map((c) => (
          <button key={c.id} role="radio" aria-checked={category === c.id} className={cx(category === c.id && 'is-active')} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div ref={listRef} id="oc-font-list" className="font-menu__list" role="listbox" aria-label="Fonts">
        {options.map((o, i) => {
          const header = o.group && o.group !== lastGroup ? o.group : null;
          lastGroup = o.group;
          const selected = o.label.toLowerCase() === currentFamily || o.stack === current;
          return (
            <div key={o.key}>
              {header && <div className="font-menu__group">{header}</div>}
              <button
                id={`oc-font-${i}`}
                data-index={i}
                data-key={o.key}
                role="option"
                aria-selected={selected}
                className={cx('font-option', i === active && 'is-focused')}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={() => pick(o)}
              >
                <span className="font-option__name" style={o.key === 'custom' ? undefined : { fontFamily: o.stack, fontWeight: o.font ? previewWeight(o.font) : undefined }}>
                  {o.label}
                </span>
                {o.category && <span className="font-option__hint">{CATEGORY_HINT[o.category]}</span>}
                <span className="font-option__check">{selected && <Check size={13} />}</span>
              </button>
            </div>
          );
        })}
        {!catalog && <div className="font-menu__empty">Loading Google Fonts…</div>}
        {catalog && options.length === 0 && <div className="font-menu__empty">No fonts match “{query}”.</div>}
      </div>
      {catalog && (
        <div className="font-menu__foot">
          {googleTotal > MAX_GOOGLE_ROWS
            ? `Showing ${MAX_GOOGLE_ROWS} of ${googleTotal.toLocaleString()} Google Fonts. Search to find more.`
            : catalog.source === 'bundled'
              ? 'Offline: showing popular Google Fonts.'
              : `${googleTotal.toLocaleString()} Google Fonts`}
        </div>
      )}
    </div>,
    document.body,
  );
}

export function FontPicker({ disabled }: { disabled: boolean }) {
  const value = useStyleValue('font-family');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const catalog = useGoogleFonts(true);
  const name = firstFamily(value.value) || 'Default';

  useEffect(() => {
    const font = catalog?.fonts.find((f) => f.family.toLowerCase() === name.toLowerCase());
    if (font) loadFontPreview(font);
  }, [catalog, name]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);
  const reset = value.state === 'set' ? () => void setFontFamily('') : undefined;

  return (
    <StyleField label="Font" value={value}>
      <InputShell inherited={value.state !== 'set'} onReset={reset}>
        <button
          ref={triggerRef}
          type="button"
          className="font-trigger"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Font: ${name}`}
          title={value.value}
          onClick={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
          }}
        >
          <span style={{ fontFamily: value.value || undefined }}>{name}</span>
        </button>
        {!reset && <ChevronDown size={13} className="input__chevron" />}
      </InputShell>
      {open && triggerRef.current && <FontMenu anchor={triggerRef.current} current={value.value} onClose={close} />}
    </StyleField>
  );
}
