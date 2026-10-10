import { Code2, Link2, Link2Off } from 'lucide-react';
import { Button } from './primitives.jsx';

export function InspectorHeader({ name, tag, parent, source, onRename, onSource }) {
  return (
    <div className="inspector-head">
      <div className="inspector-head__row">
        <input data-oc="input-o3u49" className="inspector-head__name" defaultValue={name} key={name} aria-label="Layer name" onBlur={(e) => onRename?.(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        <span className="tag">&lt;{tag}&gt;</span>
      </div>
      <div className="inspector-head__meta">
        {parent && <span>in {parent}</span>}
        {source && (
          <button className="source-link" onClick={onSource} title="Open in code view">
            <Code2 size={11} />
            {source}
          </button>
        )}
      </div>
    </div>
  );
}

export function BreakpointBanner({ icon, children }) {
  return (
    <div className="bp-banner">
      {icon}
      <span>{children}</span>
    </div>
  );
}

export function BoxModel({ margin, padding, size }) {
  return (
    <div className="boxmodel">
      <span className="boxmodel__caption">Margin</span>
      {margin}
      <div className="boxmodel__padding">
        <span className="boxmodel__caption">Padding</span>
        {padding}
        <div className="boxmodel__content">{size}</div>
      </div>
    </div>
  );
}

export function BoxSlot({ side, set, title, children }) {
  return (
    <span className={`box-slot box-slot--${side}${set ? ' is-set' : ''}`} title={title}>
      {children}
    </span>
  );
}

export function LinkToggles({ marginLinked, paddingLinked, onMargin, onPadding }) {
  return (
    <div className="link-toggles">
      <Button variant="ghost" size="sm" icon={marginLinked ? <Link2 size={12} /> : <Link2Off size={12} />} onClick={onMargin}>
        Margin {marginLinked ? 'linked' : 'per side'}
      </Button>
      <Button variant="ghost" size="sm" icon={paddingLinked ? <Link2 size={12} /> : <Link2Off size={12} />} onClick={onPadding}>
        Padding {paddingLinked ? 'linked' : 'per side'}
      </Button>
    </div>
  );
}

export function KeyValue({ label, children }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}
