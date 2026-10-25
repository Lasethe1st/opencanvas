import { setStyles } from '../../lib/actions';
import { useStore } from '../../lib/store';
import { Notice } from '../../ui/primitives.jsx';
import { CompactInput, CompactSelect, Section, StyleInput } from './fields';

type MotionPreset = {
  id: string;
  label: string;
  hint: string;
  styles: Record<string, string>;
};

const PRESETS: MotionPreset[] = [
  {
    id: 'none',
    label: 'None',
    hint: 'Clear motion styles',
    styles: { transition: '', transform: '', animation: '', 'animation-delay': '', 'animation-duration': '' },
  },
  {
    id: 'soft',
    label: 'Soft',
    hint: 'Gentle all-property ease',
    styles: { transition: 'all 0.25s ease', transform: '', animation: '' },
  },
  {
    id: 'fade',
    label: 'Fade',
    hint: 'Opacity eases in and out',
    styles: { transition: 'opacity 0.35s ease', transform: '', animation: '' },
  },
  {
    id: 'rise',
    label: 'Rise',
    hint: 'Opacity + slight lift',
    styles: { transition: 'opacity 0.35s ease, transform 0.35s ease', transform: 'translateY(0)', animation: '' },
  },
  {
    id: 'scale',
    label: 'Scale',
    hint: 'Subtle scale on change',
    styles: { transition: 'transform 0.3s ease, opacity 0.3s ease', transform: 'scale(1)', animation: '' },
  },
  {
    id: 'springy',
    label: 'Springy',
    hint: 'Bouncy cubic-bezier',
    styles: {
      transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
      transform: 'scale(1)',
      animation: '',
    },
  },
];

/** Motion controls for the selected element — presets plus transition / transform / animation. */
export function ElementMotionPanel({ disabled }: { disabled: boolean }) {
  const selection = useStore((s) => s.selection);

  if (!selection) {
    return <div className="empty-note">Select an element to add motion.</div>;
  }

  const applyPreset = (preset: MotionPreset) => {
    void setStyles(preset.styles, `Motion · ${preset.label}`);
  };

  return (
    <>
      <Section title="Presets">
        <div className="motion-presets" role="list">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="motion-preset"
              disabled={disabled}
              title={preset.hint}
              onClick={() => applyPreset(preset)}
            >
              <span className="motion-preset__label">{preset.label}</span>
              <span className="motion-preset__hint">{preset.hint}</span>
            </button>
          ))}
        </div>
        <Notice>
          Presets write CSS <code>transition</code> / <code>transform</code> on this element. Pair with Hover state for press and hover motion.
        </Notice>
      </Section>
      <Section title="Transition">
        <StyleInput prop="transition" label="Transition" placeholder="all 0.25s ease" disabled={disabled} />
        <div className="grid-2">
          <CompactSelect
            prop="transition-timing-function"
            prefix="Ease"
            options={['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear']}
            disabled={disabled}
          />
          <CompactInput prop="transition-duration" prefix="Duration" disabled={disabled} />
        </div>
      </Section>
      <Section title="Transform">
        <StyleInput prop="transform" label="Transform" placeholder="translateY(-4px) scale(1.02)" disabled={disabled} />
      </Section>
      <Section title="Animation">
        <StyleInput prop="animation" label="Animation" placeholder="fade-in 0.4s ease both" disabled={disabled} />
        <div className="grid-2">
          <CompactInput prop="animation-duration" prefix="Duration" disabled={disabled} />
          <CompactInput prop="animation-delay" prefix="Delay" disabled={disabled} />
        </div>
        <CompactSelect
          prop="animation-timing-function"
          prefix="Ease"
          options={['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear']}
          disabled={disabled}
        />
      </Section>
    </>
  );
}
