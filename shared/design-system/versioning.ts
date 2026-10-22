import type { DesignSystemChange, DesignSystemDocument, DesignSystemSnapshot } from './types';

const MAX_HISTORY = 40;

function snapshotOf(doc: DesignSystemDocument): DesignSystemSnapshot {
  return {
    tokens: structuredClone(doc.tokens),
    themes: structuredClone(doc.themes),
    components: structuredClone(doc.components),
    activeThemeId: doc.activeThemeId,
  };
}

export function pushHistory(doc: DesignSystemDocument, summary: string): DesignSystemDocument {
  const change: DesignSystemChange = {
    id: `c${Date.now().toString(36)}`,
    at: Date.now(),
    summary,
    snapshot: snapshotOf(doc),
  };
  const history = [change, ...doc.history].slice(0, MAX_HISTORY);
  return {
    ...doc,
    revision: doc.revision + 1,
    meta: { ...doc.meta, updatedAt: Date.now() },
    history,
  };
}

export function restoreRevision(doc: DesignSystemDocument, changeId: string): DesignSystemDocument | null {
  const change = doc.history.find((h) => h.id === changeId);
  if (!change) return null;
  return pushHistory(
    {
      ...doc,
      tokens: structuredClone(change.snapshot.tokens),
      themes: structuredClone(change.snapshot.themes),
      components: structuredClone(change.snapshot.components),
      activeThemeId: change.snapshot.activeThemeId,
    },
    `Restored: ${change.summary}`,
  );
}
