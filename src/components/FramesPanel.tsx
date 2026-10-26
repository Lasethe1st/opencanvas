import { Copy, Focus, Plus, Ruler, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { breakpointFor, PRESETS } from '../../shared/canvas';
import { addFrame, deleteFrame, displayRect, duplicateFrame, fitFrame, renameFrame, setActiveFrame } from '../lib/canvas';
import { pageOf, useStore } from '../lib/store';
import { FrameRow } from '../ui/FramesPanel.jsx';
import { IconButton, Menu, MenuItem, SectionLabel } from '../ui/primitives.jsx';
import { SCOPE_LABEL } from './Canvas';

export function FramesPanel() {
  const frames = useStore((s) => s.frames);
  const activeFrameId = useStore((s) => s.activeFrameId);
  const runtime = useStore((s) => s.frameRuntime);
  const project = useStore((s) => s.project)!;
  const projectConfig = useStore((s) => s.projectConfig);
  const multiPage = (projectConfig?.pages.length ?? 0) > 1;
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <>
      <SectionLabel
        actions={
          <span style={{ position: 'relative' }}>
            <IconButton size="sm" label="Add frame" active={adding} onClick={() => setAdding((v) => !v)}>
              <Plus size={13} />
            </IconButton>
            {adding && (
              <Menu style={{ right: 0, top: 'calc(100% + 6px)', minWidth: 200 }} onMouseLeave={() => setAdding(false)}>
                {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((p) => (
                  <MenuItem
                    key={p}
                    icon={<Ruler size={14} />}
                    hint={`${PRESETS[p].width} × ${PRESETS[p].height}`}
                    onClick={() => {
                      setAdding(false);
                      addFrame(p);
                    }}
                  >
                    {PRESETS[p].name}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </span>
        }
      >
        Frames
      </SectionLabel>
      <div className="frame-list" role="list">
        {frames.map((f) => {
          const scope = breakpointFor(f.width, project.breakpoints);
          const height = displayRect(f, runtime[f.id]).height;
          return (
            <FrameRow
              key={f.id}
              role="listitem"
              name={f.name}
              size={`${f.width} × ${Math.round(height)}${f.fitPage ? ' fit' : ''}`}
              scope={scope}
              scopeLabel={multiPage ? `${SCOPE_LABEL[scope]} · ${pageOf(f, { projectConfig })?.name ?? ''}` : SCOPE_LABEL[scope]}
              active={f.id === activeFrameId}
              onClick={() => setActiveFrame(f.id)}
              onDoubleClick={() => setRenaming(f.id)}
              actions={
                <>
                  <IconButton size="sm" label={`Zoom to ${f.name}`} onClick={(e) => { e.stopPropagation(); setActiveFrame(f.id); fitFrame(f.id); }}>
                    <Focus size={12} />
                  </IconButton>
                  <IconButton size="sm" label={`Duplicate ${f.name}`} onClick={(e) => { e.stopPropagation(); duplicateFrame(f.id); }}>
                    <Copy size={12} />
                  </IconButton>
                  <IconButton size="sm" label={`Delete ${f.name}`} disabled={frames.length < 2} onClick={(e) => { e.stopPropagation(); deleteFrame(f.id); }}>
                    <Trash2 size={12} />
                  </IconButton>
                </>
              }
            >
              {renaming === f.id ? (
                <input
                  className="tree-row__input"
                  autoFocus
                  aria-label={`Rename frame ${f.name}`}
                  defaultValue={f.name}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    setRenaming(null);
                    renameFrame(f.id, e.currentTarget.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : undefined}
            </FrameRow>
          );
        })}
      </div>
      <p className="frame-list__hint">
        {multiPage ? 'Each frame shows one page; new frames show the page of the selected frame.' : 'Each frame shows the same page.'} Styles you change apply to the scope of the frame you edit in: Base above {project.breakpoints.tablet}px, Tablet up to {project.breakpoints.tablet}px, Mobile up to {project.breakpoints.mobile}px.
      </p>
    </>
  );
}
