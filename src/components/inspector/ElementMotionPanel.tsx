import { ArrowsOutCardinal, ArrowUp, Eye, Lightning, MagicWand, Minus, Play, Sparkle, Timer } from '../../lib/hugeicons';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { defaultSpec, EASES, motionFromAttributes, presetsFor, TRIGGERS, type MotionEase, type MotionSpec, type MotionTrigger } from '../../../shared/motion';
import { replayMotion, setMotion } from '../../lib/actions';
import { useStore } from '../../lib/store';
import { InputShell, ToggleRow } from '../../ui/primitives.jsx';
import { CommitInput, CompactInput, CompactSelect, Section, StyleInput } from './fields';

const flip: CSSProperties = { transform: 'rotate(180deg)' };
const ICONS: Record<string, ReactNode> = {
  fade: <Eye size={16} weight="fill" />,
  rise: <ArrowUp size={16} weight="bold" />,
  drop: <ArrowUp size={16} weight="bold" style={flip} />,
  'slide-left': <Play size={16} weight="fill" />,
  'slide-right': <Play size={16} weight="fill" style={flip} />,
  scale: <ArrowsOutCardinal size={16} weight="bold" />,
  blur: <Sparkle size={16} weight="fill" />,
  lift: <ArrowUp size={16} weight="bold" />,
  grow: <ArrowsOutCardinal size={16} weight="bold" />,
  dim: <Eye size={16} weight="fill" />,
  shrink: <Minus size={16} weight="bold" />,
  sink: <ArrowUp size={16} weight="bold" style={flip} />,
};

/** Seconds as the field shows them: "0.4s". */
const secs = (n: number) => `${Math.round(n * 1000) / 1000}s`;
const parseSecs = (v: string) => {
  const n = parseFloat(v.replace(/s$/i, ''));
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
};

/**
 * Motion for the selected element, played by motion.dev in the project. Pick when it plays, how it moves,
 * and for how long; the choice is written onto the element and the project's motion runtime does the rest.
 */
export function ElementMotionPanel({ disabled }: { disabled: boolean }) {
  const selection = useStore((s) => s.selection);
  const attributes = useStore((s) => s.sourceInfo?.attributes);
  const [pending, setPending] = useState<MotionTrigger>('in-view');

  if (!selection) {
    return <div className="empty-note">Select an element to add motion.</div>;
  }

  const spec = attributes ? motionFromAttributes(attributes) : null;
  const trigger = spec?.trigger ?? pending;
  const presets = presetsFor(trigger);

  const apply = (next: MotionSpec, label: string) => void setMotion(next, label);
  const pickTrigger = (t: MotionTrigger) => {
    setPending(t);
    if (spec && spec.trigger !== t) apply(defaultSpec(t, spec), `Motion · ${TRIGGERS.find((x) => x.id === t)?.label}`);
  };
  const pickPreset = (preset: string) => apply({ ...(spec ?? defaultSpec(trigger)), trigger, preset }, `Motion · ${presets.find((p) => p.id === preset)?.label ?? preset}`);
  const patch = (change: Partial<MotionSpec>, label: string) => spec && apply({ ...spec, ...change }, label);

  return (
    <>
      <Section title="Motion" icon={<MagicWand size={14} weight="fill" />}>
        <fieldset disabled={disabled} className="fieldset-reset">
          <ToggleRow options={TRIGGERS.map((t) => ({ value: t.id, text: t.label, title: t.hint }))} value={trigger} onChange={(v: string) => pickTrigger(v as MotionTrigger)} />
        </fieldset>
        <div className="motion-presets" role="list">
          <button type="button" className={`motion-preset${spec ? '' : ' is-active'}`} disabled={disabled || !spec} aria-pressed={!spec} title="Remove motion from this element" onClick={() => void setMotion(null, 'Remove motion')}>
            <span className="motion-preset__icon"><Minus size={16} weight="bold" /></span>
            <span className="motion-preset__label">None</span>
            <span className="motion-preset__hint">No motion</span>
          </button>
          {presets.map((preset) => {
            const active = spec?.preset === preset.id && spec.trigger === trigger;
            return (
              <button key={preset.id} type="button" className={`motion-preset${active ? ' is-active' : ''}`} disabled={disabled} aria-pressed={active} title={preset.hint} onClick={() => pickPreset(preset.id)}>
                <span className="motion-preset__icon">{ICONS[preset.id] ?? <Lightning size={16} weight="fill" />}</span>
                <span className="motion-preset__label">{preset.label}</span>
                <span className="motion-preset__hint">{preset.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="muted motion-note">
          Played by <a href="https://motion.dev" target="_blank" rel="noreferrer">motion.dev</a>. The first time, OpenCanvas adds the <code>motion</code> package and a small runtime to this project.
        </p>
      </Section>
      {spec && (
        <Section title="Timing" icon={<Timer size={14} weight="fill" />}>
          <div className="grid-2">
            <InputShell prefix="Duration">
              <CommitInput value={secs(spec.duration)} disabled={disabled} onCommit={(v) => { const n = parseSecs(v); if (n && n > 0) patch({ duration: n }, 'Motion · duration'); }} />
            </InputShell>
            <InputShell prefix="Delay">
              <CommitInput value={secs(spec.delay)} disabled={disabled} onCommit={(v) => { const n = parseSecs(v); if (n !== null) patch({ delay: n }, 'Motion · delay'); }} />
            </InputShell>
          </div>
          <InputShell prefix="Ease">
            <select value={spec.ease} disabled={disabled} onChange={(e) => patch({ ease: e.target.value as MotionEase }, 'Motion · ease')}>
              {EASES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </InputShell>
          <button type="button" className="motion-preset" style={{ width: '100%' }} disabled={disabled} onClick={replayMotion}>
            <span className="motion-preset__icon"><Play size={16} weight="fill" /></span>
            <span className="motion-preset__label">Replay</span>
            <span className="motion-preset__hint">{trigger === 'hover' || trigger === 'press' ? 'Plays the reaction once' : 'Plays the animation again'}</span>
          </button>
        </Section>
      )}
      <Section title="CSS transition" icon={<Timer size={14} weight="fill" />} defaultOpen={false}>
        <p className="muted motion-note">For the Hover style tab: how style changes ease in and out. Everything else above is Motion.</p>
        <StyleInput prop="transition" label="Transition" placeholder="all 0.25s ease" disabled={disabled} />
        <div className="grid-2">
          <CompactSelect prop="transition-timing-function" prefix="Ease" options={['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear']} disabled={disabled} />
          <CompactInput prop="transition-duration" prefix="Duration" disabled={disabled} />
        </div>
      </Section>
    </>
  );
}
