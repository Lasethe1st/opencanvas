import {
  ArrowDown,
  ArrowUp,
  Box,
  File,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Image,
  Pencil,
  RectangleHorizontal,
  Trash2,
  Type,
} from 'lucide-react';
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { FileNode } from '../../shared/types';
import { createFileOrFolder, deletePath, openFile, renamePath, runEdit, selectElement } from '../lib/actions';
import { sendToPreview } from '../lib/bridge';
import { findPath, setState, useStore, type TreeNode } from '../lib/store';
import { Panel, SearchField, Tree, TreeRow } from '../ui/Panels.jsx';
import { IconButton, SectionLabel, Segmented } from '../ui/primitives.jsx';
import { FramesPanel } from './FramesPanel';
import { Resizer } from './Resizer';

function fileIcon(name: string) {
  if (/\.(jsx|tsx|js|ts|mjs|cjs)$/.test(name)) return <FileCode2 size={14} className="tree-row__icon" />;
  if (/\.(png|jpe?g|gif|svg|webp|ico)$/.test(name)) return <Image size={14} className="tree-row__icon" />;
  return <File size={14} className="tree-row__icon" />;
}

function layerIcon(tag: string) {
  if (/^h[1-6]$|^p$|^span$|^label$/.test(tag)) return <Type size={13} className="tree-row__icon" />;
  if (tag === 'img') return <Image size={13} className="tree-row__icon" />;
  if (tag === 'button' || tag === 'a') return <RectangleHorizontal size={13} className="tree-row__icon" />;
  return <Box size={13} className="tree-row__icon" />;
}

const stop = (fn: () => void) => (e: ReactMouseEvent) => {
  e.stopPropagation();
  fn();
};

/** Keeps nodes whose name matches the query, plus the ancestors needed to reach them. */
function filterTree<T extends { name: string; children?: T[] }>(nodes: T[], query: string): T[] {
  if (!query) return nodes;
  const q = query.toLowerCase();
  const out: T[] = [];
  for (const node of nodes) {
    const children = filterTree(node.children ?? [], query);
    if (node.name.toLowerCase().includes(q) || children.length) out.push({ ...node, children });
  }
  return out;
}

/* ---------- Files ---------- */

type Draft = { kind: 'file' | 'folder'; parent: string };

function NewEntryRow({ draft, depth, onDone }: { draft: Draft; depth: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const commit = async (value: string) => {
    if (busy) return;
    if (!value.trim()) return onDone();
    setBusy(true);
    const created = await createFileOrFolder(draft.kind, draft.parent, value);
    setBusy(false);
    if (created) onDone();
  };
  return (
    <TreeRow depth={depth} icon={draft.kind === 'file' ? <File size={14} className="tree-row__icon" /> : <Folder size={14} className="tree-row__icon" />}>
      <input
        className="tree-row__input"
        autoFocus
        aria-label={draft.kind === 'file' ? 'New file name' : 'New folder name'}
        placeholder={draft.kind === 'file' ? 'Card.jsx' : 'components'}
        disabled={busy}
        onBlur={(e) => void commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit(e.currentTarget.value);
          if (e.key === 'Escape') onDone();
        }}
      />
    </TreeRow>
  );
}

function RenameInput({ node, onDone }: { node: FileNode; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const commit = async (value: string) => {
    if (busy) return;
    setBusy(true);
    const ok = await renamePath(node.path, value);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <input
      className="tree-row__input"
      autoFocus
      aria-label={`Rename ${node.path}`}
      defaultValue={node.name}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => {
        const dot = node.type === 'file' ? node.name.lastIndexOf('.') : -1;
        e.currentTarget.setSelectionRange(0, dot > 0 ? dot : node.name.length);
      }}
      onBlur={(e) => void commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void commit(e.currentTarget.value);
        if (e.key === 'Escape') onDone();
      }}
    />
  );
}

type TreeProps = {
  depth: number;
  expanded: Set<string>;
  forceOpen: boolean;
  toggle: (p: string) => void;
  draft: Draft | null;
  startDraft: (d: Draft) => void;
  endDraft: () => void;
  renaming: string | null;
  setRenaming: (p: string | null) => void;
};

function FileTreeNode({ node, ...props }: TreeProps & { node: FileNode }) {
  const { depth, expanded, forceOpen, toggle, draft, startDraft, endDraft, renaming, setRenaming } = props;
  const activeFile = useStore((s) => s.activeFile);
  const dirty = useStore((s) => (node.type === 'file' && s.buffers[node.path] ? s.buffers[node.path].content !== s.buffers[node.path].saved : false));
  const isOpen = forceOpen || expanded.has(node.path);
  const isRenaming = renaming === node.path;
  const name = isRenaming ? <RenameInput node={node} onDone={() => setRenaming(null)} /> : <span className="tree-row__name">{node.name}</span>;
  const entryActions = !isRenaming && (
    <>
      <IconButton size="sm" label={`Rename ${node.path}`} onClick={stop(() => setRenaming(node.path))}>
        <Pencil size={12} />
      </IconButton>
      <IconButton size="sm" label={`Delete ${node.path}`} onClick={stop(() => void deletePath(node.path, node.type === 'dir'))}>
        <Trash2 size={12} />
      </IconButton>
    </>
  );

  if (node.type === 'dir') {
    const begin = (kind: Draft['kind']) =>
      stop(() => {
        if (!isOpen) toggle(node.path);
        startDraft({ kind, parent: node.path });
      });
    return (
      <>
        <TreeRow
          depth={depth}
          expandable
          expanded={isOpen}
          onToggle={() => toggle(node.path)}
          onClick={() => toggle(node.path)}
          title={node.path}
          icon={isOpen ? <FolderOpen size={14} className="tree-row__icon" /> : <Folder size={14} className="tree-row__icon" />}
          actions={
            !isRenaming && (
              <>
                <IconButton size="sm" label={`New file in ${node.path}`} onClick={begin('file')}>
                  <FilePlus2 size={12} />
                </IconButton>
                <IconButton size="sm" label={`New folder in ${node.path}`} onClick={begin('folder')}>
                  <FolderPlus size={12} />
                </IconButton>
                {entryActions}
              </>
            )
          }
        >
          {name}
        </TreeRow>
        {isOpen && draft?.parent === node.path && <NewEntryRow draft={draft} depth={depth + 1} onDone={endDraft} />}
        {isOpen && node.children?.map((child) => <FileTreeNode key={child.path} node={child} {...props} depth={depth + 1} />)}
      </>
    );
  }
  return (
    <TreeRow
      depth={depth}
      active={activeFile === node.path}
      onClick={() => !isRenaming && void openFile(node.path)}
      title={node.path}
      icon={fileIcon(node.name)}
      trailing={dirty && <span className="dirty-dot" title="Unsaved changes" />}
      actions={entryActions}
    >
      {name}
    </TreeRow>
  );
}

function FilesPanel({ query }: { query: string }) {
  const tree = useStore((s) => s.fileTree);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['src', 'src/components', 'public']));
  const toggle = (p: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const nodes = useMemo(() => filterTree(tree?.children ?? [], query.trim()), [tree, query]);
  const props = { expanded, forceOpen: !!query.trim(), toggle, draft, startDraft: setDraft, endDraft: () => setDraft(null), renaming, setRenaming };
  return (
    <>
      <SectionLabel
        actions={
          <>
            <IconButton size="sm" label="New file" onClick={() => setDraft({ kind: 'file', parent: '' })}>
              <FilePlus2 size={13} />
            </IconButton>
            <IconButton size="sm" label="New folder" onClick={() => setDraft({ kind: 'folder', parent: '' })}>
              <FolderPlus size={13} />
            </IconButton>
          </>
        }
      >
        Project files
      </SectionLabel>
      <Tree>
        {draft?.parent === '' && <NewEntryRow draft={draft} depth={0} onDone={props.endDraft} />}
        {nodes.map((node) => (
          <FileTreeNode key={node.path} node={node} depth={0} {...props} />
        ))}
      </Tree>
      {query.trim() && nodes.length === 0 && <div className="empty-note">No files match “{query.trim()}”.</div>}
    </>
  );
}

/* ---------- Layers ---------- */

function LayerNode({ node, depth, expanded, forceOpen, toggle }: { node: TreeNode; depth: number; expanded: Set<string>; forceOpen: boolean; toggle: (uid: string) => void }) {
  const selectedUid = useStore((s) => s.selection?.uid);
  const hoverUid = useStore((s) => s.hoverUid);
  const [renaming, setRenaming] = useState(false);
  const isOpen = forceOpen || expanded.has(node.uid);
  const isSelected = selectedUid === node.uid;

  const commitRename = (value: string) => {
    setRenaming(false);
    if (value.trim() && value.trim() !== node.name) void runEdit({ type: 'rename', id: node.id, name: value.trim() }, `Rename to ${value.trim()}`);
  };
  const move = (direction: 'up' | 'down') => stop(() => void runEdit({ type: 'move', id: node.id, direction }, `Move ${node.name} ${direction}`));

  return (
    <>
      <TreeRow
        depth={depth}
        data-uid={node.uid}
        active={isSelected}
        hovered={hoverUid === node.uid && !isSelected}
        expandable={node.children.length > 0}
        expanded={isOpen}
        onToggle={() => toggle(node.uid)}
        onClick={() => selectElement(node.id, node.uid)}
        onDoubleClick={() => setRenaming(true)}
        onMouseEnter={() => sendToPreview('hover', { id: node.id, uid: node.uid })}
        onMouseLeave={() => sendToPreview('hover', { id: null })}
        icon={layerIcon(node.tag)}
        meta={node.tag}
        actions={
          isSelected &&
          !renaming && (
            <>
              <IconButton size="sm" label="Move up (Alt+↑)" onClick={move('up')}>
                <ArrowUp size={12} />
              </IconButton>
              <IconButton size="sm" label="Move down (Alt+↓)" onClick={move('down')}>
                <ArrowDown size={12} />
              </IconButton>
            </>
          )
        }
      >
        {renaming ? (
          <input
            className="tree-row__input"
            autoFocus
            aria-label={`Rename layer ${node.name}`}
            defaultValue={node.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => commitRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename(e.currentTarget.value);
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <span className="tree-row__name">{node.name}</span>
        )}
      </TreeRow>
      {isOpen && node.children.map((child) => <LayerNode key={child.uid} node={child} depth={depth + 1} expanded={expanded} forceOpen={forceOpen} toggle={toggle} />)}
    </>
  );
}

function LayersPanel({ query }: { query: string }) {
  const domTree = useStore((s) => s.domTree);
  const selection = useStore((s) => s.selection);
  const status = useStore((s) => s.previewStatus.state);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const nodes = useMemo(() => filterTree(domTree, query.trim()), [domTree, query]);

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const expandDepth = (nodes: TreeNode[], depth: number) => {
        for (const n of nodes) {
          if (depth < 2) next.add(n.uid);
          expandDepth(n.children, depth + 1);
        }
      };
      if (prev.size === 0) expandDepth(domTree, 0);
      if (selection) findPath(domTree, selection.uid)?.slice(0, -1).forEach((n) => next.add(n.uid));
      return next;
    });
  }, [domTree, selection?.uid]);

  useEffect(() => {
    if (!selection) return;
    const row = document.querySelector<HTMLElement>(`[data-uid="${selection.uid}"]`);
    const container = row?.closest<HTMLElement>('.panel__body');
    if (!row || !container) return;
    const rowRect = row.getBoundingClientRect();
    const boxRect = container.getBoundingClientRect();
    if (rowRect.top < boxRect.top) container.scrollTop -= boxRect.top - rowRect.top + 8;
    else if (rowRect.bottom > boxRect.bottom) container.scrollTop += rowRect.bottom - boxRect.bottom + 8;
  }, [selection?.uid]);

  const toggle = (uid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  return (
    <>
      <SectionLabel>Elements</SectionLabel>
      {domTree.length === 0 ? (
        <div className="empty-note">{status === 'running' ? 'No editable elements found on this page.' : 'Layers appear once the preview is running.'}</div>
      ) : (
        <Tree>
          {nodes.map((node) => (
            <LayerNode key={node.uid} node={node} depth={0} expanded={expanded} forceOpen={!!query.trim()} toggle={toggle} />
          ))}
        </Tree>
      )}
      {query.trim() && domTree.length > 0 && nodes.length === 0 && <div className="empty-note">No layers match “{query.trim()}”.</div>}
    </>
  );
}

export function LeftSidebar() {
  const tab = useStore((s) => s.leftTab);
  const width = useStore((s) => s.leftWidth);
  const [queries, setQueries] = useState({ files: '', layers: '' });

  return (
    <Panel
      side="left"
      width={width}
      head={
        <Segmented
          label="Sidebar"
          value={tab}
          onChange={(id) => setState({ leftTab: id })}
          options={[
            { id: 'layers', label: 'Layers', text: 'Layers' },
            { id: 'files', label: 'Files', text: 'Files' },
            { id: 'frames', label: 'Frames', text: 'Frames' },
          ]}
        />
      }
      resizer={<Resizer value={width} min={200} max={460} onChange={(v) => setState({ leftWidth: v })} />}
    >
      {tab !== 'frames' && (
        <SearchField placeholder={tab === 'files' ? 'Search files' : 'Search layers'} value={queries[tab]} onChange={(v) => setQueries((q) => ({ ...q, [tab]: v }))} />
      )}
      {tab === 'files' ? <FilesPanel query={queries.files} /> : tab === 'layers' ? <LayersPanel query={queries.layers} /> : <FramesPanel />}
    </Panel>
  );
}
