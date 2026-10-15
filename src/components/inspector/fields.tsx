import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { evaluateExpression, stepSize, stepValue } from '../../../shared/numeric';
import { setStyle } from '../../lib/actions';
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
