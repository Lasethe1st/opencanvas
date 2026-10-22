import { History, Loader2, Palette, Search, Shapes, SwatchBook } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DesignSystemDocument, Token, ValidationIssue } from '../../../shared/design-system';
import { cssVarName, guessTokenType } from '../../../shared/design-system';
import { api } from '../../lib/api';
import { highlightTokenDependents } from '../../lib/bridge';
import { toast } from '../../lib/store';
import { Button, Field, InputShell } from '../../ui/primitives.jsx';

type Tab = 'overview' | 'tokens' | 'themes' | 'components' | 'deps' | 'history';

const TABS: { id: Tab; label: string; icon: typeof Palette }[] = [
  { id: 'overview', label: 'Overview', icon: SwatchBook },
  { id: 'tokens', label: 'Tokens', icon: Palette },
  { id: 'themes', label: 'Themes', icon: Palette },
  { id: 'components', label: 'Components', icon: Shapes },
  { id: 'deps', label: 'Dependencies', icon: Search },
  { id: 'history', label: 'History', icon: History },
];

function tokenDisplay(token: Token): string {
  if (token.value.kind === 'raw') return token.value.value;
  return `{${token.value.ref}}`;
}

export function DesignSystemPanel() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<DesignSystemDocument | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [cssFile, setCssFile] = useState('');
  const [query, setQuery] = useState('');
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [impact, setImpact] = useState<{
    dependentTokens: string[];
    components: string[];
    styleUsages: number;
    styleKeys: string[];
    cssVar: string;
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.designSystem.get();
      setDoc(next.document);
      setIssues(next.issues);
      setCssFile(next.cssFile);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => highlightTokenDependents(null);
  }, [refresh]);

  const tokens = useMemo(() => {
    if (!doc) return [];
    const q = query.trim().toLowerCase();
    return doc.tokens
      .filter((t) => !q || t.path.toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [doc, query]);

  const selected = doc?.tokens.find((t) => t.id === selectedToken) ?? null;

  useEffect(() => {
    if (!selected) {
      setEditValue('');
      setImpact(null);
      return;
    }
    setEditValue(tokenDisplay(selected));
    void api.designSystem.impact(selected.id).then(setImpact).catch(() => setImpact(null));
  }, [selected?.id]);

  const applyTokenEdit = async () => {
    if (!selected || !doc) return;
    setBusy(true);
    try {
      const value = editValue.trim();
      const nextToken: Token = {
        ...selected,
        value: value.startsWith('{') && value.endsWith('}')
          ? { kind: 'alias', ref: value.slice(1, -1) }
          : value.startsWith('var(')
            ? { kind: 'alias', ref: value.replace(/^var\(\s*|\s*\)$/g, '') }
            : { kind: 'raw', value },
        type: guessTokenType(selected.path, value),
      };
      const updated = await api.designSystem.upsertToken(nextToken, `Updated ${selected.path}`);
      setDoc(updated);
      toast(`Updated ${selected.path}`, 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="dock-empty flex items-center gap-2">
        <Loader2 size={14} className="ai-spin" />
        Loading design system…
      </div>
    );
  }

  if (!doc) {
    return <p className="dock-empty">Open a project to manage its design system.</p>;
  }

  return (
    <div className="ds-panel">
      <div className="ds-panel__tabs" role="tablist" aria-label="Design system">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`ds-panel__tab${tab === id ? ' is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="ds-panel__body">
          <h3 className="ds-panel__title">{doc.meta.name}</h3>
          <p className="dock-note">
            {doc.tokens.length} tokens · {doc.components.length} components · theme “{doc.activeThemeId}”
            {cssFile ? ` · synced to ${cssFile}` : ''}
          </p>
          {issues.length === 0 ? (
            <p className="dock-note">No validation issues.</p>
          ) : (
            <ul className="ds-panel__issues">
              {issues.slice(0, 12).map((issue, i) => (
                <li key={`${issue.code}-${i}`} className={issue.severity === 'error' ? 'is-error' : ''}>
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          <div className="ds-panel__row">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void api.designSystem.syncCss().then((f) => toast(`Synced ${f}`, 'success'))}>
              Sync CSS
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void api.designSystem.export('css').then(async (text) => {
                  await navigator.clipboard.writeText(text);
                  toast('Copied design-tokens.css', 'success');
                })
              }
            >
              Copy CSS
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void api.designSystem.export('tokens-json').then(async (text) => {
                  await navigator.clipboard.writeText(text);
                  toast('Copied token JSON', 'success');
                })
              }
            >
              Copy JSON
            </Button>
          </div>
        </div>
      )}

      {tab === 'tokens' && (
        <div className="ds-panel__body ds-panel__split">
          <div>
            <InputShell>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tokens…" aria-label="Search tokens" />
            </InputShell>
            <ul className="ds-panel__list">
              {tokens.map((t) => (
                <li key={t.id}>
                  <button type="button" className={selectedToken === t.id ? 'is-active' : ''} onClick={() => setSelectedToken(t.id)}>
                    <span className="ds-panel__swatch" style={{ background: t.type === 'color' && t.value.kind === 'raw' ? t.value.value : 'var(--surface-2)' }} />
                    <span className="ds-panel__token-path">{t.path}</span>
                    <span className="ds-panel__token-val">{tokenDisplay(t)}</span>
                  </button>
                </li>
              ))}
              {!tokens.length && <li className="dock-note">No tokens yet. Import a design system from Direction.</li>}
            </ul>
          </div>
          {selected && (
            <div className="ds-panel__detail">
              <h4>{selected.path}</h4>
              <p className="dock-note">
                {selected.role} · {selected.type} · {cssVarName(selected.path)}
              </p>
              <Field label="Value">
                <InputShell>
                  <input value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                </InputShell>
              </Field>
              {impact && (
                <p className="dock-note">
                  Impact: {impact.dependentTokens.length} token refs, {impact.components.length} components, {impact.styleUsages} style
                  usages
                  {impact.styleKeys.length ? ` · keys ${impact.styleKeys.slice(0, 4).join(', ')}${impact.styleKeys.length > 4 ? '…' : ''}` : ''}
                </p>
              )}
              <div className="ds-panel__row">
                <Button type="button" disabled={busy} onClick={() => void applyTokenEdit()}>
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!impact?.styleKeys.length}
                  onClick={() => {
                    if (!impact?.styleKeys.length || !selected) {
                      toast('No canvas elements use this token yet', 'info');
                      return;
                    }
                    highlightTokenDependents({ keys: impact.styleKeys, label: impact.cssVar });
                    toast(`Highlighted ${impact.styleKeys.length} on canvas`, 'success');
                  }}
                >
                  Highlight on canvas
                </Button>
                <Button type="button" variant="ghost" onClick={() => highlightTokenDependents(null)}>
                  Clear
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'themes' && (
        <div className="ds-panel__body">
          <div className="ds-panel__row" role="radiogroup" aria-label="Active theme">
            {doc.themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={doc.activeThemeId === theme.id}
                className={`ds-panel__chip${doc.activeThemeId === theme.id ? ' is-active' : ''}`}
                onClick={() =>
                  void api.designSystem.setActiveTheme(theme.id).then((next) => {
                    setDoc(next);
                    toast(`Theme → ${theme.label}`, 'success');
                  })
                }
              >
                {theme.label}
              </button>
            ))}
          </div>
          <p className="dock-note">Active theme drives generated CSS defaults. Preview uses project `data-theme` when supported.</p>
        </div>
      )}

      {tab === 'components' && (
        <div className="ds-panel__body">
          {doc.components.length === 0 ? (
            <p className="dock-note">No registered components yet. Projects with shadcn `components.json` seed the ui/ folder automatically.</p>
          ) : (
            <ul className="ds-panel__list">
              {doc.components.map((c) => (
                <li key={c.id}>
                  <div className="ds-panel__comp">
                    <strong>{c.name}</strong>
                    <span className="dock-note">{c.file}{c.description ? ` · ${c.description}` : ''}</span>
                    <span className="dock-note">{c.tokenDeps.length ? c.tokenDeps.join(', ') : 'No token deps'}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'deps' && (
        <div className="ds-panel__body">
          <p className="dock-note">Select a token under Tokens to see dependents. Style file usages are counted from `var(--…)` in open-canvas.css.</p>
          {selected && impact ? (
            <>
              <ul className="ds-panel__issues">
                {impact.dependentTokens.map((id) => (
                  <li key={id}>Token → {id}</li>
                ))}
                {impact.components.map((id) => (
                  <li key={`c-${id}`}>Component → {id}</li>
                ))}
                {impact.styleKeys.map((key) => (
                  <li key={`k-${key}`}>Canvas → data-oc="{key}"</li>
                ))}
                <li>Style usages → {impact.styleUsages}</li>
              </ul>
              <div className="ds-panel__row">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!impact.styleKeys.length}
                  onClick={() => {
                    highlightTokenDependents({ keys: impact.styleKeys, label: impact.cssVar });
                    toast(`Highlighted ${impact.styleKeys.length} on canvas`, 'success');
                  }}
                >
                  Highlight on canvas
                </Button>
                <Button type="button" variant="ghost" onClick={() => highlightTokenDependents(null)}>
                  Clear highlight
                </Button>
              </div>
            </>
          ) : (
            <p className="dock-note">No token selected.</p>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="ds-panel__body">
          <p className="dock-note">
            Current revision {doc.revision}
            {doc.meta.updatedAt ? ` · updated ${new Date(doc.meta.updatedAt).toLocaleString()}` : ''}. Restore writes a new revision (git remains the backup).
          </p>
          {doc.history.length === 0 ? (
            <p className="dock-note">No saved revisions yet.</p>
          ) : (
            <ul className="ds-panel__list">
              {doc.history.map((h) => (
                <li key={h.id} className="ds-panel__history">
                  <div>
                    <strong>{h.summary}</strong>
                    <span className="dock-note">
                      {new Date(h.at).toLocaleString()} · {h.snapshot.tokens.length} tokens · {h.snapshot.themes.length} themes · theme “
                      {h.snapshot.activeThemeId}”
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Restore “${h.summary}”? This creates a new revision with that snapshot.`)) return;
                      void api.designSystem
                        .historyRestore(h.id)
                        .then((next) => {
                          setDoc(next);
                          toast('Restored revision', 'success');
                          return refresh();
                        })
                        .catch((err) => toast(err instanceof Error ? err.message : String(err), 'error'));
                    }}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
