import { forwardRef } from 'react';
import { cx } from './primitives.jsx';

export function StartScreen({ corner, search, actions, recent, children }) {
  return (
    <div className="start">
      <div className="start__corner">{corner}</div>
      <div className="start__inner">
        {search}
        <div className="start-actions">{actions}</div>
        {recent}
      </div>
      {children}
    </div>
  );
}

export const SearchPill = forwardRef(function SearchPill({ hint, ...rest }, ref) {
  return (
    <label className="search-pill">
      <input ref={ref} type="search" spellCheck={false} autoComplete="off" {...rest} />
      {hint && <kbd className="search-pill__hint">{hint}</kbd>}
    </label>
  );
});

export function ActionPill({ icon, tone, children, className, ...rest }) {
  return (
    <button className={cx('action-pill', tone && `action-pill--${tone}`, className)} {...rest}>
      <span className="action-pill__icon">{icon}</span>
      {children}
    </button>
  );
}

export function GithubMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function RecentList({ title, empty, children }) {
  return (
    <section className="recent" aria-label={title}>
      <h2 className="recent__title">{title}</h2>
      {empty ? <p className="recent__empty">{empty}</p> : <div className="recent-list">{children}</div>}
    </section>
  );
}

const HUES = [12, 36, 150, 190, 222, 262, 300, 340];

/** Favicon when the project has one, otherwise a monogram tile. */
export function ProjectIcon({ src, name }) {
  if (src) {
    return (
      <span className="project-icon project-icon--image">
        <img src={src} alt="" draggable={false} />
      </span>
    );
  }
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[hash % HUES.length];
  return (
    <span className="project-icon" style={{ '--hue': hue }} aria-hidden="true">
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function RecentItem({ icon, name, path, meta, active, ...rest }) {
  return (
    <button className={cx('recent-item', active && 'is-active')} {...rest}>
      {icon}
      <span className="recent-item__text">
        <strong>{name}</strong>
        <span>{path}</span>
      </span>
      {meta && <span className="recent-item__meta">{meta}</span>}
    </button>
  );
}

export function TemplateGrid({ children }) {
  return (
    <div className="template-grid" role="listbox" aria-label="Templates">
      {children}
    </div>
  );
}

export function TemplateCard({ art, name, description, selected, ...rest }) {
  return (
    <button className={cx('template-card', selected && 'is-selected')} role="option" aria-selected={selected} {...rest}>
      <div className="template-card__art">{art}</div>
      <div className="template-card__body">
        <strong>{name}</strong>
        <span>{description}</span>
      </div>
    </button>
  );
}

/** Schematic template thumbnails. */
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
