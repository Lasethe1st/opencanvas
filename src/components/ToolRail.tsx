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
  Hand,
  Heading,
  Image,
  LayoutGrid,
  LayoutTemplate,
  Link,
  MousePointer2,
  Pilcrow,
  Plus,
  RectangleHorizontal,
  Ruler,
  Square,
  Type,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PRESETS } from '../../shared/canvas';
import type { InsertKind } from '../../shared/types';
import { insertElement, insertImageFromDisk } from '../lib/actions';
import { addCustomFrame, addFrame } from '../lib/canvas';
import { setState, useStore } from '../lib/store';
import { Button, cx, MenuItem } from '../ui/primitives.jsx';
import { ToolButton, ToolFlyout, ToolGroup, ToolRail as Rail, ToolSeparator } from '../ui/ToolRail.jsx';
import { BugCheckButton } from './BugCheck';
import { GitMenu } from './GitMenu';
import { SettingsButton } from './Settings';
import { TerminalButton } from './TerminalPanel';
import { setInteract } from './TopBar';

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

const CONTAINER_TAGS = new Set(['div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside', 'form', 'ul', 'ol', 'li', 'figure', 'fieldset', 'label']);

type Flyout = 'frame' | 'text' | 'more' | null;

function useOutside(open: boolean, ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, ref, onClose]);
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

function FrameFlyout({ onDone }: { onDone: () => void }) {
  const [size, setSize] = useState({ width: '1024', height: '768' });
  return (
    <ToolFlyout title="Add frame">
      {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((p) => (
        <MenuItem
          key={p}
          icon={<Ruler size={14} />}
          hint={`${PRESETS[p].width} × ${PRESETS[p].height}`}
          onClick={() => {
            onDone();
            addFrame(p);
          }}
        >
          {PRESETS[p].name}
        </MenuItem>
      ))}
      <form
        className="frame-menu__custom"
        onSubmit={(e) => {
          e.preventDefault();
          const w = Number(size.width);
          const h = Number(size.height);
          if (!Number.isFinite(w) || !Number.isFinite(h)) return;
          onDone();
          addCustomFrame(w, h);
        }}
      >
        <input className="frame-menu__num" aria-label="New frame width" inputMode="numeric" value={size.width} onChange={(e) => setSize((s) => ({ ...s, width: e.target.value }))} />
        <span>×</span>
        <input className="frame-menu__num" aria-label="New frame height" inputMode="numeric" value={size.height} onChange={(e) => setSize((s) => ({ ...s, height: e.target.value }))} />
        <Button size="sm" type="submit">
          Add
        </Button>
      </form>
    </ToolFlyout>
  );
}

export function ToolRail() {
  const mode = useStore((s) => s.mode);
  const tool = useStore((s) => s.tool);
  const interact = useStore((s) => s.interact);
  const selection = useStore((s) => s.selection);
  const editable = useStore((s) => s.project?.editable ?? false);
  const [open, setOpen] = useState<Flyout>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(null);
  useOutside(open !== null, ref, close);
  useEffect(() => {
    const openInsert = () => setOpen('more');
    window.addEventListener('oc-open-insert', openInsert);
    return () => window.removeEventListener('oc-open-insert', openInsert);
  }, []);

  const canInsert = editable && !interact;
  const target = !selection ? 'the page' : CONTAINER_TAGS.has(selection.tag) ? selection.name : `after ${selection.name}`;
  const toggle = (id: Exclude<Flyout, null>) => setOpen((o) => (o === id ? null : id));
  const pickTool = (next: 'select' | 'hand') => {
    if (interact) setInteract(false);
    setState({ tool: next });
  };
  const withFlyout = (id: Exclude<Flyout, null>, button: ReactNode, flyout: ReactNode) => (
    <div className="tool-rail__slot">
      {button}
      {open === id && flyout}
    </div>
  );
  const footer = (
    <>
      <div className="tool-rail__spacer" />
      <ToolGroup>
        <BugCheckButton />
        <TerminalButton />
        <GitMenu />
        <SettingsButton />
      </ToolGroup>
    </>
  );

  if (mode === 'code') return <Rail>{footer}</Rail>;

  return (
    <div ref={ref}>
      <Rail>
        <ToolGroup>
          <ToolButton label="Select" shortcut="V" active={tool === 'select' && !interact} onClick={() => pickTool('select')}>
            <MousePointer2 size={16} />
          </ToolButton>
          <ToolButton label="Hand" shortcut="H, or hold Space" active={tool === 'hand' && !interact} onClick={() => pickTool('hand')}>
            <Hand size={16} />
          </ToolButton>
          {withFlyout(
            'frame',
            <ToolButton label="Frame" active={open === 'frame'} onClick={() => toggle('frame')}>
              <Frame size={16} />
            </ToolButton>,
            <FrameFlyout onDone={close} />,
          )}
        </ToolGroup>
        <ToolSeparator />
        <ToolGroup>
          <ToolButton label="Section" shortcut="F" disabled={!canInsert} onClick={() => void insertElement('section')}>
            <LayoutTemplate size={16} />
          </ToolButton>
          <ToolButton label="Container" shortcut="R" disabled={!canInsert} onClick={() => void insertElement('div')}>
            <Square size={16} />
          </ToolButton>
          {withFlyout(
            'text',
            <ToolButton label="Text" shortcut="T inserts a paragraph" disabled={!canInsert} active={open === 'text'} onClick={() => toggle('text')}>
              <Type size={16} />
            </ToolButton>,
            <ToolFlyout title={`Insert into ${target}`}>
              <InsertList kinds={['heading', 'paragraph', 'link']} onDone={close} />
            </ToolFlyout>,
          )}
          <ToolButton label="Image (choose a file)" shortcut="I" disabled={!canInsert} onClick={() => void insertImageFromDisk()}>
            <Image size={16} />
          </ToolButton>
          <ToolButton label="Button" shortcut="B" disabled={!canInsert} onClick={() => void insertElement('button')}>
            <RectangleHorizontal size={16} />
          </ToolButton>
          {withFlyout(
            'more',
            <ToolButton label="More elements" shortcut="/" disabled={!canInsert} active={open === 'more'} onClick={() => toggle('more')}>
              <Plus size={16} />
            </ToolButton>,
            <ToolFlyout title={`Insert into ${target}`}>
              <InsertList search onDone={close} />
            </ToolFlyout>,
          )}
        </ToolGroup>
        {footer}
      </Rail>
    </div>
  );
}
