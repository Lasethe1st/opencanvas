import { CaretRight, ChatCircle, FileText, FileText as FileIcon, FolderOpen as FolderIcon, FolderSimple, Globe, Lightning, MagnifyingGlass, X, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import type { DirEntry } from '../../../shared/types';
import { api } from '../../lib/api';
import { highlight } from '../../lib/highlight';
import { cn } from '@/lib/utils';
import type { AiChatItem } from '../../../shared/ai';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

export type SourceKind = 'file' | 'web' | 'google' | 'project' | 'chat' | 'skill';

/** One icon and one colour per kind of source, used by the @ picker, the inline highlight and the Sources panel. */
export const SOURCE_META: Record<SourceKind, { icon: PhosphorIcon; label: string; color: string }> = {
  project: { icon: FolderSimple, label: 'Project', color: 'var(--src-project)' },
  chat: { icon: ChatCircle, label: 'Chat', color: 'var(--src-chat)' },
  file: { icon: FileText, label: 'File', color: 'var(--src-file)' },
  web: { icon: Globe, label: 'Web', color: 'var(--src-web)' },
  google: { icon: MagnifyingGlass, label: 'Google', color: 'var(--src-google)' },
  skill: { icon: Lightning, label: 'Skill', color: 'var(--src-skill)' },
};

/** A source's icon: solid, in the colour of its kind. */
export function SourceIcon({ kind, className = 'size-4' }: { kind: SourceKind; className?: string }) {
  const { icon: Icon, label, color } = SOURCE_META[kind];
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ color }} title={label}>
      <Icon className={className} weight="fill" aria-hidden />
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

export type OpenFile = { root: string; rel: string };

/** One folder level, loaded when it first appears. Folders open in place; files open in a dialog. */
function TreeLevel({ root, rel, depth, selected, onFile }: { root: string; rel: string; depth: number; selected: OpenFile | null; onFile: (f: OpenFile) => void }) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let live = true;
    api.projectFiles.list(root, rel).then((e) => live && setEntries(e), (err) => live && setError(err instanceof Error ? err.message : 'Could not read this folder.'));
    return () => {
      live = false;
    };
  }, [root, rel]);
  const pad = { paddingInlineStart: 8 + depth * 14 };
  if (error) return <p className="m-0 py-1 pe-2 text-xs text-muted-foreground" style={pad}>{error}</p>;
  if (!entries) return <p className="m-0 py-1 pe-2 text-xs text-muted-foreground" style={pad}>Loading…</p>;
  if (!entries.length) return <p className="m-0 py-1 pe-2 text-xs text-muted-foreground" style={pad}>Empty folder</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {entries.map((e) => {
        const path = rel ? `${rel}/${e.name}` : e.name;
        const expanded = open.has(path);
        return (
          <li key={path}>
            <button
              type="button"
              title={path}
              aria-expanded={e.dir ? expanded : undefined}
              className={cn('flex w-full items-center gap-1.5 rounded-[6px] py-1 pe-2 text-start text-xs text-[color:var(--fg-2)] transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:bg-accent', !e.dir && selected?.root === root && selected.rel === path && 'bg-accent text-foreground')}
              style={pad}
              onClick={() =>
                e.dir
                  ? setOpen((cur) => {
                      const next = new Set(cur);
                      if (!next.delete(path)) next.add(path);
                      return next;
                    })
                  : onFile({ root, rel: path })
              }
            >
              {e.dir ? <CaretRight className={cn('size-3 shrink-0 motion-safe:transition-transform motion-safe:duration-150', expanded && 'rotate-90')} aria-hidden /> : <span className="size-3 shrink-0" aria-hidden />}
              {e.dir ? <FolderIcon className="size-3.5 shrink-0 text-[color:var(--src-project)]" aria-hidden /> : <FileIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="min-w-0 truncate">{e.name}</span>
            </button>
            {e.dir && expanded && <TreeLevel root={root} rel={path} depth={depth + 1} selected={selected} onFile={onFile} />}
          </li>
        );
      })}
    </ul>
  );
}

/** An opened file, shown inside the panel (read-only). */
export function FileViewer({ file, onClose }: { file: OpenFile; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    setText(null);
    setError('');
    api.projectFiles.read(file.root, file.rel).then((t) => live && setText(t), (err) => live && setError(err instanceof Error ? err.message : 'Could not open this file.'));
    return () => {
      live = false;
    };
  }, [file.root, file.rel]);
  const name = file.rel.split('/').pop() ?? file.rel;
  const html = useMemo(() => (text === null ? '' : highlight(text, name)), [text, name]);
  const copy = async () => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <section aria-label={`File ${name}`} className="flex h-full min-h-0 flex-col py-2 pe-2 ps-1">
      <div className="flex shrink-0 items-center gap-1 pb-1.5">
        <div className="min-w-0 flex-1 ps-1">
          <strong className="block truncate text-xs font-medium">{name}</strong>
          {file.rel.includes('/') && <span className="block truncate text-[11px] text-muted-foreground">{file.rel}</span>}
        </div>
        <button type="button" disabled={text === null} className="inline-flex h-6 items-center rounded-[6px] px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" aria-label="Close file" className="inline-flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" onClick={onClose}>
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-[10px] bg-muted">
        {error ? (
          <p className="m-0 p-3 text-xs text-muted-foreground">{error}</p>
        ) : text === null ? (
          <p className="m-0 p-3 text-xs text-muted-foreground">Loading…</p>
        ) : (
          <pre className="code-hl m-0 min-w-max p-3 font-mono text-xs leading-5 text-foreground"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
        )}
      </div>
    </section>
  );
}

export function SourcesPanel({ sources, file, onFile }: { sources: Source[]; file: OpenFile | null; onFile: (f: OpenFile) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
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
    <>
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
          const cls = 'flex w-full items-start gap-2 rounded-[8px] px-2 py-1.5 text-start transition-colors duration-150 hover:bg-accent focus-visible:bg-accent';
          if (s.kind === 'project') {
            const root = s.id.replace(/^project:/, '');
            const isOpen = expanded.has(s.id);
            return (
              <li key={s.id} title={s.detail}>
                <button
                  type="button"
                  className={cls}
                  aria-expanded={isOpen}
                  onClick={() =>
                    setExpanded((cur) => {
                      const next = new Set(cur);
                      if (!next.delete(s.id)) next.add(s.id);
                      return next;
                    })
                  }
                >
                  {body}
                  <CaretRight className={cn('mt-0.5 size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150', isOpen && 'rotate-90')} aria-hidden />
                </button>
                {isOpen && <TreeLevel root={root} rel="" depth={0} selected={file} onFile={onFile} />}
              </li>
            );
          }
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
    </>
  );
}
