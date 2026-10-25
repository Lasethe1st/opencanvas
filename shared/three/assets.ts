/** Asset helpers for GLTF/GLB and related 3D imports. */
import { nextThreeId, type ThreeObject } from './scene';
import { isSupportedThreeAsset } from './export';

export function createGltfObject(assetPath: string, name?: string): ThreeObject {
  const base = assetPath.split(/[/\\]/).pop()?.replace(/\.(gltf|glb|obj|fbx)$/i, '') || 'Model';
  return {
    id: nextThreeId('gltf'),
    name: name ?? base,
    kind: 'gltf',
    parentId: null,
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    assetPath,
  };
}

export function suggestAssetCopyPath(sourceName: string): string {
  const clean = sourceName.replace(/[^\w.\-]+/g, '_');
  return `public/models/${clean}`;
}

export function validateAssetPath(path: string): { ok: true } | { ok: false; reason: string } {
  if (!path || path.includes('..')) return { ok: false, reason: 'Unsafe asset path.' };
  if (!isSupportedThreeAsset(path)) return { ok: false, reason: 'Unsupported 3D asset format.' };
  return { ok: true };
}
