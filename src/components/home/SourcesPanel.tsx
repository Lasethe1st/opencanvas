import { FileText, FolderOpen, Globe, MessageCircle, Search, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { AiChatItem } from '../../../shared/ai';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

export type SourceKind = 'file' | 'web' | 'google' | 'project' | 'chat';

/** One icon and one colour per kind of source, used by the @ picker, the inline highlight and the Sources panel. */
export const SOURCE_META: Record<SourceKind, { icon: LucideIcon; label: string; color: string }> = {
  project: { icon: FolderOpen, label: 'Project', color: 'var(--src-project)' },
  chat: { icon: MessageCircle, label: 'Chat', color: 'var(--src-chat)' },
  file: { icon: FileText, label: 'File', color: 'var(--src-file)' },
  web: { icon: Globe, label: 'Web', color: 'var(--src-web)' },
  google: { icon: Search, label: 'Google', color: 'var(--src-google)' },
};

/** The coloured square that carries a source's icon. */
export function SourceIcon({ kind, className = 'size-4' }: { kind: SourceKind; className?: string }) {
  const { icon: Icon, label, color } = SOURCE_META[kind];
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ color }} title={label}>
      <Icon className={className} strokeWidth={2} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export interface Source {
  id: string;
  kind: SourceKind;
  title: string;
  detail: string;
  href?: string;
}

const URL_RE = /https?:\/\/[^\s<>"'\])]+/g;
const FILE_TOOLS: Record<string, string> = { read_file: 'Read', write_file: 'Wrote' };

/** Real references from the chat: files the AI read or wrote, and links it cited. Newest first. */
export function sourcesFromChat(chat: AiChatItem[]): Source[] {
  const out = new Map<string, Source>();
  for (const item of chat) {
    if (item.kind === 'tool' && item.state !== 'failed' && FILE_TOOLS[item.tool]) {
      const path = item.summary.replace(/^(Reading|Writing)\s+/, '').trim();
      if (path && !/^an? file$/.test(path)) out.set(`file:${path}`, { id: `file:${path}`, kind: 'file', title: path.split(/[\\/]/).pop() ?? path, detail: `${FILE_TOOLS[item.tool]} · ${path}` });
    }
    if (item.kind === 'assistant') {
      for (const raw of item.text.match(URL_RE) ?? []) {
        const href = raw.replace(/[.,;:!?]+$/, '');
        let host = '';
        try {
          host = new URL(href).hostname.replace(/^www\./, '');
        } catch {
          continue;
        }
        const google = /(^|\.)google\.[a-z.]+$/.test(host);
        out.set(`web:${href}`, { id: `web:${href}`, kind: google ? 'google' : 'web', title: host, detail: href, href });
      }
    }
  }
  return [...out.values()].reverse();
}

export function useSources(chat: AiChatItem[]): Source[] {
  return useMemo(() => sourcesFromChat(chat), [chat]);
}

export function SourcesPanel({ sources }: { sources: Source[] }) {
  if (!sources.length)
    return (
      <Empty className="border-0 py-10">
        <EmptyHeader>
          <EmptyTitle>No sources yet</EmptyTitle>
          <EmptyDescription>Files and links the AI uses will show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {sources.map((s) => {
        const body = (
          <>
            <SourceIcon kind={s.kind} className="mt-0.5 size-4" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs font-medium">{s.title}</strong>
              <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>
            </span>
          </>
        );
        const cls = 'flex items-start gap-2 rounded-[8px] px-2 py-1.5 text-start transition-colors duration-150 hover:bg-accent focus-visible:bg-accent';
        return (
          <li key={s.id} title={s.detail}>
            {s.href ? (
              <a href={s.href} target="_blank" rel="noopener noreferrer" className={cls}>
                {body}
              </a>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
