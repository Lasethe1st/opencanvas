import { useEffect, useState } from 'react';
import { loadMemory, subscribeMemory, toggleRemember, type MemoryEntry } from '../../lib/ai-memory';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

/** Replies the AI was asked to remember. Each can be forgotten here. */
export function MemoryList() {
  const [items, setItems] = useState<MemoryEntry[]>(loadMemory);
  useEffect(() => {
    const off = subscribeMemory(() => setItems(loadMemory()));
    return () => {
      off();
    };
  }, []);
  if (!items.length)
    return (
      <Empty className="border-0 py-8">
        <EmptyHeader>
          <EmptyTitle>Nothing remembered yet</EmptyTitle>
          <EmptyDescription>Use the brain button under a reply to keep it for later chats.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((m) => (
        <li key={m.id} className="flex items-start gap-3 rounded-[10px] bg-muted px-3 py-2.5">
          <p className="m-0 line-clamp-4 min-w-0 flex-1 whitespace-pre-wrap text-sm leading-5">{m.text}</p>
          <Button type="button" variant="ghost" className="h-7 shrink-0 rounded-[8px] px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => toggleRemember(m.id, m.text)}>
            Forget
          </Button>
        </li>
      ))}
    </ul>
  );
}
