/**
 * Pure helpers for preview-server `?ocv=<id>` module tagging.
 * Overrides live at `.opencanvas/variants/<id>/<relative path>`.
 */

export const OCV_PARAM = 'ocv';

export function parseOcvId(id: string): { clean: string; query: string; ocv: string | null } {
  const qIndex = id.indexOf('?');
  if (qIndex === -1) return { clean: id, query: '', ocv: null };
  const clean = id.slice(0, qIndex);
  const query = id.slice(qIndex + 1);
  const params = new URLSearchParams(query);
  return { clean, query, ocv: params.get(OCV_PARAM) };
}

export function withOcv(id: string, ocv: string): string {
  const { clean, query } = parseOcvId(id);
  const params = new URLSearchParams(query);
  params.set(OCV_PARAM, ocv);
  const next = params.toString();
  return next ? `${clean}?${next}` : clean;
}

export function stripOcv(id: string): string {
  const { clean, query } = parseOcvId(id);
  if (!query) return clean;
  const params = new URLSearchParams(query);
  params.delete(OCV_PARAM);
  const next = params.toString();
  return next ? `${clean}?${next}` : clean;
}

/** CSS and node_modules stay shared (one React); only JS/TS/JSX/TSX under editable roots get the tag. */
export function isVariantTaggedSource(filePath: string): boolean {
  const base = filePath.split('?')[0].replace(/\\/g, '/');
  if (base.includes('/node_modules/')) return false;
  return /\.(jsx?|tsx?|mjs|cjs)$/i.test(base);
}

export function variantOverrideRel(variantId: string, projectRel: string): string {
  const rel = projectRel.replace(/\\/g, '/').replace(/^\/+/, '');
  return `.opencanvas/variants/${variantId}/${rel}`;
}

/**
 * Absolute path of an override file when it exists, otherwise null (use the real file).
 * `exists` and `join` are injected so unit tests stay filesystem-free.
 */
export function resolveVariantOverride(
  variantId: string,
  projectRel: string,
  exists: (rel: string) => boolean,
): string | null {
  const rel = variantOverrideRel(variantId, projectRel);
  return exists(rel) ? rel : null;
}

/** Whether a resolved module under the project should inherit `?ocv` from its importer. */
export function shouldPropagateOcv(importerId: string | undefined, resolvedCleanPath: string, editableRootPrefixes: string[]): boolean {
  if (!importerId) return false;
  const { ocv } = parseOcvId(importerId);
  if (!ocv) return false;
  if (!isVariantTaggedSource(resolvedCleanPath)) return false;
  const normalized = resolvedCleanPath.replace(/\\/g, '/');
  if (normalized.includes('/node_modules/')) return false;
  return editableRootPrefixes.some((prefix) => {
    const p = prefix.replace(/\\/g, '/');
    return normalized === p || normalized.startsWith(p.endsWith('/') ? p : `${p}/`);
  });
}
