import { FilePlus2, FolderOpen, LayoutTemplate } from 'lucide-react';
import { Brand } from './TopBar.jsx';
import { cx } from './primitives.jsx';

export function StartScreen({ themeMenu, options, templates, createBar, recent }) {
  return (
    <div className="start">
      <div className="start__inner">
        <div className="start__top">
          <Brand />
          {themeMenu}
        </div>
        <h1 data-oc="h1-8i6by">Start designing</h1>
        <p className="start__lead">Build real React projects visually. Every change is written to source files you own, and you can switch to code at any moment.</p>
        <div className="start-options">{options}</div>
        {templates}
        {createBar}
        {recent}
      </div>
    </div>
  );
}

export const START_ICONS = {
  blank: <FilePlus2 size={17} />,
  template: <LayoutTemplate size={17} />,
  open: <FolderOpen size={17} />,
};

export function StartOption({ icon, title, children, selected, ...rest }) {
  return (
    <button className={cx('start-option', selected && 'is-selected')} {...rest}>
      <span className="start-option__icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <span>{children}</span>
      </span>
    </button>
  );
}

export function TemplateGrid({ title, children }) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <div className="template-grid" role="listbox" aria-label="Templates">
        {children}
      </div>
    </section>
  );
}

export function TemplateCard({ art, name, description, selected, ...rest }) {
  return (
    <button className={cx('template-card', selected && 'is-selected')} role="option" aria-selected={selected} {...rest}>
      <div data-oc="div-6rmyu" className="template-card__art">{art}</div>
      <div className="template-card__body">
        <strong>{name}</strong>
        <span>{description}</span>
      </div>
    </button>
  );
}

export function CreateBar({ input, button, where }) {
  return (
    <div className="create-bar">
      {input}
      <span className="create-bar__where">{where}</span>
      {button}
    </div>
  );
}

export function RecentList({ children }) {
  return (
    <section className="recent">
      <h2 className="section-title">Recent projects</h2>
      <div className="recent-list">{children}</div>
    </section>
  );
}

export function RecentItem({ icon, name, path, ...rest }) {
  return (
    <button className="recent-item" {...rest}>
      {icon}
      <strong>{name}</strong>
      <span>{path}</span>
    </button>
  );
}

/** Schematic template thumbnails. `tone` lets callers theme them. */
const bar = (w, h = 6, extra = {}) => ({ width: w, height: h, borderRadius: 3, background: 'var(--line-strong)', ...extra });
const box = (extra = {}) => ({ border: '1px solid var(--line)', borderRadius: 5, background: 'var(--surface)', ...extra });

export function TemplateArt({ id }) {
  const frame = { ...box(), height: '100%', padding: 10, display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden' };
  if (id === 'blank') {
    return <div style={{ ...frame, alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 11 }}>Empty page</div>;
  }
  if (id === 'landing') {
    return (
      <div style={frame}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={bar('22%', 5)} /><div style={{ display: 'flex', gap: 4 }}><div style={bar('18px', 5)} /><div style={bar('18px', 5)} /></div></div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '8px 0' }}>
          <div style={bar('62%', 9, { background: 'var(--fg-4)' })} /><div style={bar('44%', 5)} /><div style={bar('38px', 11, { background: 'var(--accent)' })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>{[0, 1, 2].map((i) => <div key={i} style={box({ height: 26 })} />)}</div>
      </div>
    );
  }
  if (id === 'portfolio') {
    return (
      <div style={frame}>
        <div style={bar('24%', 5)} /><div style={bar('70%', 9, { background: 'var(--fg-4)' })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 30, borderRadius: 4, background: 'var(--line)' }} />)}</div>
      </div>
    );
  }
  if (id === 'dashboard') {
    return (
      <div style={{ ...frame, flexDirection: 'row', padding: 0, gap: 0 }}>
        <div style={{ width: '24%', borderRight: '1px solid var(--line)', padding: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>{[0, 1, 2, 3].map((i) => <div key={i} style={bar('80%', 5)} />)}</div>
        <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface-2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>{[0, 1, 2].map((i) => <div key={i} style={box({ height: 22 })} />)}</div>
          <div style={box({ flex: 1 })} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...frame, padding: 0 }}>
      <div style={{ background: '#18181c', padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
        <div style={bar('55%', 8, { background: '#55555f' })} /><div style={bar('34px', 9, { background: '#fff' })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, padding: 8 }}>{[0, 1, 2].map((i) => <div key={i} style={box({ height: 34 })} />)}</div>
    </div>
  );
}
