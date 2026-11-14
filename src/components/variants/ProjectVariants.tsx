import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { AiMagicIcon, StopIcon } from '@hugeicons/core-free-icons';
import { VARIANT_COUNT, clampVariantCount } from '../../../shared/variants';
import { errorMessage, undo } from '../../lib/actions';
import { openAiSettings } from '../../lib/ai';
import { api } from '../../lib/api';
import { setState, toast, useStore } from '../../lib/store';
import { useProjectBlocks } from '../../lib/variant-blocks';
import { VariantRow, type VariantActions } from './VariantBlocks';

const refresh = async () => setState({ variants: await api.variants.list() });

/** Apply, discard, retry and preview for variants of the open project. */
export function useVariantActions(): VariantActions {
  return useMemo<VariantActions>(
    () => ({
      apply: async (id) => {
        try {
          const result = await api.variants.apply(id);
          if (!result.ok) toast(result.error || 'Could not apply', 'error');
          else toast('Variant applied', 'success', { label: 'Undo', run: () => void undo() });
          setState({ variantHighlightId: null });
        } catch (err) {
          toast(errorMessage(err), 'error');
        }
        await refresh();
      },
      discard: async (id) => {
        await api.variants.discard(id);
        setState({ variantHighlightId: null });
        await refresh();
      },
      retry: async (id) => {
        try {
          await api.variants.retry(id);
        } catch (err) {
          toast(errorMessage(err), 'error');
        }
        await refresh();
      },
    }),
    [],
  );
}

/** The AI's reply in a chat: the blocks of one variant set. */
export function ProjectVariantRow({ setId }: { setId: string }) {
  const items = useProjectBlocks({ setId });
  const actions = useVariantActions();
  useEffect(() => { void refresh(); }, []);
  if (!items.length) {
    return <p className="m-0 text-xs text-muted-foreground">These variants were applied or discarded.</p>;
  }
  // In a chat reply the blocks only open and apply; discarding lives in the right-click popup.
  return <VariantRow items={items} actions={{ apply: actions.apply, retry: actions.retry }} per={3} />;
}

const pill = 'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm outline-none transition-[background-color,transform] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-foreground/40';

/** The right-click popup: say what should change, then scroll through the blocks that come back. */
export function VariantsPopover({ elementId, name, onClose }: { elementId: string; name: string; onClose: () => void }) {
  const items = useProjectBlocks({ elementId });
  const aiReady = useStore((s) => !!s.aiStatus?.ready);
  const base = useVariantActions();
  // Using a variant closes the popup; the centre dock then offers Undo.
  const actions = useMemo(() => ({ ...base, apply: async (id: string) => { onClose(); await base.apply?.(id); } }), [base, onClose]);
  const [request, setRequest] = useState('');
  const [count, setCount] = useState<number>(VARIANT_COUNT.default);
  const [again, setAgain] = useState(false);
  const generating = items.some((v) => v.status === 'generating');
  const showForm = items.length === 0 || again;

  useEffect(() => { void refresh(); }, []);

  const generate = async () => {
    try {
      await api.variants.generate({ elementId, request: request.trim() || 'Propose a distinct alternative', count });
      setAgain(false);
      await refresh();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3" data-tw="">
      {generating && (
        <div className="flex justify-end px-1">
          <button type="button" onClick={() => void api.variants.cancel()} className={`${pill} border border-foreground/10 hover:bg-accent`}>
            <HugeiconsIcon icon={StopIcon} size={13} strokeWidth={1.8} aria-hidden /> Stop
          </button>
        </div>
      )}

      {showForm && !generating && (
        aiReady ? (
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void generate(); }}>
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void generate(); } }}
              rows={2}
              autoFocus
              placeholder="What should change? Leave empty for a few alternatives"
              aria-label="What should change?"
              className="w-full resize-none border border-foreground/10 bg-muted/40 px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-foreground/30"
              style={{ borderRadius: 18, cornerShape: 'squircle' } as React.CSSProperties}
            />
            <div className="flex items-center gap-2">
              <div role="radiogroup" aria-label="How many variants" className="flex items-center gap-0.5 rounded-full border border-foreground/10 p-0.5">
                {Array.from({ length: VARIANT_COUNT.max - VARIANT_COUNT.min + 1 }, (_, i) => VARIANT_COUNT.min + i).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={count === n}
                    onClick={() => setCount(clampVariantCount(n))}
                    className={`grid size-7 place-items-center rounded-full text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/40 ${count === n ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              {again && <button type="button" onClick={() => setAgain(false)} className={`${pill} hover:bg-accent`}>Cancel</button>}
              <button type="submit" className={`${pill} bg-foreground font-medium text-background`}>
                <HugeiconsIcon icon={AiMagicIcon} size={14} strokeWidth={1.8} aria-hidden /> Generate
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3 px-1">
            <p className="m-0 flex-1 text-xs text-muted-foreground">Set up AI to generate variants. Variants proposed over MCP still show up here.</p>
            <button type="button" onClick={() => { onClose(); openAiSettings(); }} className={`${pill} border border-foreground/10 hover:bg-accent`}>Set up AI</button>
          </div>
        )
      )}

      {items.length > 0 && <VariantRow items={items} actions={actions} itemWidth={170} nav onAdd={!generating && aiReady && !again ? () => setAgain(true) : undefined} />}
    </div>
  );
}
