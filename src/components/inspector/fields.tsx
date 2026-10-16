import type React from 'react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { evaluateExpression, stepSize, stepValue } from '../../../shared/numeric';
import { setStyle, setStyles } from '../../lib/actions';
import { Field, InputShell, Section as SectionShell, SelectShell, Swatch, ToggleRow } from '../../ui/primitives.jsx';
import { BREAKPOINT_LABEL, normalizeValue, shortValue, toHex, useStyleValue, type StyleValue } from './useStyleValue';

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <SectionShell title={title} open={open} onToggle={() => setOpen((o) => !o)}>
      {children}
    </SectionShell>
  );
}

/** Collapsed-by-default group for the less common controls in a section. */
export function More({ label = 'More', children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`inspector-more${open ? ' is-open' : ''}`}>
      <button type="button" className="inspector-more__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronRight size={12} className="inspector-more__chevron" aria-hidden="true" />
        {label}
      </button>
      {open && <div className="inspector-more__body">{children}</div>}
    </div>
  );
}

export function stateTitle(v: StyleValue): string {
  if (v.state === 'set') return `Set at ${BREAKPOINT_LABEL[v.from!]} breakpoint`;
  if (v.state === 'inherited') return `Inherited from ${BREAKPOINT_LABEL[v.from!]} styles`;
  return 'Computed value from the page (not set by visual edits)';
}

/** A labelled inspector row whose marker shows where the value comes from. */
export function StyleField({ label, value, children }: { label: string; value: StyleValue; children: ReactNode }) {
  return (
    <Field label={<span title={stateTitle(value)}>{label}</span>} state={value.state}>
      {children}
    </Field>
  );
}

export interface NumericOptions {
  /** Step by tenths (opacity, line-height). */
  fine?: boolean;
  /** Unit added when stepping from an empty or keyword value. */
  unit?: string;
}

const STEP_COMMIT_DELAY = 450;

/**
 * Text input that commits on Enter/blur and resyncs when the source value changes. Numeric inputs also
 * evaluate arithmetic (`16/2` → `8`) and step with ArrowUp/ArrowDown (Shift ×10, Alt ×0.1).
 */
export function CommitInput({
  value,
  onCommit,
  placeholder,
  list,
  id,
  disabled,
  numeric,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  list?: string;
  id?: string;
  disabled?: boolean;
  numeric?: NumericOptions;
}) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setDraft(value);
    draftRef.current = value;
  }, [value]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const update = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };
  const resolve = (raw: string) => (numeric ? (evaluateExpression(raw) ?? raw) : raw);
  const commit = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = resolve(draftRef.current);
    if (next !== draftRef.current) update(next);
    if (next !== value) onCommit(next);
  };
  return (
    <input
      id={id}
      value={draft}
      placeholder={placeholder}
      list={list}
      disabled={disabled}
      spellCheck={false}
      onChange={(e) => update(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
          update(value);
          (e.target as HTMLInputElement).blur();
        }
        if (numeric && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          const delta = stepSize(e, numeric.fine) * (e.key === 'ArrowUp' ? 1 : -1);
          const next = stepValue(resolve(draftRef.current), delta, numeric.unit);
          if (next === null) return;
          e.preventDefault();
          update(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(commit, STEP_COMMIT_DELAY);
        }
      }}
    />
  );
}

const FINE_PROPS = new Set(['opacity', 'line-height', 'flex-grow', 'flex-shrink']);
const UNITLESS_PROPS = new Set(['opacity', 'line-height', 'font-weight', 'z-index', 'flex-grow', 'flex-shrink', 'order']);
const NUMERIC_PROPS =
  /^(width|height|min-width|min-height|max-width|max-height|top|right|bottom|left|gap|row-gap|column-gap|opacity|z-index|order|flex-grow|flex-shrink|font-size|line-height|letter-spacing|font-weight|border-width|border-radius|outline-width|outline-offset|(margin|padding)(-(top|right|bottom|left))?)$/;

/** Numeric behaviour for a CSS property, or undefined for non-numeric properties. */
export function numericFor(prop: string): NumericOptions | undefined {
  if (!NUMERIC_PROPS.test(prop)) return undefined;
  return { fine: FINE_PROPS.has(prop), unit: UNITLESS_PROPS.has(prop) ? '' : 'px' };
}

const resetFor = (prop: string, value: StyleValue) => (value.state === 'set' ? () => void setStyle(prop, '') : undefined);

export function StyleInput({ prop, label, placeholder, disabled }: { prop: string; label: string; placeholder?: string; disabled?: boolean }) {
  const value = useStyleValue(prop);
  return (
    <StyleField label={label} value={value}>
      <InputShell inherited={value.state !== 'set'} onReset={resetFor(prop, value)}>
        <CommitInput value={shortValue(value.value)} placeholder={placeholder} disabled={disabled} numeric={numericFor(prop)} onCommit={(v) => void setStyle(prop, normalizeValue(prop, v))} />
      </InputShell>
    </StyleField>
  );
}

export function CompactInput({ prop, prefix, disabled }: { prop: string; prefix: string; disabled?: boolean }) {
  const value = useStyleValue(prop);
  return (
    <span title={`${prop} · ${stateTitle(value)}`} style={{ display: 'contents' }}>
      <InputShell prefix={prefix} inherited={value.state !== 'set'} onReset={resetFor(prop, value)}>
        <CommitInput value={shortValue(value.value)} disabled={disabled} numeric={numericFor(prop)} onCommit={(v) => void setStyle(prop, normalizeValue(prop, v))} />
      </InputShell>
    </span>
  );
}

export function CompactSelect({ prop, prefix, options, disabled }: { prop: string; prefix: string; options: string[]; disabled?: boolean }) {
  const value = useStyleValue(prop);
  const all = options.includes(value.value) || !value.value ? options : [value.value, ...options];
  return (
    <span title={`${prop} · ${stateTitle(value)}`} style={{ display: 'contents' }}>
      <InputShell prefix={prefix} inherited={value.state !== 'set'} onReset={resetFor(prop, value)}>
        <select value={value.value} disabled={disabled} onChange={(e) => void setStyle(prop, e.target.value)}>
          {all.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </InputShell>
    </span>
  );
}

export function StyleSelect({ prop, label, options, disabled }: { prop: string; label: string; options: string[]; disabled?: boolean }) {
  const value = useStyleValue(prop);
  const all = options.includes(value.value) || !value.value ? options : [value.value, ...options];
  return (
    <StyleField label={label} value={value}>
      <SelectShell inherited={value.state !== 'set'} onReset={resetFor(prop, value)}>
        <select value={value.value} disabled={disabled} onChange={(e) => void setStyle(prop, e.target.value)}>
          {all.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </SelectShell>
    </StyleField>
  );
}

/** Commits only on the native `change` event (picker closed), not on every drag. */
function NativeColor({ value, disabled, onCommit }: { value: string; disabled?: boolean; onCommit: (hex: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = value;
    const onChange = () => {
      if (el.value !== value) commitRef.current(el.value);
    };
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, [value]);
  return <input ref={ref} type="color" aria-label="Pick colour" disabled={disabled} defaultValue={value} />;
}

export function ColorInput({ prop, label, disabled }: { prop: string; label: string; disabled?: boolean }) {
  const value = useStyleValue(prop);
  const display = shortValue(value.value);
  return (
    <StyleField label={label} value={value}>
      <InputShell inherited={value.state !== 'set'} onReset={resetFor(prop, value)}>
        <Swatch color={display}>
          <NativeColor value={toHex(display)} disabled={disabled} onCommit={(hex) => void setStyle(prop, hex)} />
        </Swatch>
        <CommitInput value={display} disabled={disabled} onCommit={(v) => void setStyle(prop, v.trim())} />
      </InputShell>
    </StyleField>
  );
}

export function ToggleGroup({
  prop,
  label,
  options,
  disabled,
  extra,
  exclusive,
}: {
  prop: string;
  label: string;
  options: { value: string; icon: ReactNode; title: string }[];
  disabled?: boolean;
  /** Less common values, offered in a small overflow select after the icons. */
  extra?: string[];
  /** Clicking the active icon keeps it (no reset); for props that always have a value. */
  exclusive?: boolean;
}) {
  const value = useStyleValue(prop);
  if (extra?.length) {
    const inExtra = extra.includes(value.value);
    return (
      <div className="field">
        <span className="field__label" title={stateTitle(value)}>
          {value.state !== 'computed' && <span className={`marker marker--${value.state}`} />}
          {label}
        </span>
        <fieldset disabled={disabled} className="fieldset-reset toggle-more">
          <ToggleRow options={options} value={value.value} onChange={(v) => void setStyle(prop, !exclusive && value.state === 'set' && value.value === v ? '' : v)} />
          <span className={`toggle-more__select${inExtra ? ' is-active' : ''}`}>
            <select aria-label={`More ${label.toLowerCase()} values`} title="More values" value={inExtra ? value.value : ''} onChange={(e) => e.target.value && void setStyle(prop, e.target.value)}>
              <option value="" disabled>
                …
              </option>
              {extra.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </span>
        </fieldset>
      </div>
    );
  }
  return (
    <div className="field">
      <span className="field__label" title={stateTitle(value)}>
        {value.state !== 'computed' && <span className={`marker marker--${value.state}`} />}
        {label}
      </span>
      <fieldset disabled={disabled} className="fieldset-reset">
        <ToggleRow options={options} value={value.value} onChange={(v) => void setStyle(prop, value.state === 'set' && value.value === v ? '' : v)} />
      </fieldset>
    </div>
  );
}

const AXIS = ['flex-start', 'center', 'flex-end'] as const;
const POS_Y = ['Top', 'Middle', 'Bottom'];
const POS_X = ['left', 'center', 'right'];
const axisIndex = (v: string) => (/(^|-)start$|^normal$|^stretch$|^baseline$|^left$/.test(v) ? 0 : v === 'center' ? 1 : /(^|-)end$|^right$/.test(v) ? 2 : -1);

/**
 * 3×3 alignment grid for flex containers: one click sets justify-content and align-items, mapped to the
 * flex direction. A toggle switches the main axis to space-between.
 */
export function AlignGrid({ disabled }: { disabled?: boolean }) {
  const dir = useStyleValue('flex-direction').value || 'row';
  const justify = useStyleValue('justify-content');
  const align = useStyleValue('align-items');
  const column = dir.startsWith('column');
  const reverse = dir.endsWith('reverse');
  const distribute = justify.value === 'space-between';
  const flip = (i: number) => (reverse && i >= 0 ? 2 - i : i);
  const main = distribute ? 1 : flip(axisIndex(justify.value));
  const cross = axisIndex(align.value);
  const [x, y] = column ? [cross, main] : [main, cross];
  const active = x >= 0 && y >= 0 ? y * 3 + x : -1;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focus, setFocus] = useState(Math.max(active, 0));
  useEffect(() => setFocus(Math.max(active, 0)), [active]);

  const pick = (i: number) => {
    const cx = i % 3;
    const cy = Math.floor(i / 3);
    const [m, c] = column ? [cy, cx] : [cx, cy];
    void setStyles({ 'justify-content': distribute ? 'space-between' : AXIS[flip(m)], 'align-items': AXIS[c] }, 'Set alignment');
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    let n = i + d;
    if (d === -1 && i % 3 === 0) n = i + 2;
    if (d === 1 && i % 3 === 2) n = i - 2;
    n = (n + 9) % 9;
    setFocus(n);
    refs.current[n]?.focus();
    pick(n);
  };
  const resets = justify.state === 'set' || align.state === 'set';

  return (
    <StyleField label="Align" value={justify.state === 'set' ? justify : align}>
      <div className="align-grid-row">
        <div className={`align-grid${column ? ' is-column' : ''}`} role="radiogroup" aria-label="Alignment">
          {Array.from({ length: 9 }, (_, i) => {
            const on = distribute ? (column ? i % 3 === x : Math.floor(i / 3) === y) : i === active;
            const label = `${POS_Y[Math.floor(i / 3)]} ${POS_X[i % 3]}`.replace('Middle center', 'Center');
            return (
              <button
                key={i}
                ref={(el) => void (refs.current[i] = el)}
                type="button"
                role="radio"
                aria-label={label}
                aria-checked={i === active}
                title={label}
                tabIndex={i === focus ? 0 : -1}
                disabled={disabled}
                className={`align-grid__cell${on ? ' is-active' : ''}`}
                onClick={() => pick(i)}
                onKeyDown={(e) => onKey(e, i)}
              >
                {on ? (
                  <span className="align-grid__bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <span className="align-grid__dot" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
        <div className="align-grid__side">
          <button
            type="button"
            className={`align-grid__toggle${distribute ? ' is-active' : ''}`}
            aria-pressed={distribute}
            title="Distribute (space-between)"
            disabled={disabled}
            onClick={() => void setStyles({ 'justify-content': distribute ? AXIS[flip(Math.max(column ? y : x, 0))] : 'space-between' }, distribute ? 'Pack items' : 'Distribute items')}
          >
            <span className={`align-grid__dist${column ? ' is-column' : ''}`} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
          {resets && (
            <button type="button" className="align-grid__reset" title="Reset alignment" disabled={disabled} onClick={() => void setStyles({ 'justify-content': '', 'align-items': '' }, 'Reset alignment')}>
              ×
            </button>
          )}
        </div>
      </div>
    </StyleField>
  );
}
