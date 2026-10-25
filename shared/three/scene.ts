/** Serializable Three.js scene document used by the OpenCanvas 3D editor. */

export type Vec3 = [number, number, number];

export type ThreeObjectKind =
  | 'group'
  | 'mesh'
  | 'light'
  | 'camera'
  | 'helper'
  | 'gltf';

export type ThreePrimitive = 'box' | 'sphere' | 'plane' | 'cylinder' | 'torus' | 'cone';

export type ThreeLightKind = 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere';

export interface ThreeMaterial {
  type: 'standard' | 'basic' | 'physical' | 'shader';
  color: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  transparent?: boolean;
  map?: string | null;
  /** Custom GLSL (shader materials). */
  vertexShader?: string;
  fragmentShader?: string;
}

export interface ThreeObject {
  id: string;
  name: string;
  kind: ThreeObjectKind;
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  /** mesh */
  primitive?: ThreePrimitive;
  material?: ThreeMaterial;
  /** light */
  light?: ThreeLightKind;
  intensity?: number;
  castShadow?: boolean;
  /** camera */
  fov?: number;
  near?: number;
  far?: number;
  /** gltf */
  assetPath?: string | null;
}

export interface ThreeEnvironment {
  background: string;
  ambientIntensity: number;
  shadows: boolean;
  fog?: { color: string; near: number; far: number } | null;
  /** HDR / equirect path under the project, when set. */
  envMap?: string | null;
}

export interface ThreeSceneDoc {
  version: 1;
  /** Project-relative scene component (R3F) when linked to source. */
  file: string | null;
  environment: ThreeEnvironment;
  objects: ThreeObject[];
  activeCameraId: string | null;
  selectedIds: string[];
}

let seq = 0;
export function nextThreeId(prefix = 'obj'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function defaultMaterial(color = '#8b9bb4'): ThreeMaterial {
  return { type: 'standard', color, metalness: 0.1, roughness: 0.55, opacity: 1, transparent: false, map: null };
}

export function defaultEnvironment(): ThreeEnvironment {
  return {
    background: '#1a1a1a',
    ambientIntensity: 0.45,
    shadows: true,
    fog: null,
    envMap: null,
  };
}

/** Fresh scene with a ground plane, key light, and perspective camera. */
export function createDefaultScene(file: string | null = 'src/scenes/MainScene.jsx'): ThreeSceneDoc {
  const camId = nextThreeId('cam');
  const lightId = nextThreeId('light');
  const groundId = nextThreeId('mesh');
  const boxId = nextThreeId('mesh');
  return {
    version: 1,
    file,
    environment: defaultEnvironment(),
    activeCameraId: camId,
    selectedIds: [boxId],
    objects: [
      {
        id: camId,
        name: 'Camera',
        kind: 'camera',
        parentId: null,
        visible: true,
        locked: false,
        position: [4, 3, 6],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        fov: 50,
        near: 0.1,
        far: 200,
      },
      {
        id: lightId,
        name: 'Key light',
        kind: 'light',
        parentId: null,
        visible: true,
        locked: false,
        position: [4, 8, 2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        light: 'directional',
        intensity: 1.2,
        castShadow: true,
      },
      {
        id: groundId,
        name: 'Ground',
        kind: 'mesh',
        parentId: null,
        visible: true,
        locked: false,
        position: [0, 0, 0],
        rotation: [-Math.PI / 2, 0, 0],
        scale: [1, 1, 1],
        primitive: 'plane',
        material: defaultMaterial('#2a2e35'),
      },
      {
        id: boxId,
        name: 'Cube',
        kind: 'mesh',
        parentId: null,
        visible: true,
        locked: false,
        position: [0, 0.5, 0],
        rotation: [0, 0.4, 0],
        scale: [1, 1, 1],
        primitive: 'box',
        material: defaultMaterial('#6ea8fe'),
      },
    ],
  };
}

export function childrenOf(doc: ThreeSceneDoc, parentId: string | null): ThreeObject[] {
  return doc.objects.filter((o) => o.parentId === parentId);
}

export function findObject(doc: ThreeSceneDoc, id: string): ThreeObject | null {
  return doc.objects.find((o) => o.id === id) ?? null;
}

export function addObject(doc: ThreeSceneDoc, object: ThreeObject): ThreeSceneDoc {
  return { ...doc, objects: [...doc.objects, object], selectedIds: [object.id] };
}

export function updateObject(doc: ThreeSceneDoc, id: string, patch: Partial<ThreeObject>): ThreeSceneDoc {
  return {
    ...doc,
    objects: doc.objects.map((o) => (o.id === id ? { ...o, ...patch, id: o.id } : o)),
  };
}

export function removeObjects(doc: ThreeSceneDoc, ids: string[]): ThreeSceneDoc {
  const drop = new Set(ids);
  // Also drop descendants.
  let changed = true;
  while (changed) {
    changed = false;
    for (const o of doc.objects) {
      if (o.parentId && drop.has(o.parentId) && !drop.has(o.id)) {
        drop.add(o.id);
        changed = true;
      }
    }
  }
  return {
    ...doc,
    objects: doc.objects.filter((o) => !drop.has(o.id)),
    selectedIds: doc.selectedIds.filter((id) => !drop.has(id)),
    activeCameraId: doc.activeCameraId && drop.has(doc.activeCameraId) ? null : doc.activeCameraId,
  };
}

export function duplicateObject(doc: ThreeSceneDoc, id: string): ThreeSceneDoc {
  const src = findObject(doc, id);
  if (!src) return doc;
  const copy: ThreeObject = {
    ...src,
    id: nextThreeId(src.kind),
    name: `${src.name} copy`,
    material: src.material ? { ...src.material } : undefined,
  };
  return addObject(doc, copy);
}

export function renameObject(doc: ThreeSceneDoc, id: string, name: string): ThreeSceneDoc {
  const clean = name.trim();
  if (!clean) return doc;
  return updateObject(doc, id, { name: clean });
}

export function reparentObject(doc: ThreeSceneDoc, id: string, parentId: string | null): ThreeSceneDoc {
  if (id === parentId) return doc;
  if (parentId) {
    // Prevent cycles.
    let cur: string | null = parentId;
    while (cur) {
      if (cur === id) return doc;
      cur = findObject(doc, cur)?.parentId ?? null;
    }
  }
  return updateObject(doc, id, { parentId });
}

export function createPrimitive(kind: ThreePrimitive, name?: string): ThreeObject {
  const labels: Record<ThreePrimitive, string> = {
    box: 'Cube',
    sphere: 'Sphere',
    plane: 'Plane',
    cylinder: 'Cylinder',
    torus: 'Torus',
    cone: 'Cone',
  };
  return {
    id: nextThreeId('mesh'),
    name: name ?? labels[kind],
    kind: 'mesh',
    parentId: null,
    visible: true,
    locked: false,
    position: [0, kind === 'plane' ? 0 : 0.5, 0],
    rotation: kind === 'plane' ? [-Math.PI / 2, 0, 0] : [0, 0, 0],
    scale: [1, 1, 1],
    primitive: kind,
    material: defaultMaterial(),
  };
}

export function createLight(light: ThreeLightKind, name?: string): ThreeObject {
  return {
    id: nextThreeId('light'),
    name: name ?? `${light[0].toUpperCase()}${light.slice(1)} light`,
    kind: 'light',
    parentId: null,
    visible: true,
    locked: false,
    position: light === 'ambient' || light === 'hemisphere' ? [0, 0, 0] : [3, 5, 2],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    light,
    intensity: light === 'ambient' ? 0.4 : 1,
    castShadow: light === 'directional' || light === 'spot',
  };
}

export function normalizeSceneDoc(raw: unknown, fallbackFile: string | null = null): ThreeSceneDoc {
  if (!raw || typeof raw !== 'object') return createDefaultScene(fallbackFile);
  const v = raw as Partial<ThreeSceneDoc>;
  const base = createDefaultScene(typeof v.file === 'string' ? v.file : fallbackFile);
  if (!Array.isArray(v.objects) || v.objects.length === 0) return base;
  return {
    version: 1,
    file: typeof v.file === 'string' ? v.file : fallbackFile,
    environment: { ...defaultEnvironment(), ...(v.environment ?? {}) },
    objects: v.objects.map((o) => ({
      ...o,
      position: (o.position as Vec3) ?? [0, 0, 0],
      rotation: (o.rotation as Vec3) ?? [0, 0, 0],
      scale: (o.scale as Vec3) ?? [1, 1, 1],
      visible: o.visible !== false,
      locked: !!o.locked,
      parentId: o.parentId ?? null,
    })),
    activeCameraId: typeof v.activeCameraId === 'string' ? v.activeCameraId : base.activeCameraId,
    selectedIds: Array.isArray(v.selectedIds) ? v.selectedIds.filter((id): id is string => typeof id === 'string') : [],
  };
}
