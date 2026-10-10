import {
  ArrowDown,
  ArrowUp,
  Code2,
  Columns3,
  CornerLeftUp,
  Heading,
  Image,
  LayoutGrid,
  LayoutTemplate,
  Link,
  MoreHorizontal,
  MousePointer2,
  Pilcrow,
  Plus,
  RectangleHorizontal,
  Redo2,
  Sparkles,
  Square,
  TextCursorInput,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { InsertKind } from '../../shared/types';
import { insertElement, moveSelected, redo, removeSelected, revealInCode, selectElement, undo } from '../lib/actions';
import { sendToPreview } from '../lib/bridge';
import { setState, useStore } from '../lib/store';
import { Dock as DockBar, DockContext, DockSeparator } from '../ui/Dock.jsx';
import { cx, IconButton, Menu, MenuItem } from '../ui/primitives.jsx';

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
];

const CONTAINER_TAGS = new Set(['div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside', 'form', 'ul', 'ol', 'li', 'figure', 'fieldset', 'label']);
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'label', 'li', 'strong', 'em', 'small', 'summary']);

type MenuId = 'add' | 'text' | 'layout' | 'ai' | 'more' | null;

function Popover({ children, onClose, align = 'center' }: { children: ReactNode; onClose: () => void; align?: 'center' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => document.addEventListener('mousedown', onDown));
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const position: CSSProperties = { bottom: 'calc(100% + 12px)', ...(align === 'center' ? { left: '50%', transform: 'translateX(-50%)' } : { right: 0 }) };
  return (
    <div ref={ref}>
      <Menu style={position}>{children}</Menu>
    </div>
  );
}

function AddMenu({ onClose, filterKinds }: { onClose: () => void; filterKinds?: InsertKind[] }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(0);
  const items = useMemo(() => {
    const base = filterKinds ? ELEMENTS.filter((e) => filterKinds.includes(e.kind)) : ELEMENTS;
    const q = query.trim().toLowerCase();
    return q ? base.filter((e) => e.label.toLowerCase().includes(q) || e.keywords.includes(q)) : base;
  }, [query, filterKinds]);

  const choose = (kind: InsertKind) => {
    onClose();
    void insertElement(kind);
  };

  return (
    <Popover onClose={onClose}>
      {!filterKinds && (
        <input
          className="popover__search"
          autoFocus
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
          className={cx('menu-item', i === focused && !filterKinds && 'is-focused')}
          icon={<item.icon size={14} />}
          hint={item.hint}
          onClick={() => choose(item.kind)}
          onMouseEnter={() => setFocused(i)}
        >
          {item.label}
        </MenuItem>
      ))}
      {items.length === 0 && <div className="empty-note">No matching elements.</div>}
    </Popover>
  );
}

function DockButton({ tip, onClick, active, disabled, children }: { tip: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <IconButton label={tip} tipSide="top" active={active} disabled={disabled} onClick={onClick}>
      {children}
    </IconButton>
  );
}

export function Dock() {
  const [menu, setMenu] = useState<MenuId>(null);
  const selection = useStore((s) => s.selection);
  const interact = useStore((s) => s.interact);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const editable = useStore((s) => s.project?.editable ?? false);
  const sourceInfo = useStore((s) => s.sourceInfo);
  const close = () => setMenu(null);
  const toggle = (id: MenuId) => setMenu((m) => (m === id ? null : id));

  const isContainer = !!selection && CONTAINER_TAGS.has(selection.tag);
  const isText = !!selection && TEXT_TAGS.has(selection.tag);
  const [verb, target] = !selection ? ['Add to', 'page'] : isContainer ? ['Insert into', selection.name] : ['Insert after', selection.name];

  const setSelectMode = () => {
    setState({ interact: false });
    sendToPreview('mode', { mode: 'select' });
  };
  const withMenu = (id: Exclude<MenuId, null>, button: ReactNode, popover: ReactNode) => (
    <div style={{ position: 'relative' }}>
      {button}
      {menu === id && popover}
    </div>
  );

  return (
    <DockBar>
      <DockButton tip="Select (V)" onClick={setSelectMode} active={!interact}>
        <MousePointer2 size={15} />
      </DockButton>
      <DockSeparator />
      {withMenu(
        'add',
        <DockButton tip="Add element" onClick={() => toggle('add')} active={menu === 'add'} disabled={!editable}>
          <Plus size={16} />
        </DockButton>,
        <AddMenu onClose={close} />,
      )}
      <DockButton tip="Container" onClick={() => void insertElement('div')} disabled={!editable}>
        <Square size={15} />
      </DockButton>
      {withMenu(
        'text',
        <DockButton tip="Text" onClick={() => toggle('text')} active={menu === 'text'} disabled={!editable}>
          <Type size={15} />
        </DockButton>,
        <AddMenu onClose={close} filterKinds={['heading', 'paragraph', 'link']} />,
      )}
      <DockButton tip="Image" onClick={() => void insertElement('image')} disabled={!editable}>
        <Image size={15} />
      </DockButton>
      <DockButton tip="Button" onClick={() => void insertElement('button')} disabled={!editable}>
        <RectangleHorizontal size={15} />
      </DockButton>
      {withMenu(
        'layout',
        <DockButton tip="Layout" onClick={() => toggle('layout')} active={menu === 'layout'} disabled={!editable}>
          <LayoutGrid size={15} />
        </DockButton>,
        <AddMenu onClose={close} filterKinds={['section', 'flex', 'grid']} />,
      )}
      {isText && sourceInfo?.textEditable && (
        <DockButton tip="Edit text" onClick={() => document.getElementById('oc-text-field')?.focus()}>
          <TextCursorInput size={15} />
        </DockButton>
      )}
      <DockSeparator />
      {withMenu(
        'ai',
        <DockButton tip="AI Edit" onClick={() => toggle('ai')} active={menu === 'ai'}>
          <Sparkles size={15} />
        </DockButton>,
        <Popover onClose={close}>
          <div style={{ width: 260, padding: 6, lineHeight: 1.5 }}>
            <div className="menu-title" style={{ padding: '0 0 6px' }}>
              AI Edit
            </div>
            <textarea className="textarea" placeholder="Describe a change…" disabled />
            <p className="muted" style={{ margin: '6px 0 0' }}>
              AI editing is not connected in this build. Visual and code edits work without it.
            </p>
          </div>
        </Popover>,
      )}
      <DockButton tip="Undo" onClick={() => void undo()} disabled={!canUndo}>
        <Undo2 size={15} />
      </DockButton>
      <DockButton tip="Redo" onClick={() => void redo()} disabled={!canRedo}>
        <Redo2 size={15} />
      </DockButton>
      {withMenu(
        'more',
        <DockButton tip="More" onClick={() => toggle('more')} active={menu === 'more'}>
          <MoreHorizontal size={15} />
        </DockButton>,
        <Popover onClose={close} align="right">
          <MenuItem icon={<CornerLeftUp size={14} />} disabled={!selection?.parentId} onClick={() => { close(); if (selection?.parentId) selectElement(selection.parentId); }}>
            Select parent
          </MenuItem>
          <MenuItem icon={<ArrowUp size={14} />} hint="Alt+↑" disabled={!selection || !editable} onClick={() => { close(); void moveSelected('up'); }}>
            Move up
          </MenuItem>
          <MenuItem icon={<ArrowDown size={14} />} hint="Alt+↓" disabled={!selection || !editable} onClick={() => { close(); void moveSelected('down'); }}>
            Move down
          </MenuItem>
          <MenuItem icon={<Code2 size={14} />} disabled={!sourceInfo} onClick={() => { close(); if (sourceInfo) revealInCode(sourceInfo.file, sourceInfo.line); }}>
            Open in code
          </MenuItem>
          <div className="menu-sep" />
          <MenuItem className="menu-item is-danger" icon={<Trash2 size={14} />} hint="Del" disabled={!selection || !editable} onClick={() => { close(); void removeSelected(); }}>
            Delete
          </MenuItem>
        </Popover>,
      )}
      <DockContext verb={verb} target={target} />
    </DockBar>
  );
}
