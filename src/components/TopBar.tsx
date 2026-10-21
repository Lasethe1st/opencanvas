import { useState } from 'react';
import { FRAMEWORK_LABELS } from '../../shared/types';
import { closeProject, openProjectDialog, selectElement } from '../lib/actions';
import { api } from '../lib/api';
import { sendToPreview } from '../lib/bridge';
import { stopInlineEdit } from '../lib/inline-edit';
import { findPath, hasUnsaved, setState, useStore } from '../lib/store';
import { togglePanels } from '../lib/panels';
import { openFullPreview } from './FullPreview';
import { GoLiveButton } from './GoLive';
import {
  ChevronDown,
  ChevronRight,
  Close,
  Code,
  Cursor,
  FolderOpen,
  Icon,
  Maximize,
  Minimize,
  Play,
  Search,
} from '@/components/lime/icon';
import { Badge } from '@/components/lime/ui/badge';
import { Button } from '@/components/lime/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/lime/ui/dropdown-menu';
import { Segmented, SegmentedItem } from '@/components/lime/ui/segmented';
import { Separator } from '@/components/lime/ui/separator';
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from '@/components/lime/ui/toolbar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/lime/ui/tooltip';

function Brand() {
  return (
    <div className="flex size-8 items-center justify-center" title="OpenCanvas">
      <span className="flex size-5 items-center justify-center rounded-md bg-ink text-fg-inverse" aria-hidden>
        <span className="size-2 rounded-sm border-2 border-fg-inverse" />
      </span>
      <span className="sr-only">OpenCanvas</span>
    </div>
  );
}

function ProjectMenu() {
  const project = useStore((s) => s.project)!;
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="max-w-48" aria-label={`Project ${project.name}`} />
        }
      >
        <span className="min-w-0 truncate">{project.name}</span>
        <Icon icon={ChevronDown} size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>
          {FRAMEWORK_LABELS[project.framework]} · {project.packageManager}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void api.revealProject()}>
          <Icon icon={Search} size={16} />
          Show in file explorer
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void openProjectDialog()}>
          <Icon icon={FolderOpen} size={16} />
          Open another project…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void closeProject()}>
          <Icon icon={Close} size={16} />
          Close project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SaveStatus({ state }: { state: 'saving' | 'dirty' | 'saved' }) {
  if (state === 'saving') return <Badge variant="neutral">Saving…</Badge>;
  if (state === 'dirty') return <Badge variant="warn">Unsaved changes</Badge>;
  return null;
}

function Crumbs() {
  const selection = useStore((s) => s.selection);
  const domTree = useStore((s) => s.domTree);
  const activeFile = useStore((s) => s.activeFile);
  const mode = useStore((s) => s.mode);

  if (mode === 'code') {
    const parts = activeFile ? activeFile.split('/') : ['No file open'];
    return (
      <nav className="flex min-w-0 items-center gap-1 text-sm text-fg-2" aria-label="Selection path">
        {parts.map((label, i) => (
          <span key={`${i}-${label}`} className="inline-flex min-w-0 items-center gap-1">
            {i > 0 && <Icon icon={ChevronRight} size={12} className="text-fg-3" />}
            <span className={i === parts.length - 1 ? 'truncate font-medium text-fg' : 'truncate'}>{label}</span>
          </span>
        ))}
      </nav>
    );
  }
  const path = selection ? (findPath(domTree, selection.uid) ?? []) : [];
  if (!path.length) {
    return (
      <nav className="text-sm font-medium text-fg" aria-label="Selection path">
        {selection ? selection.name : 'Page'}
      </nav>
    );
  }
  const visible = path.slice(-4);
  const items = visible.map((node) => ({ key: node.uid, label: node.name, node }));
  if (path.length > visible.length) items.unshift({ key: 'more', label: '…', node: path[path.length - visible.length - 1] });
  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="Selection path">
      {items.map((item, i) => (
        <span key={item.key} className="inline-flex min-w-0 items-center gap-1">
          {i > 0 && <Icon icon={ChevronRight} size={12} className="text-fg-3" />}
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 max-w-32"
            onClick={() => selectElement(item.node.id, item.node.uid)}
          >
            <span className="truncate">{item.label}</span>
          </Button>
        </span>
      ))}
    </nav>
  );
}

export function setInteract(next: boolean) {
  if (next) stopInlineEdit(true);
  setState({ interact: next, tool: 'select' });
  sendToPreview('mode', { mode: next ? 'interact' : 'select' });
}

export function TopBar() {
  const mode = useStore((s) => s.mode);
  const dirty = useStore((s) => hasUnsaved(s));
  const busy = useStore((s) => s.busy);
  const panelsHidden = useStore((s) => s.panelsHidden.left && s.panelsHidden.right);

  return (
    <TooltipProvider>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-page px-3 text-fg">
        <div className="flex min-w-0 items-center gap-2">
          <Brand />
          <Separator orientation="vertical" className="h-5" />
          <ProjectMenu />
          <SaveStatus state={busy ? 'saving' : dirty ? 'dirty' : 'saved'} />
        </div>
        <div className="min-w-0 flex-1">
          <Crumbs />
        </div>
        <Toolbar className="ms-auto">
          <ToolbarGroup>
            <Tooltip>
              <TooltipTrigger render={<ToolbarButton aria-label="Preview full screen" onClick={openFullPreview} />}>
                <Icon icon={Play} size={16} />
              </TooltipTrigger>
              <TooltipContent>Preview full screen</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToolbarButton
                    aria-label={panelsHidden ? 'Show panels' : 'Hide panels'}
                    aria-pressed={panelsHidden}
                    onClick={togglePanels}
                  />
                }
              >
                <Icon icon={panelsHidden ? Minimize : Maximize} size={16} />
              </TooltipTrigger>
              <TooltipContent>{panelsHidden ? 'Show panels' : 'Hide panels'}</TooltipContent>
            </Tooltip>
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            <Segmented aria-label="Editor mode" value={mode} onValueChange={(id) => setState({ mode: id as 'visual' | 'code' })} size="sm">
              <SegmentedItem value="visual">
                <span className="inline-flex items-center gap-1">
                  <Icon icon={Cursor} size={16} /> Visual
                </span>
              </SegmentedItem>
              <SegmentedItem value="code">
                <span className="inline-flex items-center gap-1">
                  <Icon icon={Code} size={16} /> Code
                </span>
              </SegmentedItem>
            </Segmented>
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            <GoLiveButton />
          </ToolbarGroup>
        </Toolbar>
      </header>
    </TooltipProvider>
  );
}
