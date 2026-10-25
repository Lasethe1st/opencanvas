import {
  Box,
  Circle,
  Code2,
  Cone,
  Cylinder,
  Download,
  FileCode2,
  FolderPlus,
  Lightbulb,
  Move3d,
  Package,
  RotateCcw,
  Scaling,
  Square,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addObject,
  createGltfObject,
  createLight,
  createPrimitive,
  duplicateObject,
  exportScene,
  generateR3fSceneSource,
  isManagedThreeScene,
  nextThreeId,
  normalizeSceneDoc,
  parseR3fSceneSource,
  removeObjects,
  renameObject,
  reparentObject,
  updateObject,
  type ThreeObject,
  type ThreePrimitive,
  type ThreeSceneDoc,
} from '../../../shared/three';
import { api } from '../../lib/api';
import { toast, useStore, setState, getState } from '../../lib/store';
import { IconButton, cx } from '../../ui/primitives.jsx';
import { ThreeHierarchy } from './ThreeHierarchy';
import { ThreeInspector } from './ThreeInspector';
import { ThreeViewport } from './ThreeViewport';
import type { ThreeTransformMode } from './types';

const PRIMITIVES: { id: ThreePrimitive; label: string; Icon: typeof Box }[] = [
  { id: 'box', label: 'Cube', Icon: Box },
  { id: 'sphere', label: 'Sphere', Icon: Circle },
  { id: 'plane', label: 'Plane', Icon: Square },
  { id: 'cylinder', label: 'Cylinder', Icon: Cylinder },
  { id: 'cone', label: 'Cone', Icon: Cone },
  { id: 'torus', label: 'Torus', Icon: Package },
];

function sceneKey(pageId: string) {
  return pageId;
}

function componentNameFromFile(file: string | null): string {
  if (!file) return 'MainScene';
  const base = file.split(/[/\\]/).pop() ?? 'MainScene';
  return base.replace(/\.(jsx|tsx|js|ts)$/i, '') || 'MainScene';
}

async function loadOrCreateDoc(pageId: string, file: string | null): Promise<ThreeSceneDoc> {
  const existing = getState().threeScenes[pageId];
  if (existing) return existing;

  if (file) {
    try {
      const source = await api.readFile(file);
      const parsed = parseR3fSceneSource(source, file);
      if (parsed) return parsed;
    } catch {
      /* fall through */
    }
  }

  const jsonPath = `.opencanvas/three/${pageId}.json`;
  try {
    const raw = await api.readFile(jsonPath);
    return normalizeSceneDoc(JSON.parse(raw), file);
  } catch {
    return normalizeSceneDoc(null, file ?? `src/scenes/${componentNameFromFile(file)}.jsx`);
  }
}

async function persistDoc(pageId: string, doc: ThreeSceneDoc) {
  const jsonPath = `.opencanvas/three/${pageId}.json`;
  try {
    await api.writeFile(jsonPath, JSON.stringify(doc, null, 2));
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Could not save 3D scene JSON.', 'error');
  }
  if (doc.file) {
    const source = generateR3fSceneSource(doc, componentNameFromFile(doc.file));
    try {
      await api.writeFile(doc.file, source);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not sync 3D scene source.', 'error');
    }
  }
}

export function ThreeEditor({ pageId }: { pageId: string }) {
  const page = useStore((s) => s.projectConfig?.pages.find((p) => p.id === pageId) ?? null);
  const doc = useStore((s) => s.threeScenes[pageId] ?? null);
  const [mode, setMode] = useState<ThreeTransformMode>('translate');
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const file = page?.file ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await loadOrCreateDoc(pageId, file);
      if (cancelled) return;
      setState((s) => ({ threeScenes: { ...s.threeScenes, [sceneKey(pageId)]: next } }));
      void persistDoc(pageId, next);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, file]);

  const setDoc = useCallback(
    (updater: (prev: ThreeSceneDoc) => ThreeSceneDoc) => {
      setState((s) => {
        const prev = s.threeScenes[pageId];
        if (!prev) return s;
        const next = updater(prev);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void persistDoc(pageId, next).then(() => setSyncNote('Synced to source'));
        }, 400);
        return { threeScenes: { ...s.threeScenes, [pageId]: next } };
      });
    },
    [pageId],
  );

  const onSelect = (id: string | null) => {
    setDoc((d) => ({ ...d, selectedIds: id ? [id] : [] }));
  };

  const onPatchObject = (id: string, patch: Partial<ThreeObject>) => {
    setDoc((d) => updateObject(d, id, patch));
  };

  if (!doc) {
    return (
      <div className="three-editor three-editor--loading">
        <p>Loading 3D scene…</p>
      </div>
    );
  }

  return (
    <div className="three-editor" data-tw="">
      <header className="three-editor__toolbar">
        <div className="three-editor__group" role="toolbar" aria-label="Add objects">
          {PRIMITIVES.map(({ id, label, Icon }) => (
            <IconButton
              key={id}
              size="sm"
              label={`Add ${label}`}
              onClick={() => setDoc((d) => addObject(d, createPrimitive(id)))}
            >
              <Icon size={13} />
            </IconButton>
          ))}
          <IconButton size="sm" label="Add light" onClick={() => setDoc((d) => addObject(d, createLight('directional')))}>
            <Lightbulb size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label="Add group"
            onClick={() => {
              setDoc((d) => {
                const group: ThreeObject = {
                  id: nextThreeId('group'),
                  name: 'Group',
                  kind: 'group',
                  parentId: null,
                  visible: true,
                  locked: false,
                  position: [0, 0, 0],
                  rotation: [0, 0, 0],
                  scale: [1, 1, 1],
                };
                let next = addObject(d, group);
                const selected = d.selectedIds[0];
                if (selected && selected !== group.id) next = reparentObject(next, selected, group.id);
                return next;
              });
            }}
          >
            <FolderPlus size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label="Import GLTF/GLB"
            onClick={async () => {
              try {
                const result = await api.importDialog('public/models', false);
                const rel = result?.files?.[0];
                if (rel) {
                  setDoc((d) => addObject(d, createGltfObject(rel)));
                  return;
                }
              } catch {
                /* fall through to prompt */
              }
              const manual = window.prompt('Project-relative GLTF/GLB path (e.g. public/models/hero.glb)');
              if (!manual) return;
              setDoc((d) => addObject(d, createGltfObject(manual)));
            }}
          >
            <Package size={13} />
          </IconButton>
        </div>
        <div className="three-editor__group" role="toolbar" aria-label="Transform mode">
          {(
            [
              ['translate', Move3d, 'Move'],
              ['rotate', RotateCcw, 'Rotate'],
              ['scale', Scaling, 'Scale'],
            ] as const
          ).map(([id, Icon, label]) => (
            <IconButton key={id} size="sm" label={label} active={mode === id} onClick={() => setMode(id)}>
              <Icon size={13} />
            </IconButton>
          ))}
        </div>
        <div className="three-editor__group three-editor__group--end">
          {syncNote ? <span className="three-editor__sync">{syncNote}</span> : null}
          <IconButton
            size="sm"
            label="Export R3F"
            onClick={() => {
              const result = exportScene(doc, 'r3f');
              void navigator.clipboard?.writeText(result.content);
              toast(`Copied ${result.filename} to clipboard`, 'success');
            }}
          >
            <Code2 size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label="Export vanilla Three.js"
            onClick={() => {
              const result = exportScene(doc, 'three-vanilla');
              void navigator.clipboard?.writeText(result.content);
              toast(`Copied ${result.filename} to clipboard`, 'success');
            }}
          >
            <FileCode2 size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label="Export JSON"
            onClick={() => {
              const result = exportScene(doc, 'json');
              void navigator.clipboard?.writeText(result.content);
              toast(`Copied ${result.filename} to clipboard`, 'success');
            }}
          >
            <Download size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label="Reload from source"
            onClick={async () => {
              if (!doc.file) return;
              try {
                const source = await api.readFile(doc.file);
                if (!isManagedThreeScene(source)) {
                  toast('Scene file is not OpenCanvas-managed (@opencanvas-three).', 'error');
                  return;
                }
                const parsed = parseR3fSceneSource(source, doc.file);
                if (!parsed) {
                  toast('Could not parse scene source.', 'error');
                  return;
                }
                setState((s) => ({ threeScenes: { ...s.threeScenes, [pageId]: parsed } }));
                setSyncNote('Loaded from source');
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Reload failed', 'error');
              }
            }}
          >
            <RotateCcw size={13} />
          </IconButton>
        </div>
      </header>

      <div className="three-editor__body">
        <aside className="three-editor__side three-editor__side--left">
          <ThreeHierarchy
            doc={doc}
            onSelect={onSelect}
            onToggleVisible={(id) => {
              const o = doc.objects.find((x) => x.id === id);
              if (o) onPatchObject(id, { visible: !o.visible });
            }}
            onDuplicate={(id) => setDoc((d) => duplicateObject(d, id))}
            onDelete={(id) => setDoc((d) => removeObjects(d, [id]))}
            onRename={(id, name) => setDoc((d) => renameObject(d, id, name))}
          />
        </aside>
        <main className={cx('three-editor__viewport')}>
          <ThreeViewport doc={doc} transformMode={mode} onSelect={onSelect} onChange={onPatchObject} />
        </main>
        <aside className="three-editor__side three-editor__side--right">
          <ThreeInspector
            doc={doc}
            onPatchObject={onPatchObject}
            onPatchEnv={(patch) => setDoc((d) => ({ ...d, environment: { ...d.environment, ...patch } }))}
          />
        </aside>
      </div>
    </div>
  );
}
