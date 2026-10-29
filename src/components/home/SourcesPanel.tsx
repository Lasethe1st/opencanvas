import { ArrowSquareOut, CaretRight, ChatCircle, FileText, FolderSimple, Globe, Lightning, MagnifyingGlass, X, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CollapseIcon, Copy01Icon, File02Icon, Folder02Icon } from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useState } from 'react';
import type { DirEntry } from '../../../shared/types';
import { api } from '../../lib/api';
import { highlight } from '../../lib/highlight';
import { cn } from '@/lib/utils';
import type { AiChatItem } from '../../../shared/ai';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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

function hostOf(href?: string): string | null {
  if (!href) return null;
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Candidate favicon URLs for a host (aggregators first — more reliable than /favicon.ico). */
function faviconCandidates(host: string): string[] {
  return [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://${host}/favicon.ico`,
  ];
}

/** Site favicon in a circle; falls back to the kind icon if the image fails. */
export function FaviconCircle({
  href,
  title,
  className,
  size = 28,
}: {
  href?: string;
  title?: string;
  className?: string;
  size?: number;
}) {
  const host = hostOf(href);
  const candidates = host ? faviconCandidates(host) : [];
  const [index, setIndex] = useState(0);
  const src = candidates[index];
  return (
    <span
      title={title ?? host ?? undefined}
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-2 ring-[var(--home-card)]', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setIndex((i) => i + 1)}
        />
      ) : (
        <Globe className="size-[55%] text-[color:var(--src-web)]" weight="fill" aria-hidden />
      )}
    </span>
  );
}

/** One circle per unique host, stacked with overlap. With `links`, click a favicon for a title popup; + expands to a named list. */
export function WebFaviconStack({
  sources,
  max = 3,
  size = 28,
  overlap = 10,
  links = false,
}: {
  sources: Source[];
  max?: number;
  size?: number;
  overlap?: number;
  links?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const unique = useMemo(() => {
    const seen = new Map<string, Source>();
    for (const s of sources) {
      const host = hostOf(s.href);
      if (!host || seen.has(host)) continue;
      seen.set(host, s);
    }
    return [...seen.values()];
  }, [sources]);
  const shown = unique.slice(0, max);
  const extra = unique.length - shown.length;
  if (!shown.length) return null;

  if (links && expanded) {
    return (
      <div className="flex flex-col gap-1" role="list" aria-label="Web sources">
        <div className="flex items-center justify-between gap-2 px-0.5 pb-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">Sources</span>
          <button
            type="button"
            aria-label="Collapse to stack"
            title="Collapse"
            className="inline-flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:size-3.5"
            onClick={() => setExpanded(false)}
          >
            <HugeiconsIcon icon={CollapseIcon} strokeWidth={2} />
          </button>
        </div>
        {unique.map((s) => {
          const host = hostOf(s.href) ?? s.id;
          const row = (
            <>
              <FaviconCircle href={s.href} title={s.title} size={size} className="ring-1 ring-border" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{s.title}</span>
              {s.href ? <ArrowSquareOut className="size-3 shrink-0 opacity-50" aria-hidden /> : null}
            </>
          );
          return s.href ? (
            <a
              key={host}
              role="listitem"
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-[8px] px-1.5 py-1.5 no-underline transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
            >
              {row}
            </a>
          ) : (
            <div key={host} role="listitem" className="flex items-center gap-2 rounded-[8px] px-1.5 py-1.5">
              {row}
            </div>
          );
        })}
      </div>
    );
  }

  const slotStyle = (i: number, z: number) =>
    ({
      width: size,
      height: size,
      marginInlineStart: i === 0 ? 0 : -overlap,
      zIndex: z,
    }) as const;
  const moreClass =
    'relative box-border flex shrink-0 items-center justify-center self-center rounded-full border-0 bg-secondary p-0 leading-none text-[10px] font-medium tabular-nums text-muted-foreground ring-2 ring-[var(--home-card)]';

  return (
    <div className="flex items-center ps-1" role="list" aria-label="Web sources">
      {shown.map((s, i) => {
        const host = hostOf(s.href) ?? s.id;
        const style = slotStyle(i, shown.length - i);
        const circle = <FaviconCircle href={s.href} title={s.title} size={size} />;
        if (!links) {
          return (
            <span key={host} role="listitem" className="relative flex shrink-0 items-center justify-center self-center" style={style} title={s.title}>
              {circle}
            </span>
          );
        }
        return (
          <DropdownMenu key={host}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                role="listitem"
                className="relative flex shrink-0 items-center justify-center self-center border-0 bg-transparent p-0 transition-transform duration-150 hover:z-20 hover:scale-110 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={style}
                aria-label={s.title}
                onClick={(e) => e.stopPropagation()}
              >
                {circle}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="start" className="max-w-[220px] min-w-[160px]">
              <div className="flex items-start gap-2 px-2.5 py-2">
                <FaviconCircle href={s.href} title={s.title} size={18} className="mt-0.5 ring-1 ring-border" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{s.title}</div>
                  {host ? <div className="truncate text-xs text-muted-foreground">{host}</div> : null}
                </div>
              </div>
              {s.href ? (
                <DropdownMenuItem
                  onSelect={() => {
                    window.open(s.href, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <ArrowSquareOut aria-hidden />
                  Open site
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
      {extra > 0 &&
        (links ? (
          <button
            type="button"
            role="listitem"
            className={cn(moreClass, 'transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
            style={slotStyle(1, 0)}
            aria-label={`Show all ${unique.length} sources`}
            title={`+${extra} more`}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
          >
            <span className="leading-none">+{extra}</span>
          </button>
        ) : (
          <span className={moreClass} style={slotStyle(1, 0)} title={`${extra} more`}>
            <span className="leading-none">+{extra}</span>
          </span>
        ))}
    </div>
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
const WEB_TOOLS = new Set(['web_search', 'fetch_url']);

function addWebSource(out: Map<string, Source>, raw: string, label?: string) {
  const href = raw.replace(/[.,;:!?]+$/, '');
  let host = '';
  try {
    host = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return;
  }
  const google = /(^|\.)google\.[a-z.]+$/.test(host);
  out.set(`web:${href}`, {
    id: `web:${href}`,
    kind: google ? 'google' : 'web',
    title: label?.trim() || host,
    detail: href,
    href,
  });
}

/** Real references from the chat: files, web search/fetch, and links cited in replies. Newest first. */
export function sourcesFromChat(chat: AiChatItem[]): Source[] {
  const out = new Map<string, Source>();
  for (const item of chat) {
    if (item.kind === 'tool' && item.state !== 'failed' && FILE_TOOLS[item.tool]) {
      const path = item.summary.replace(/^(Reading|Writing)\s+/, '').trim();
      if (path && !/^an? file$/.test(path)) out.set(`file:${path}`, { id: `file:${path}`, kind: 'file', title: path.split(/[\\/]/).pop() ?? path, detail: `${FILE_TOOLS[item.tool]} · ${path}` });
    }
    if (item.kind === 'tool' && item.state !== 'failed' && WEB_TOOLS.has(item.tool)) {
      // fetch_url summary: "Fetched Title · https://…"
      const fetched = /^Fetched\s+(.+?)\s+·\s+(https?:\/\/\S+)/i.exec(item.summary);
      if (fetched) addWebSource(out, fetched[2], fetched[1]);
      for (const raw of item.summary.match(URL_RE) ?? []) addWebSource(out, raw);
    }
    if (item.kind === 'assistant') {
      for (const raw of item.text.match(URL_RE) ?? []) addWebSource(out, raw);
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
              className={cn('flex w-full items-center gap-1.5 rounded-[6px] py-1 pe-2 text-start text-xs text-[color:var(--fg-2)] transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:bg-secondary', !e.dir && selected?.root === root && selected.rel === path && 'bg-secondary text-foreground')}
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
              {e.dir ? (
                <HugeiconsIcon icon={Folder02Icon} strokeWidth={2} className="size-3.5 shrink-0 text-[color:var(--src-project)]" aria-hidden />
              ) : (
                <HugeiconsIcon icon={File02Icon} strokeWidth={2} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              )}
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
    <section aria-label={`File ${name}`} className="flex h-full min-h-0 w-full min-w-0 flex-col py-2 pe-2 ps-1">
      <div className="flex shrink-0 items-center gap-1 pb-1.5">
        <div className="min-w-0 flex-1 ps-1">
          <strong className="block truncate text-xs font-medium">{name}</strong>
          {file.rel.includes('/') && <span className="block truncate text-[11px] text-muted-foreground">{file.rel}</span>}
        </div>
        <button type="button" disabled={text === null} aria-label={copied ? 'Copied' : 'Copy'} title={copied ? 'Copied' : 'Copy'} className="inline-flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 [&_svg]:size-3.5" onClick={() => void copy()}>
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} aria-hidden />
        </button>
        <button type="button" aria-label="Close file" className="inline-flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" onClick={onClose}>
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 w-full flex-1 overflow-auto rounded-[10px] bg-muted">
        {error ? (
          <p className="m-0 p-3 text-xs text-muted-foreground">{error}</p>
        ) : text === null ? (
          <p className="m-0 p-3 text-xs text-muted-foreground">Loading…</p>
        ) : (
          <pre className="code-hl m-0 min-w-full w-max p-3 font-mono text-xs leading-5 text-foreground"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
        )}
      </div>
    </section>
  );
}

export function SourcesPanel({ sources, file, onFile }: { sources: Source[]; file: OpenFile | null; onFile: (f: OpenFile) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const web = useMemo(() => sources.filter((s) => (s.kind === 'web' || s.kind === 'google') && s.href), [sources]);
  const rest = useMemo(() => sources.filter((s) => !(s.kind === 'web' || s.kind === 'google') || !s.href), [sources]);
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
    <div className="flex flex-col gap-3">
      {web.length > 0 && (
        <div className="px-1 py-1">
          <WebFaviconStack sources={web} max={3} size={20} overlap={8} links />
        </div>
      )}
      {rest.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {rest.map((s) => {
            const body = (
              <>
                <SourceIcon kind={s.kind} className="mt-0.5 size-4" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs font-medium">{s.title}</strong>
                  <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>
                </span>
              </>
            );
            const cls = 'flex w-full items-start gap-2 rounded-[8px] px-2 py-1.5 text-start no-underline transition-colors duration-150 hover:bg-secondary focus-visible:bg-secondary';
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
      )}
    </div>
  );
}
