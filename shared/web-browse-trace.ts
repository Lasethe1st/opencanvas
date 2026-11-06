import type { AiChatItem } from './ai';

/** Tools that browse the public web. Consecutive calls render as one status line. */
export const WEB_BROWSE_TOOLS = new Set<string>(['web_search', 'fetch_url']);

type ToolItem = Extract<AiChatItem, { kind: 'tool' }>;
type WebBrowseItem = ToolItem & { tool: 'web_search' | 'fetch_url' };

export function isWebBrowseTool(item: AiChatItem): item is WebBrowseItem {
  return item.kind === 'tool' && WEB_BROWSE_TOOLS.has(item.tool);
}

export type ChatDisplayEntry =
  | { kind: 'item'; item: AiChatItem }
  | { kind: 'browse'; id: string; items: WebBrowseItem[] };

/**
 * Collapse each consecutive run of web_search / fetch_url into one entry.
 * A thinking block, assistant message, or any other tool ends the burst.
 */
export function groupConsecutiveWebBrowses(items: AiChatItem[]): ChatDisplayEntry[] {
  const out: ChatDisplayEntry[] = [];
  let burst: WebBrowseItem[] = [];
  const flush = () => {
    if (!burst.length) return;
    out.push({ kind: 'browse', id: burst[0].id, items: burst });
    burst = [];
  };
  for (const item of items) {
    if (isWebBrowseTool(item)) {
      burst.push(item);
      continue;
    }
    flush();
    out.push({ kind: 'item', item });
  }
  flush();
  return out;
}

/**
 * The one tool row a browse burst should show.
 * Anything still running stays "Browsing"; otherwise a failure replaces "Browsed".
 */
export function browseBurstTool(items: WebBrowseItem[]): WebBrowseItem {
  const running = items.find((item) => item.state === 'running');
  if (running) return running;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].state === 'failed') return items[i];
  }
  return items[items.length - 1];
}
