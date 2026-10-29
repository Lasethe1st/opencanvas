import { Link, LinkBreak } from '../../lib/hugeicons';
import { useState } from 'react';
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

function SideInput({ group, side, linked, disabled }: { group: 'margin' | 'padding'; side: (typeof SIDES)[number]; linked: boolean; disabled: boolean }) {
  const prop = `${group}-${side}`;
  const value = useStyleValue(prop);
  const commit = (raw: string) => {
    const v = normalizeValue(prop, raw);
    if (linked) {
      void setStyles({ [group]: v, ...Object.fromEntries(SIDES.map((s) => [`${group}-${s}`, ''])) }, `Set ${group}`);
    } else {
      void setStyles({ [prop]: v }, `Set ${prop}`);
    }
  };
  return (
    <BoxSlot side={side} set={value.state === 'set'} title={`${prop}${value.state === 'set' ? ' (set here)' : value.state === 'inherited' ? ' (inherited)' : ''}`}>
      <CommitInput value={compact(value.value)} disabled={disabled} numeric={{ unit: '' }} onCommit={commit} />
    </BoxSlot>
  );
}

function LinkButton({ linked, label, onClick }: { linked: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`box-link${linked ? ' is-on' : ''}`} aria-pressed={linked} aria-label={linked ? `${label}: all sides linked` : `${label}: sides set separately`} data-tip={linked ? 'All sides move together' : 'Link all sides'} onClick={onClick}>
      {linked ? <Link size={12} weight="bold" /> : <LinkBreak size={12} weight="bold" />}
    </button>
  );
}

export function BoxModel({ disabled }: { disabled: boolean }) {
  const [linkMargin, setLinkMargin] = useState(false);
  const [linkPadding, setLinkPadding] = useState(false);
  const rect = useStore((s) => s.selection?.rect);
  const marginShorthand = useStyleValue('margin');
  const paddingShorthand = useStyleValue('padding');

  return (
    <>
      <BoxDiagram
        margin={SIDES.map((side) => <SideInput key={side} group="margin" side={side} linked={linkMargin} disabled={disabled} />)}
        padding={SIDES.map((side) => <SideInput key={side} group="padding" side={side} linked={linkPadding} disabled={disabled} />)}
        size={rect ? `${Math.round(rect.width)} × ${Math.round(rect.height)}` : '—'}
        marginAction={<LinkButton linked={linkMargin} label="Margin" onClick={() => setLinkMargin((v) => !v)} />}
        paddingAction={<LinkButton linked={linkPadding} label="Padding" onClick={() => setLinkPadding((v) => !v)} />}
      />
      {(marginShorthand.state === 'set' || paddingShorthand.state === 'set') && (
        <p className="muted" style={{ margin: 0, fontSize: 11 }}>
          Shorthand set here: {marginShorthand.state === 'set' && `margin ${marginShorthand.value}`} {paddingShorthand.state === 'set' && `padding ${paddingShorthand.value}`}
        </p>
      )}
    </>
  );
}
