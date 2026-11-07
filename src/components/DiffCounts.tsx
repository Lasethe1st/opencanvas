/** Green additions and red deletions. A zero side is omitted; both zero (or unknown) renders nothing. */
export function DiffCounts({ added, removed }: { added?: number; removed?: number }) {
  const showAdd = typeof added === 'number' && added > 0;
  const showDel = typeof removed === 'number' && removed > 0;
  if (!showAdd && !showDel) return null;
  return (
    <span className="diff-counts">
      {showAdd && <span className="diff-counts__add">+{added}</span>}
      {showDel && <span className="diff-counts__del">−{removed}</span>}
    </span>
  );
}
