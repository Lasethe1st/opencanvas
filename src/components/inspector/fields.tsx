import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/** Text input that commits on Enter/blur and resyncs when the source value changes. */
export function CommitInput({
  value,
  onCommit,
  placeholder,
  list,
  id,
  disabled,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  list?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      id={id}
      value={draft}
      placeholder={placeholder}
      list={list}
      disabled={disabled}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

const resetFor = (prop: string, value: StyleValue) => (value.state === 'set' ? () => void setStyle(prop, '') : undefined);

export function StyleInput({ prop, label, placeholder, disabled }: { prop: string; label: string; placeholder?: string; disabled?: boolean }) {
  const value = useStyleValue(prop);
  return (
    <StyleField label={label} value={value}>
      <InputShell inherited={value.state !== 'set'} onReset={resetFor(prop, value)}>
        <CommitInput value={shortValue(value.value)} placeholder={placeholder} disabled={disabled} onCommit={(v) => void setStyle(prop, normalizeValue(prop, v))} />
      </InputShell>
    </StyleField>
  );
}

export function CompactInput({ prop, prefix, disabled }: { prop: string; prefix: string; disabled?: boolean }) {
  const value = useStyleValue(prop);
  return (
    <span title={`${prop} · ${stateTitle(value)}`} style={{ display: 'contents' }}>
      <InputShell prefix={prefix} inherited={value.state !== 'set'} onReset={resetFor(prop, value)}>
        <CommitInput value={shortValue(value.value)} disabled={disabled} onCommit={(v) => void setStyle(prop, normalizeValue(prop, v))} />
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

export function ToggleGroup({ prop, label, options, disabled }: { prop: string; label: string; options: { value: string; icon: ReactNode; title: string }[]; disabled?: boolean }) {
  const value = useStyleValue(prop);
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
