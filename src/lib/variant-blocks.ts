/** Turns variant records into the blocks the UI shows, and holds the sizes the previews measured. */
import { useMemo } from 'react';
import type { VariantRecord } from '../../shared/variants';
import { pageFrames } from './canvas';
import { pageUrl } from './pages';
import { getState, pageOf, useStore } from './store';

/** What a block draws: the real page with the variant switched on, or a standalone HTML snippet. */
export type PreviewSource =
  | { kind: 'frame'; url: string; elementId: string; width: number; height: number }
  | { kind: 'html'; html: string };

export type BlockStatus = 'generating' | 'ready' | 'failed' | 'stale';

export interface BlockVariant {
  id: string;
  label: string;
  notes?: string;
  status: BlockStatus;
  error?: string;
  source: PreviewSource | null;
}

const OPEN: VariantRecord['status'][] = ['generating', 'ready', 'failed', 'stale'];

/** The frame of the current page that shows the variant's source file. */
function sourceFrameFor(v: VariantRecord) {
  const s = getState();
  const frames = pageFrames(s);
  return (
    frames.find((f) => {
      const file = pageOf(f, s)?.file;
      return !!file && (file === v.source.file || v.source.elementId.startsWith(file));
    }) ?? frames[0] ?? null
  );
}

export function variantPreviewUrl(v: VariantRecord): string | null {
  const s = getState();
  const base = s.previewStatus.state === 'running' ? s.previewStatus.url : null;
  const frame = sourceFrameFor(v);
  if (!base || !frame) return null;
  return pageUrl(base, pageOf(frame, s), frame.routeValues, v.id);
}

export function variantSource(v: VariantRecord): PreviewSource | null {
  const frame = sourceFrameFor(v);
  const url = variantPreviewUrl(v);
  if (!frame || !url) return null;
  return { kind: 'frame', url, elementId: v.source.elementId, width: frame.width, height: frame.height };
}

/** Open variants for one set (or the latest set made for an element), as blocks. */
export function useProjectBlocks(opts: { setId?: string | null; elementId?: string | null }): BlockVariant[] {
  const variants = useStore((s) => s.variants);
  const url = useStore((s) => (s.previewStatus.state === 'running' ? s.previewStatus.url : null));
  const frames = useStore((s) => s.frames);
  return useMemo(() => {
    let rows = variants.filter((v) => OPEN.includes(v.status));
    if (opts.setId) rows = rows.filter((v) => v.setId === opts.setId);
    else if (opts.elementId) {
      const mine = rows.filter((v) => v.source.elementId === opts.elementId);
      const latest = mine.length ? mine.reduce((a, b) => (b.createdAt >= a.createdAt ? b : a)).setId : null;
      rows = mine.filter((v) => v.setId === latest);
    } else rows = [];
    return rows.map((v, i) => ({
      id: v.id,
      label: v.label || (v.status === 'generating' ? 'Working…' : `Variant ${String.fromCharCode(65 + i)}`),
      notes: v.notes,
      status: v.status as BlockStatus,
      error: v.error,
      source: v.status === 'ready' ? variantSource(v) : null,
    }));
    // url/frames are read through variantSource via the store
  }, [variants, url, frames, opts.setId, opts.elementId]);
}

/** Natural size of each preview once it has rendered, so blocks, the dialog and the thumbnails agree and don't jump. */
const sizes = new Map<string, { w: number; h: number; x: number; y: number }>();
export const rememberSize = (id: string, n: { w: number; h: number; x: number; y: number }) => void sizes.set(id, n);
export const sizeOf = (id: string) => sizes.get(id) ?? null;

export interface Fit { w: number; h: number; scale: number; dx: number; dy: number }

/** Scales a natural w×h into a box no bigger than maxW×maxH and no smaller than minW×minH, centred. */
export function fitBox(nat: { w: number; h: number } | null, o: { maxW: number; maxH: number; minW: number; minH: number; maxScale?: number }): Fit {
  const n = nat ?? { w: o.maxW * 0.7, h: o.maxH * 0.7 };
  const scale = Math.min(o.maxW / n.w, o.maxH / n.h, o.maxScale ?? 1.5);
  const cw = n.w * scale;
  const ch = n.h * scale;
  const w = Math.max(o.minW, Math.min(o.maxW, cw));
  const h = Math.max(o.minH, Math.min(o.maxH, ch));
  return { w: Math.round(w), h: Math.round(h), scale, dx: (w - cw) / 2, dy: (h - ch) / 2 };
}
