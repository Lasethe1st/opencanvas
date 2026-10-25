/** Export helpers: scene JSON, GLTF-friendly metadata, and reusable Three.js / R3F code. */
import { generateR3fSceneSource } from './sync-r3f';
import type { ThreeSceneDoc } from './scene';

export type ThreeExportFormat = 'r3f' | 'json' | 'three-vanilla';

export interface ThreeExportResult {
  format: ThreeExportFormat;
  filename: string;
  content: string;
  mime: string;
}

export function exportSceneJson(doc: ThreeSceneDoc): ThreeExportResult {
  return {
    format: 'json',
    filename: 'scene.opencanvas-three.json',
    content: JSON.stringify(doc, null, 2),
    mime: 'application/json',
  };
}

export function exportSceneR3f(doc: ThreeSceneDoc, componentName = 'MainScene'): ThreeExportResult {
  return {
    format: 'r3f',
    filename: `${componentName}.jsx`,
    content: generateR3fSceneSource(doc, componentName),
    mime: 'text/javascript',
  };
}

/** Imperative three.js sketch (no React) for reuse outside R3F. */
export function exportSceneVanilla(doc: ThreeSceneDoc): ThreeExportResult {
  const meshes = doc.objects.filter((o) => o.kind === 'mesh' && o.visible);
  const lights = doc.objects.filter((o) => o.kind === 'light' && o.visible);
  const lines: string[] = [
    `import * as THREE from 'three';`,
    `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';`,
    ``,
    `export function createScene(container) {`,
    `  const scene = new THREE.Scene();`,
    `  scene.background = new THREE.Color(${JSON.stringify(doc.environment.background)});`,
    `  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);`,
    `  camera.position.set(4, 3, 6);`,
    `  const renderer = new THREE.WebGLRenderer({ antialias: true });`,
    `  renderer.shadowMap.enabled = ${doc.environment.shadows};`,
    `  container.appendChild(renderer.domElement);`,
    `  const controls = new OrbitControls(camera, renderer.domElement);`,
    `  scene.add(new THREE.AmbientLight(0xffffff, ${doc.environment.ambientIntensity}));`,
  ];
  for (const L of lights) {
    if (L.light === 'ambient') continue;
    const [x, y, z] = L.position;
    lines.push(
      `  {`,
      `    const light = new THREE.DirectionalLight(0xffffff, ${L.intensity ?? 1});`,
      `    light.position.set(${x}, ${y}, ${z});`,
      `    light.castShadow = ${!!L.castShadow};`,
      `    scene.add(light);`,
      `  }`,
    );
  }
  for (const m of meshes) {
    const prim = m.primitive ?? 'box';
    const geo =
      prim === 'sphere'
        ? 'new THREE.SphereGeometry(0.5, 32, 32)'
        : prim === 'plane'
          ? 'new THREE.PlaneGeometry(8, 8)'
          : prim === 'cylinder'
            ? 'new THREE.CylinderGeometry(0.5, 0.5, 1, 32)'
            : prim === 'torus'
              ? 'new THREE.TorusGeometry(0.45, 0.18, 16, 48)'
              : prim === 'cone'
                ? 'new THREE.ConeGeometry(0.5, 1, 32)'
                : 'new THREE.BoxGeometry(1, 1, 1)';
    const [px, py, pz] = m.position;
    const [rx, ry, rz] = m.rotation;
    const [sx, sy, sz] = m.scale;
    lines.push(
      `  {`,
      `    const mesh = new THREE.Mesh(${geo}, new THREE.MeshStandardMaterial({ color: ${JSON.stringify(m.material?.color ?? '#8b9bb4')}, metalness: ${m.material?.metalness ?? 0.1}, roughness: ${m.material?.roughness ?? 0.55} }));`,
      `    mesh.name = ${JSON.stringify(m.name)};`,
      `    mesh.position.set(${px}, ${py}, ${pz});`,
      `    mesh.rotation.set(${rx}, ${ry}, ${rz});`,
      `    mesh.scale.set(${sx}, ${sy}, ${sz});`,
      `    mesh.castShadow = true; mesh.receiveShadow = true;`,
      `    scene.add(mesh);`,
      `  }`,
    );
  }
  lines.push(
    `  function resize() {`,
    `    const w = container.clientWidth || 1;`,
    `    const h = container.clientHeight || 1;`,
    `    camera.aspect = w / h;`,
    `    camera.updateProjectionMatrix();`,
    `    renderer.setSize(w, h, false);`,
    `  }`,
    `  resize();`,
    `  const ro = new ResizeObserver(resize);`,
    `  ro.observe(container);`,
    `  let raf = 0;`,
    `  function frame() {`,
    `    raf = requestAnimationFrame(frame);`,
    `    controls.update();`,
    `    renderer.render(scene, camera);`,
    `  }`,
    `  frame();`,
    `  return {`,
    `    scene, camera, renderer, controls,`,
    `    dispose() {`,
    `      cancelAnimationFrame(raf);`,
    `      ro.disconnect();`,
    `      controls.dispose();`,
    `      renderer.dispose();`,
    `      renderer.domElement.remove();`,
    `      scene.traverse((obj) => {`,
    `        if (obj.geometry) obj.geometry.dispose();`,
    `        if (obj.material) {`,
    `          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];`,
    `          mats.forEach((mat) => mat.dispose?.());`,
    `        }`,
    `      });`,
    `    },`,
    `  };`,
    `}`,
    ``,
  );
  return {
    format: 'three-vanilla',
    filename: 'createScene.js',
    content: lines.join('\n'),
    mime: 'text/javascript',
  };
}

export function exportScene(doc: ThreeSceneDoc, format: ThreeExportFormat): ThreeExportResult {
  if (format === 'json') return exportSceneJson(doc);
  if (format === 'three-vanilla') return exportSceneVanilla(doc);
  return exportSceneR3f(doc);
}

/** Supported import extensions for the asset picker. */
export const THREE_ASSET_EXTENSIONS = ['.gltf', '.glb', '.obj', '.fbx', '.hdr', '.exr', '.png', '.jpg', '.jpeg', '.webp'] as const;

export function isSupportedThreeAsset(path: string): boolean {
  const lower = path.toLowerCase();
  return THREE_ASSET_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
