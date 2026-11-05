import type { ReactNode } from 'react';

/**
 * A small, dependency-free markdown renderer for chat replies: bold, italics, inline code, links, headings and lists.
 * Everything is built as React elements (never HTML strings), and only http(s) and mailto links are ever clickable.
 */

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>)\]]+)|(\*[^*\s][^*\n]*?\*|(?<![\w])_[^_\s][^_\n]*?_(?![\w]))/g;

const safeHref = (url: string) => (/^(https?:\/\/|mailto:)/i.test(url) ? url : null);

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-foreground underline decoration-foreground/30 underline-offset-2 transition-colors hover:decoration-foreground">
      {children}
    </a>
  );
}

export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const key = `${keyPrefix}-${n++}`;
    const [token, code, bold, link, bare, italic] = m;
    if (code) {
      out.push(<code key={key} className="rounded-[6px] bg-foreground/[0.07] px-1 py-0.5 font-mono text-[0.9em]">{code.slice(1, -1)}</code>);
    } else if (bold) {
      out.push(<strong key={key} className="font-semibold">{renderInline(bold.slice(2, -2), key)}</strong>);
    } else if (link) {
      const close = link.lastIndexOf('](');
      const label = link.slice(1, close);
      const href = safeHref(link.slice(close + 2, -1));
      out.push(href ? <Link key={key} href={href}>{renderInline(label, key)}</Link> : label);
    } else if (bare) {
      // Trailing punctuation belongs to the sentence, not the address.
      const url = bare.replace(/[.,;:!?'"]+$/, '');
      out.push(<Link key={key} href={url}>{url}</Link>);
      if (url.length < bare.length) out.push(bare.slice(url.length));
    } else if (italic) {
      out.push(<em key={key}>{renderInline(italic.slice(1, -1), key)}</em>);
    } else {
      out.push(token);
    }
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { type: 'p'; text: string } | { type: 'h'; level: number; text: string } | { type: 'ul' | 'ol'; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join('\n') });
    para = [];
  };
  for (const line of text.split('\n')) {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (!line.trim()) flush();
    else if (heading) {
      flush();
      blocks.push({ type: 'h', level: heading[1].length, text: heading[2] });
    } else if (bullet || numbered) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const item = (bullet ?? numbered)![1];
      if (last && last.type === type) last.items.push(item);
      else blocks.push({ type, items: [item] });
    } else para.push(line);
  }
  flush();
  return blocks;
}

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <>
      {parseBlocks(text).map((b, i) => {
        const key = `b${i}`;
        if (b.type === 'h') return <p key={key} className="m-0 font-semibold">{renderInline(b.text, key)}</p>;
        if (b.type === 'ul' || b.type === 'ol') {
          const List = b.type;
          return (
            <List key={key} className={`m-0 flex flex-col gap-1 ps-5 ${b.type === 'ul' ? 'list-disc' : 'list-decimal'}`}>
              {b.items.map((it, j) => <li key={j} className="ps-0.5">{renderInline(it, `${key}-${j}`)}</li>)}
            </List>
          );
        }
        return <p key={key} className="m-0 whitespace-pre-wrap">{renderInline((b as Extract<Block, { type: 'p' }>).text, key)}</p>;
      })}
    </>
  );
}
