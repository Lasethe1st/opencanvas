import { setStyles } from '../../lib/actions';
import { useStore } from '../../lib/store';
import { BoxModel as BoxDiagram, BoxSlot } from '../../ui/Inspector.jsx';
import { CommitInput } from './fields';
import { normalizeValue, useStyleValue } from './useStyleValue';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

function compact(value: string): string {
  if (!value) return '';
  return value.replace(/\.\d+px$/, 'px').replace(/^(-?\d+)px$/, '$1');
}

function SideInput({ group, side, disabled }: { group: 'margin' | 'padding'; side: (typeof SIDES)[number]; disabled: boolean }) {
  const prop = `${group}-${side}`;
  const value = useStyleValue(prop);
  const commit = (raw: string) => {
    const v = normalizeValue(prop, raw);
    void setStyles({ [prop]: v }, `Set ${prop}`);
  };
  return (
    <BoxSlot side={side} set={value.state === 'set'} title={`${prop}${value.state === 'set' ? ' (set here)' : value.state === 'inherited' ? ' (inherited)' : ''}`}>
      <CommitInput value={compact(value.value)} disabled={disabled} numeric={{ unit: '' }} onCommit={commit} />
    </BoxSlot>
  );
}

export function BoxModel({ disabled }: { disabled: boolean }) {
  const rect = useStore((s) => s.selection?.rect);
  const marginShorthand = useStyleValue('margin');
  const paddingShorthand = useStyleValue('padding');

  return (
    <>
      <BoxDiagram
        margin={SIDES.map((side) => <SideInput key={side} group="margin" side={side} disabled={disabled} />)}
        padding={SIDES.map((side) => <SideInput key={side} group="padding" side={side} disabled={disabled} />)}
        size={rect ? `${Math.round(rect.width)} × ${Math.round(rect.height)}` : '—'}
      />
      {(marginShorthand.state === 'set' || paddingShorthand.state === 'set') && (
        <p className="muted" style={{ margin: 0, fontSize: 11 }}>
          Shorthand set here: {marginShorthand.state === 'set' && `margin ${marginShorthand.value}`} {paddingShorthand.state === 'set' && `padding ${paddingShorthand.value}`}
        </p>
      )}
    </>
  );
}
