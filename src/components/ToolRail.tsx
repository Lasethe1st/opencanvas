import {
  ClipboardList,
  List,
  MessageSquareText,
  Navigation,
  PanelBottom,
  PanelTop,
  TextCursorInput,
  Columns3,
  Frame,
  Heading,
  Image,
  LayoutGrid,
  LayoutTemplate,
  Link,
  Pilcrow,
  Plus,
  RectangleHorizontal,
  Square,
  X,
} from '../lib/hugeicons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { InsertKind } from '../../shared/types';
import { insertElement, insertImageFromDisk } from '../lib/actions';
import { getState, setState, useStore, type InsertPanel as InsertPanelId } from '../lib/store';
import { cx, IconButton, MenuItem } from '../ui/primitives.jsx';
import { Panel, PanelTitle } from '../ui/Panels.jsx';
import { ToolButton, ToolFlyout, ToolGroup, ToolRail as Rail, ToolRails } from '../ui/ToolRail.jsx';
import { BugCheckButton } from './BugCheck';
import { CONTROL_MODES, openDock } from './Dock';
import { FramesPanel } from './FramesPanel';
import { GitMenu } from './GitMenu';
import { Resizer } from './Resizer';
import { SettingsButton } from './Settings';
import { TerminalButton } from './TerminalPanel';

const ELEMENTS: { kind: InsertKind; label: string; hint: string; icon: typeof Square; keywords: string }[] = [
  { kind: 'div', label: 'Container', hint: 'div', icon: Square, keywords: 'div box container wrapper' },
  { kind: 'section', label: 'Section', hint: 'section', icon: LayoutTemplate, keywords: 'section block area' },
  { kind: 'flex', label: 'Flex row', hint: 'display: flex', icon: Columns3, keywords: 'flex row stack layout horizontal' },
  { kind: 'grid', label: 'Grid', hint: 'display: grid', icon: LayoutGrid, keywords: 'grid columns layout cards' },
  { kind: 'heading', label: 'Heading', hint: 'h2', icon: Heading, keywords: 'heading title text h2' },
  { kind: 'paragraph', label: 'Paragraph', hint: 'p', icon: Pilcrow, keywords: 'paragraph text body copy p' },
  { kind: 'link', label: 'Link', hint: 'a', icon: Link, keywords: 'link anchor a href' },
  { kind: 'image', label: 'Image', hint: 'img', icon: Image, keywords: 'image picture photo img' },
  { kind: 'button', label: 'Button', hint: 'button', icon: RectangleHorizontal, keywords: 'button cta action' },
  { kind: 'header', label: 'Header', hint: 'header', icon: PanelTop, keywords: 'header top bar masthead' },
  { kind: 'nav', label: 'Navigation', hint: 'nav', icon: Navigation, keywords: 'nav navigation menu links' },
  { kind: 'footer', label: 'Footer', hint: 'footer', icon: PanelBottom, keywords: 'footer bottom' },
  { kind: 'list', label: 'List', hint: 'ul', icon: List, keywords: 'list bullets ul li items' },
  { kind: 'form', label: 'Form', hint: 'form', icon: ClipboardList, keywords: 'form contact fields inputs' },
  { kind: 'input', label: 'Input', hint: 'input', icon: TextCursorInput, keywords: 'input field text email' },
  { kind: 'textarea', label: 'Text area', hint: 'textarea', icon: MessageSquareText, keywords: 'textarea message multiline' },
];

const SECTION_KINDS: InsertKind[] = ['section', 'header', 'nav', 'footer', 'flex', 'grid'];

const CONTAINER_TAGS = new Set(['div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside', 'form', 'ul', 'ol', 'li', 'figure', 'fieldset', 'label']);

const PANEL_TITLES: Record<InsertPanelId, string> = {
  frame: 'Frames',
  section: 'Insert section',
  more: 'Insert element',
};

/** Open or toggle an insert offerings panel in the left sidebar (same pattern as Source control). */
export function toggleInsertPanel(id: InsertPanelId) {
  const cur = getState().insertPanel;
  setState({ insertPanel: cur === id ? null : id, gitOpen: false });
}

function closeInsertPanel() {
  setState({ insertPanel: null });
}

function InsertList({ kinds, search, onDone }: { kinds?: InsertKind[]; search?: boolean; onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(0);
  const items = useMemo(() => {
    const base = kinds ? ELEMENTS.filter((e) => kinds.includes(e.kind)) : ELEMENTS;
    const q = query.trim().toLowerCase();
    return q ? base.filter((e) => e.label.toLowerCase().includes(q) || e.keywords.includes(q)) : base;
  }, [query, kinds]);
  const choose = (kind: InsertKind) => {
    onDone();
    void (kind === 'image' ? insertImageFromDisk() : insertElement(kind));
  };
  return (
    <>
      {search && (
        <input
          className="popover__search"
          autoFocus
          aria-label="Search elements"
          placeholder="Search elements…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocused(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setFocused((f) => Math.min(f + 1, items.length - 1));
            if (e.key === 'ArrowUp') setFocused((f) => Math.max(f - 1, 0));
            if (e.key === 'Enter' && items[focused]) choose(items[focused].kind);
          }}
        />
      )}
      {items.map((item, i) => (
        <MenuItem
          key={item.kind}
          className={cx('menu-item', search && i === focused && 'is-focused')}
          icon={<item.icon size={14} />}
          hint={item.hint}
          onClick={() => choose(item.kind)}
          onMouseEnter={() => setFocused(i)}
        >
          {item.label}
        </MenuItem>
      ))}
      {items.length === 0 && <div className="empty-note">No matching elements.</div>}
    </>
  );
}

export function InsertPanel() {
  const panel = useStore((s) => s.insertPanel)!;
  const width = useStore((s) => s.leftWidth);
  const selection = useStore((s) => s.selection);
  const target = !selection ? 'the page' : CONTAINER_TAGS.has(selection.tag) ? selection.name : `after ${selection.name}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.dialog-backdrop, .settings-page')) return;
      closeInsertPanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  let body: ReactNode;
  if (panel === 'frame') body = <FramesPanel />;
  else if (panel === 'section') body = <InsertList kinds={SECTION_KINDS} onDone={closeInsertPanel} />;
  else body = <InsertList search onDone={closeInsertPanel} />;

  return (
    <Panel
      side="left"
      width={width}
      className="panel panel--left insert-panel"
      aria-label={PANEL_TITLES[panel]}
      head={
        <>
          <PanelTitle>{PANEL_TITLES[panel]}</PanelTitle>
          <IconButton size="sm" label="Close" onClick={closeInsertPanel}>
            <X size={14} />
          </IconButton>
        </>
      }
      resizer={<Resizer value={width} min={200} max={460} onChange={(v) => setState({ leftWidth: v })} />}
    >
      <div className="insert-panel__body">
        {panel !== 'frame' && <p className="insert-panel__target">Into {target}</p>}
        {body}
      </div>
    </Panel>
  );
}

export function ToolRail() {
  const mode = useStore((s) => s.mode);
  const dockMode = useStore((s) => s.dockMode);
  const interact = useStore((s) => s.interact);
  const editable = useStore((s) => s.project?.editable ?? false);
  const insertPanel = useStore((s) => s.insertPanel);
  const frameBtn = useRef<HTMLButtonElement>(null);
  const sectionBtn = useRef<HTMLButtonElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const openInsert = () => setState({ insertPanel: 'more', gitOpen: false });
    window.addEventListener('oc-open-insert', openInsert);
    return () => window.removeEventListener('oc-open-insert', openInsert);
  }, []);

  useEffect(() => {
    if (!insertPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.dialog-backdrop, .settings-page')) return;
      closeInsertPanel();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      // Frames opens as a left panel (like Git); don't dismiss on outside click.
      if (getState().insertPanel === 'frame') return;
      if (frameBtn.current?.contains(t) || sectionBtn.current?.contains(t) || moreBtn.current?.contains(t)) return;
      if (t instanceof Element && t.closest('.tool-flyout')) return;
      closeInsertPanel();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [insertPanel]);

  const canInsert = editable && !interact;
  const flyoutAnchor = insertPanel === 'frame' ? frameBtn.current : insertPanel === 'section' ? sectionBtn.current : insertPanel === 'more' ? moreBtn.current : null;

  /** Every tool is on the rail at once: canvas insert tools first (visual mode), then ask & explore, with the terminal last. */
  const canvasToolIds = ['frame', 'section', 'container', 'image', 'button', 'more'] as const;
  type CanvasToolId = (typeof canvasToolIds)[number];
  const showCanvasTools = mode === 'visual';

  const projectRail = (
    <Rail label="Project">
      <ToolGroup>
        <BugCheckButton />
        <GitMenu />
        <SettingsButton />
      </ToolGroup>
    </Rail>
  );

  const renderCanvasTool = (id: CanvasToolId) => {
    switch (id) {
      case 'frame':
        return (
          <ToolButton
            key={id}
            ref={frameBtn}
            label="Frame"
            active={insertPanel === 'frame'}
            aria-expanded={insertPanel === 'frame'}
            onClick={() => toggleInsertPanel('frame')}
          >
            <Frame size={15} />
          </ToolButton>
        );
      case 'section':
        return (
          <ToolButton
            key={id}
            ref={sectionBtn}
            label="Section"
            shortcut="F"
            disabled={!canInsert}
            active={insertPanel === 'section'}
            aria-expanded={insertPanel === 'section'}
            onClick={() => toggleInsertPanel('section')}
          >
            <LayoutTemplate size={15} />
          </ToolButton>
        );
      case 'container':
        return (
          <ToolButton key={id} label="Container" shortcut="R" disabled={!canInsert} onClick={() => void insertElement('div')}>
            <Square size={15} />
          </ToolButton>
        );
      case 'image':
        return (
          <ToolButton key={id} label="Image" shortcut="I" disabled={!canInsert} onClick={() => void insertImageFromDisk()}>
            <Image size={15} />
          </ToolButton>
        );
      case 'button':
        return (
          <ToolButton key={id} label="Button" shortcut="B" disabled={!canInsert} onClick={() => void insertElement('button')}>
            <RectangleHorizontal size={15} />
          </ToolButton>
        );
      case 'more':
        return (
          <ToolButton
            key={id}
            ref={moreBtn}
            label="More elements"
            shortcut="/"
            disabled={!canInsert}
            active={insertPanel === 'more'}
            aria-expanded={insertPanel === 'more'}
            onClick={() => toggleInsertPanel('more')}
          >
            <Plus size={15} />
          </ToolButton>
        );
    }
  };

  const exploreTools = (
    <>
      {CONTROL_MODES.map((m) => (
        <ToolButton
          key={m.id}
          label={m.label}
          active={dockMode === m.id}
          aria-expanded={dockMode === m.id}
          onClick={() => (dockMode === m.id ? setState({ dockMode: null }) : openDock(m.id))}
        >
          {m.icon}
        </ToolButton>
      ))}
      <TerminalButton key="terminal" />
    </>
  );

  // Frame uses the left InsertPanel; only section/more use the rail flyout.
  const flyoutPanel = insertPanel === 'section' || insertPanel === 'more' ? insertPanel : null;
  const flyoutOnThisPage = showCanvasTools && !!flyoutPanel;

  return (
    <ToolRails>
      <Rail label="Tools">
        {showCanvasTools && (
          <>
            <ToolGroup>{canvasToolIds.map(renderCanvasTool)}</ToolGroup>
            <div className="tool-rails__divider" role="separator" />
          </>
        )}
        <ToolGroup>{exploreTools}</ToolGroup>
      </Rail>
      <div className="tool-rails__spacer" />
      {projectRail}
      {flyoutOnThisPage && flyoutAnchor && flyoutPanel && (
        <ToolFlyout title={PANEL_TITLES[flyoutPanel]} anchor={flyoutAnchor}>
          {flyoutPanel === 'section' ? (
            <InsertList kinds={SECTION_KINDS} onDone={closeInsertPanel} />
          ) : (
            <InsertList search onDone={closeInsertPanel} />
          )}
        </ToolFlyout>
      )}
    </ToolRails>
  );
}
