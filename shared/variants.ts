/** Variant proposals: temporary alternatives for one selected element. */

export const VARIANT_COUNT = { min: 1, max: 4, default: 3 } as const;

/** Cap on proposed JSX per variant (bytes, UTF-8). */
export const VARIANT_JSX_MAX_BYTES = 40 * 1024;

/** Drop unused variant records older than this when a project opens. */
export const VARIANT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type VariantStatus = 'generating' | 'ready' | 'failed' | 'applied' | 'discarded' | 'stale';

export interface VariantSource {
  file: string;
  elementId: string;
  label: string;
  /** SHA-256 of the source file when the variant was generated. */
  fileHash: string;
}

export interface VariantRecord {
  id: string;
  setId: string;
  source: VariantSource;
  request: string;
  label: string;
  notes: string;
  createdAt: number;
  status: VariantStatus;
  error?: string;
  /** Relative path of the override file under `.opencanvas/variants/<id>/`. */
  overrideFile?: string;
}

export interface VariantGenerateRequest {
  elementId: string;
  request: string;
  count?: number;
}

export interface VariantSetSummary {
  setId: string;
  source: VariantSource;
  request: string;
  count: number;
  ready: number;
  failed: number;
  generating: boolean;
}

export function clampVariantCount(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : VARIANT_COUNT.default;
  return Math.min(VARIANT_COUNT.max, Math.max(VARIANT_COUNT.min, n));
}

export function variantLetter(index: number): string {
  return String.fromCharCode(65 + Math.max(0, index));
}
