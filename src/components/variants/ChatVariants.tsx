import { useMemo } from 'react';
import { toast } from '../../lib/store';
import type { BlockVariant } from '../../lib/variant-blocks';
import { VariantRow } from './VariantBlocks';

/** The marker the editor writes into a chat reply to say "show this variant set here". */
export const variantSetFence = (setId: string) => '```variants\nset=' + setId + '\n```';

export function parseSetId(code: string): string | null {
  return /set=([\w-]+)/.exec(code)?.[1] ?? null;
}

function parseSnippet(code: string, i: number): { title: string; html: string } {
  const m = /^\s*<!--\s*title:\s*(.*?)\s*-->\s*/i.exec(code);
  return { title: m?.[1] || `Variant ${String.fromCharCode(65 + i)}`, html: m ? code.slice(m[0].length) : code };
}

/** Standalone HTML variants an AI reply carried in `variant` fences, as a row of blocks. */
export function HtmlVariantRow({ codes }: { codes: string[] }) {
  const key = codes.join('\u0000');
  const items = useMemo<BlockVariant[]>(
    () => codes.map((c, i) => {
      const { title, html } = parseSnippet(c, i);
      return { id: `snip-${i}-${html.length}-${title}`, label: title, status: 'ready', source: { kind: 'html', html } };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const copy = async (id: string) => {
    const idx = items.findIndex((v) => v.id === id);
    if (idx < 0) return;
    try {
      await navigator.clipboard.writeText(parseSnippet(codes[idx], idx).html);
      toast('Copied the HTML', 'success');
    } catch {
      toast('Copy was blocked by the browser', 'error');
    }
  };
  return <VariantRow items={items} actions={{ apply: copy }} per={3} />;
}
