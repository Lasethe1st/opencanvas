import { Box, Camera, Copy, Eye, EyeOff, Folder, Lightbulb, Trash2 } from 'lucide-react';
import { childrenOf, type ThreeObject, type ThreeSceneDoc } from '../../../shared/three';
import { IconButton, cx } from '../../ui/primitives.jsx';

function iconFor(o: ThreeObject) {
  if (o.kind === 'light') return Lightbulb;
  if (o.kind === 'camera') return Camera;
  if (o.kind === 'group' || o.kind === 'gltf') return Folder;
  return Box;
}

function Row({
  object,
  depth,
  selected,
  onSelect,
  onToggleVisible,
  onDuplicate,
  onDelete,
  onRename,
}: {
  object: ThreeObject;
  depth: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const Icon = iconFor(object);
  return (
    <div
      className={cx('three-hierarchy__row', selected && 'is-selected')}
      style={{ paddingInlineStart: 8 + depth * 12 }}
      role="treeitem"
      aria-selected={selected}
      onClick={() => onSelect(object.id)}
      onDoubleClick={() => {
        const next = window.prompt('Rename object', object.name);
        if (next != null) onRename(object.id, next);
      }}
    >
      <Icon size={12} className="three-hierarchy__icon" />
      <span className="three-hierarchy__name">{object.name}</span>
      <span className="three-hierarchy__actions">
        <IconButton
          size="sm"
          label={object.visible ? 'Hide' : 'Show'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible(object.id);
          }}
        >
          {object.visible ? <Eye size={11} /> : <EyeOff size={11} />}
        </IconButton>
        <IconButton
          size="sm"
          label="Duplicate"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(object.id);
          }}
        >
          <Copy size={11} />
        </IconButton>
        <IconButton
          size="sm"
          label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(object.id);
          }}
        >
          <Trash2 size={11} />
        </IconButton>
      </span>
    </div>
  );
}

function Branch({
  doc,
  parentId,
  depth,
  ...handlers
}: {
  doc: ThreeSceneDoc;
  parentId: string | null;
  depth: number;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const kids = childrenOf(doc, parentId);
  return (
    <>
      {kids.map((o) => (
        <div key={o.id}>
          <Row object={o} depth={depth} selected={doc.selectedIds.includes(o.id)} {...handlers} />
          <Branch doc={doc} parentId={o.id} depth={depth + 1} {...handlers} />
        </div>
      ))}
    </>
  );
}

export function ThreeHierarchy({
  doc,
  onSelect,
  onToggleVisible,
  onDuplicate,
  onDelete,
  onRename,
}: {
  doc: ThreeSceneDoc;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  return (
    <div className="three-hierarchy" role="tree" aria-label="Scene hierarchy">
      <Branch
        doc={doc}
        parentId={null}
        depth={0}
        onSelect={onSelect}
        onToggleVisible={onToggleVisible}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onRename={onRename}
      />
    </div>
  );
}
