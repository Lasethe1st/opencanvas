import type { ComponentDef, DesignSystemDocument } from './types';

/** Register or update a component definition (metadata only). */
export function upsertComponent(doc: DesignSystemDocument, def: ComponentDef): DesignSystemDocument {
  const components = doc.components.some((c) => c.id === def.id)
    ? doc.components.map((c) => (c.id === def.id ? def : c))
    : [...doc.components, def];
  return { ...doc, components };
}

/** Merge defs into the document without wiping hand-edited entries. */
export function mergeComponents(doc: DesignSystemDocument, defs: ComponentDef[]): DesignSystemDocument {
  let next = doc;
  for (const def of defs) {
    const existing = next.components.find((c) => c.id === def.id);
    if (existing) {
      // Keep tokenDeps / variants the user may have set; refresh file path when empty.
      next = upsertComponent(next, {
        ...existing,
        file: existing.file || def.file,
        name: existing.name || def.name,
      });
    } else {
      next = upsertComponent(next, def);
    }
  }
  return next;
}

/** Heuristic: capitalized outline names → component registry entries. */
export function componentsFromOutline(
  nodes: { name: string | null; tag: string; file?: string; component?: boolean }[],
): ComponentDef[] {
  const out: ComponentDef[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (!n.component && !/^[A-Z]/.test(n.tag)) continue;
    const name = n.name || n.tag;
    const id = name.replace(/\W+/g, '-').toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      file: n.file || '',
      tokenDeps: [],
      variants: [],
      states: ['default', 'hover', 'focus', 'disabled'],
      props: [],
    });
  }
  return out;
}

/**
 * Seed registry entries from a shadcn `components.json` + UI folder listing.
 * `uiFiles` are project-relative paths (e.g. `src/components/ui/button.tsx`).
 */
export function componentsFromShadcn(
  componentsJson: unknown,
  uiFiles: string[],
): { uiDir: string | null; components: ComponentDef[] } {
  const cfg = componentsJson && typeof componentsJson === 'object' ? (componentsJson as Record<string, unknown>) : null;
  const aliases = cfg?.aliases && typeof cfg.aliases === 'object' ? (cfg.aliases as Record<string, string>) : null;
  const uiAlias = typeof aliases?.ui === 'string' ? aliases.ui : null;
  // "@\/components\/ui" → guess src/components/ui when files aren't passed with that prefix.
  const uiDirHint = uiAlias?.replace(/^@\//, 'src/') ?? null;

  const files = uiFiles.filter((f) => /\.(tsx|jsx)$/i.test(f) && !/\.stories\./i.test(f) && !/\.test\./i.test(f));
  const components: ComponentDef[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const base = file.replace(/\\/g, '/').split('/').pop()!.replace(/\.(tsx|jsx)$/i, '');
    if (!base || base.startsWith('use-') || base === 'index' || base === 'utils') continue;
    const name = base
      .split(/[-_]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
    const id = `ui-${base.toLowerCase()}`;
    if (seen.has(id)) continue;
    seen.add(id);
    components.push({
      id,
      name,
      file,
      description: 'shadcn/ui',
      tokenDeps: [],
      variants: [],
      states: ['default', 'hover', 'focus', 'disabled'],
      props: [],
    });
  }
  return { uiDir: uiDirHint, components };
}
