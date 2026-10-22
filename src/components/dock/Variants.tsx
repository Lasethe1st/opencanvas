import { Check, Eye, Loader2, RotateCcw, Sparkles, Square, Trash2 } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { VARIANT_COUNT, clampVariantCount, variantLetter, type VariantRecord } from '../../../shared/variants';
import { errorMessage } from '../../lib/actions';
import { openAiSettings } from '../../lib/ai';
import { api } from '../../lib/api';
import { getState, setState, toast, useStore } from '../../lib/store';
import { Button } from '../../ui/primitives.jsx';

function PanelHead({ title, status }: { title: string; status?: string }) {
  return (
    <div className="dock-head">
      <h2 className="dock-head__title">{title}</h2>
      {status && <span className="dock-head__status">{status}</span>}
    </div>
  );
}

function elementLabel(): { id: string; name: string; tag: string; file: string; line: number } | null {
  const s = getState();
  const sel = s.selection;
  const info = s.sourceInfo;
  if (!sel) return null;
  return {
    id: sel.id,
    name: info?.name || sel.name || sel.tag,
    tag: info?.tag || sel.tag,
    file: info?.file || sel.id.split(':')[0],
    line: info?.line ?? (Number(sel.id.split(':')[1]) || 0),
  };
}

export function VariantsPanel() {
  const variants = useStore((s) => s.variants);
  const aiReady = useStore((s) => !!s.aiStatus?.ready);
  const aiBusy = useStore((s) => !!s.aiTurnId);
  const selection = useStore((s) => s.selection);
  const highlight = useStore((s) => s.variantHighlightId);
  const [request, setRequest] = useState('');
  const [count, setCount] = useState<number>(VARIANT_COUNT.default);
  const el = selection ? elementLabel() : null;

  const open = variants.filter((v) => v.status === 'ready' || v.status === 'generating' || v.status === 'failed' || v.status === 'stale');
  const generating = open.some((v) => v.status === 'generating') || (aiBusy && open.some((v) => v.status === 'generating'));
  const setId = open[0]?.setId;
  const ready = open.filter((v) => v.status === 'ready').length;
  const total = open.length;

  useEffect(() => {
    void api.variants.list().then((list) => setState({ variants: list }));
  }, []);

  const generate = async () => {
    if (!el) return;
    try {
      await api.variants.generate({ elementId: el.id, request: request.trim() || 'Propose a distinct alternative', count });
      setState({ variants: await api.variants.list(), dockMode: 'variants' });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const apply = async (id: string) => {
    try {
      const result = await api.variants.apply(id);
      if (!result.ok) {
        toast(result.error || 'Could not apply', 'error');
        setState({ variants: await api.variants.list() });
        return;
      }
      toast('Variant applied');
      setState({ variants: await api.variants.list(), variantHighlightId: null });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const discard = async (id: string) => {
    await api.variants.discard(id);
    setState({ variants: await api.variants.list(), variantHighlightId: null });
  };

  const discardAll = async () => {
    if (!setId) return;
    await api.variants.discardSet(setId);
    setState({ variants: await api.variants.list(), variantHighlightId: null });
  };

  const retry = async (id: string) => {
    try {
      await api.variants.retry(id);
      setState({ variants: await api.variants.list() });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const onCardKey = (v: VariantRecord, e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setState({ variantHighlightId: v.id });
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      if (v.status === 'ready') void apply(v.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void discard(v.id);
    }
  };

  return (
    <div className="dock-pane dock-pane--scroll">
      <PanelHead title="Variants" status={generating ? `${ready} of ${total} ready` : open.length ? `${open.length} open` : undefined} />

      {!el && <p className="dock-empty">Select an element on the canvas to generate alternatives. Variants stay outside your source until you apply one.</p>}

      {el && !aiReady && (
        <div className="dock-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <p className="dock-note">Set up AI to generate variants here. Variants proposed over MCP still appear below.</p>
          <Button size="sm" icon={<Sparkles size={13} />} onClick={openAiSettings}>
            Set up AI
          </Button>
        </div>
      )}

      {el && (
        <div className="variant-form">
          <div className="variant-form__meta">
            <strong>{el.name}</strong>
            <span>
              {'<'}
              {el.tag}
              {'>'} · {el.file}:{el.line}
            </span>
          </div>
          {aiReady && (
            <>
              <label className="variant-form__label">
                What should change?
                <textarea
                  className="dock-input"
                  rows={3}
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  placeholder="e.g. A bolder headline with a shorter subline"
                  disabled={generating}
                />
              </label>
              <div className="variant-form__row">
                <label>
                  Count
                  <select value={count} disabled={generating} onChange={(e) => setCount(clampVariantCount(Number(e.target.value)))} aria-label="Number of variants">
                    {Array.from({ length: VARIANT_COUNT.max - VARIANT_COUNT.min + 1 }, (_, i) => VARIANT_COUNT.min + i).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                {generating ? (
                  <Button size="sm" variant="ghost" icon={<Square size={13} />} onClick={() => void api.variants.cancel()}>
                    Stop
                  </Button>
                ) : (
                  <Button size="sm" icon={<Sparkles size={13} />} onClick={() => void generate()}>
                    Generate
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {generating && (
        <p className="dock-note" role="status">
          <Loader2 size={12} className="ai-spin" /> {ready} of {total} ready
        </p>
      )}

      {open.length > 0 && (
        <ul className="variant-list" role="listbox" aria-label="Variants">
          {open.map((v, i) => (
            <VariantCard key={v.id} variant={v} index={i} active={highlight === v.id} onKey={onCardKey} onApply={apply} onDiscard={discard} onRetry={retry} />
          ))}
        </ul>
      )}

      {open.length > 0 && setId && (
        <div className="dock-actions">
          <Button size="sm" variant="ghost" onClick={() => void discardAll()}>
            Keep original
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => void discardAll()}>
            Discard all
          </Button>
        </div>
      )}

      {total > 0 && ready < total && !generating && open.some((v) => v.status === 'failed') && (
        <p className="dock-note">Fewer variants arrived than requested. Retry the failed ones or generate again.</p>
      )}
    </div>
  );
}

function VariantCard({
  variant: v,
  index,
  active,
  onKey,
  onApply,
  onDiscard,
  onRetry,
}: {
  variant: VariantRecord;
  index: number;
  active: boolean;
  onKey: (v: VariantRecord, e: KeyboardEvent) => void;
  onApply: (id: string) => void;
  onDiscard: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <li
      role="option"
      tabIndex={0}
      aria-selected={active}
      className={`variant-card${active ? ' is-active' : ''}${v.status === 'failed' || v.status === 'stale' ? ' is-failed' : ''}`}
      onMouseEnter={() => setState({ variantHighlightId: v.id })}
      onMouseLeave={() => setState({ variantHighlightId: null })}
      onKeyDown={(e) => onKey(v, e)}
    >
      <div className="variant-card__head">
        <span className="variant-card__letter">{variantLetter(index)}</span>
        <div>
          <strong>{v.label || (v.status === 'generating' ? 'Generating…' : 'Variant')}</strong>
          <span className="variant-card__status">{v.status}</span>
        </div>
      </div>
      {v.notes && <p className="variant-card__notes">{v.notes}</p>}
      {v.error && <p className="variant-card__error">{v.error}</p>}
      <div className="variant-card__actions">
        {v.status === 'ready' && (
          <>
            <Action icon={<Eye size={13} />} onClick={() => setState({ variantHighlightId: v.id })}>
              Show on canvas
            </Action>
            <Button size="sm" icon={<Check size={13} />} onClick={() => onApply(v.id)}>
              Apply
            </Button>
            <Action icon={<Trash2 size={13} />} onClick={() => onDiscard(v.id)}>
              Discard
            </Action>
          </>
        )}
        {(v.status === 'failed' || v.status === 'stale') && (
          <>
            <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => onRetry(v.id)}>
              {v.status === 'stale' ? 'Regenerate' : 'Retry'}
            </Button>
            <Action icon={<Trash2 size={13} />} onClick={() => onDiscard(v.id)}>
              Discard
            </Action>
          </>
        )}
        {v.status === 'generating' && (
          <span className="variant-card__working">
            <Loader2 size={13} className="ai-spin" /> Working…
          </span>
        )}
      </div>
    </li>
  );
}

function Action({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" icon={icon} onClick={onClick}>
      {children}
    </Button>
  );
}
