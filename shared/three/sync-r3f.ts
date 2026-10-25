/** Generate / round-trip React Three Fiber scene source from a ThreeSceneDoc. */
import {
  createDefaultScene,
  defaultMaterial,
  nextThreeId,
  type ThreeLightKind,
  type ThreeObject,
  type ThreePrimitive,
  type ThreeSceneDoc,
  type Vec3,
} from './scene';

const fmt = (n: number) => {
  const t = Math.round(n * 1000) / 1000;
  return Object.is(t, -0) ? '0' : String(t);
};

const vec = (v: Vec3) => `[${v.map(fmt).join(', ')}]`;

function meshJsx(o: ThreeObject): string {
  const geo =
    o.primitive === 'sphere'
      ? '<sphereGeometry args={[0.5, 32, 32]} />'
      : o.primitive === 'plane'
        ? '<planeGeometry args={[8, 8]} />'
        : o.primitive === 'cylinder'
          ? '<cylinderGeometry args={[0.5, 0.5, 1, 32]} />'
          : o.primitive === 'torus'
            ? '<torusGeometry args={[0.45, 0.18, 16, 48]} />'
            : o.primitive === 'cone'
              ? '<coneGeometry args={[0.5, 1, 32]} />'
              : '<boxGeometry args={[1, 1, 1]} />';
  const mat = o.material;
  const matJsx =
    mat?.type === 'shader' && mat.vertexShader && mat.fragmentShader
      ? `<shaderMaterial vertexShader={${JSON.stringify(mat.vertexShader)}} fragmentShader={${JSON.stringify(mat.fragmentShader)}} />`
      : mat?.type === 'basic'
        ? `<meshBasicMaterial color="${mat.color}"${mat.transparent ? ` transparent opacity={${fmt(mat.opacity ?? 1)}}` : ''} />`
        : `<meshStandardMaterial color="${mat?.color ?? '#8b9bb4'}" metalness={${fmt(mat?.metalness ?? 0.1)}} roughness={${fmt(mat?.roughness ?? 0.55)}}${mat?.transparent ? ` transparent opacity={${fmt(mat.opacity ?? 1)}}` : ''} />`;
  return `      <mesh name={${JSON.stringify(o.name)}} position={${vec(o.position)}} rotation={${vec(o.rotation)}} scale={${vec(o.scale)}} castShadow receiveShadow>
        ${geo}
        ${matJsx}
      </mesh>`;
}

function lightJsx(o: ThreeObject): string {
  const common = `name={${JSON.stringify(o.name)}} intensity={${fmt(o.intensity ?? 1)}}`;
  switch (o.light) {
    case 'ambient':
      return `      <ambientLight ${common} />`;
    case 'hemisphere':
      return `      <hemisphereLight ${common} position={${vec(o.position)}} />`;
    case 'point':
      return `      <pointLight ${common} position={${vec(o.position)}} castShadow={${!!o.castShadow}} />`;
    case 'spot':
      return `      <spotLight ${common} position={${vec(o.position)}} castShadow={${!!o.castShadow}} />`;
    default:
      return `      <directionalLight ${common} position={${vec(o.position)}} castShadow={${!!o.castShadow}} />`;
  }
}

function cameraJsx(o: ThreeObject): string {
  return `      <PerspectiveCamera makeDefault name={${JSON.stringify(o.name)}} position={${vec(o.position)}} fov={${fmt(o.fov ?? 50)}} near={${fmt(o.near ?? 0.1)}} far={${fmt(o.far ?? 200)}} />`;
}

function objectJsx(o: ThreeObject): string {
  if (!o.visible) return `      {/* hidden: ${o.name} */}`;
  if (o.kind === 'mesh') return meshJsx(o);
  if (o.kind === 'light') return lightJsx(o);
  if (o.kind === 'camera') return cameraJsx(o);
  if (o.kind === 'gltf' && o.assetPath) {
    return `      <Gltf src={${JSON.stringify(o.assetPath)}} name={${JSON.stringify(o.name)}} position={${vec(o.position)}} rotation={${vec(o.rotation)}} scale={${vec(o.scale)}} />`;
  }
  if (o.kind === 'group') {
    return `      <group name={${JSON.stringify(o.name)}} position={${vec(o.position)}} rotation={${vec(o.rotation)}} scale={${vec(o.scale)}} />`;
  }
  return `      {/* ${o.kind}: ${o.name} */}`;
}

/** Emits a self-contained R3F scene component. Marked for OpenCanvas sync. */
export function generateR3fSceneSource(doc: ThreeSceneDoc, componentName = 'MainScene'): string {
  const hasGltf = doc.objects.some((o) => o.kind === 'gltf' && o.assetPath);
  const hasCam = doc.objects.some((o) => o.kind === 'camera');
  const lines = doc.objects.map(objectJsx).join('\n');
  return `/** @opencanvas-three scene */
import { Canvas } from '@react-three/fiber';
import { OrbitControls${hasCam ? ', PerspectiveCamera' : ''}${hasGltf ? ', Gltf' : ''} } from '@react-three/drei';

export default function ${componentName}() {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [4, 3, 6], fov: 50 }}>
      <color attach="background" args={[${JSON.stringify(doc.environment.background)}]} />
      <ambientLight intensity={${fmt(doc.environment.ambientIntensity)}} />
${lines}
      <OrbitControls makeDefault />
    </Canvas>
  );
}
`;
}

/** Detects OpenCanvas-managed three scene files. */
export function isManagedThreeScene(source: string): boolean {
  return /@opencanvas-three\s+scene/.test(source);
}

/**
 * Best-effort parse of managed R3F scenes back into a document.
 * Only extracts objects we emitted; hand-edited structures may be incomplete.
 */
export function parseR3fSceneSource(source: string, file: string | null): ThreeSceneDoc | null {
  if (!isManagedThreeScene(source)) return null;
  const doc = createDefaultScene(file);
  doc.objects = [];

  const meshRe = /<mesh\b([^>]*)>([\s\S]*?)<\/mesh>/g;
  let m: RegExpExecArray | null;
  while ((m = meshRe.exec(source))) {
    const attrs = m[1];
    const body = m[2];
    const name = attrString(attrs, 'name') ?? 'Mesh';
    const position = attrVec(attrs, 'position') ?? ([0, 0, 0] as Vec3);
    const rotation = attrVec(attrs, 'rotation') ?? ([0, 0, 0] as Vec3);
    const scale = attrVec(attrs, 'scale') ?? ([1, 1, 1] as Vec3);
    let primitive: ThreePrimitive = 'box';
    if (/sphereGeometry/.test(body)) primitive = 'sphere';
    else if (/planeGeometry/.test(body)) primitive = 'plane';
    else if (/cylinderGeometry/.test(body)) primitive = 'cylinder';
    else if (/torusGeometry/.test(body)) primitive = 'torus';
    else if (/coneGeometry/.test(body)) primitive = 'cone';
    const color = /color="([^"]+)"/.exec(body)?.[1] ?? '#8b9bb4';
    doc.objects.push({
      id: nextThreeId('mesh'),
      name,
      kind: 'mesh',
      parentId: null,
      visible: true,
      locked: false,
      position,
      rotation,
      scale,
      primitive,
      material: defaultMaterial(color),
    });
  }

  const lightRe = /<(ambientLight|directionalLight|pointLight|spotLight|hemisphereLight)\b([^/]*?)(?:\/>|>)/g;
  while ((m = lightRe.exec(source))) {
    const tag = m[1];
    const attrs = m[2];
    const map: Record<string, ThreeLightKind> = {
      ambientLight: 'ambient',
      directionalLight: 'directional',
      pointLight: 'point',
      spotLight: 'spot',
      hemisphereLight: 'hemisphere',
    };
    doc.objects.push({
      id: nextThreeId('light'),
      name: attrString(attrs, 'name') ?? tag,
      kind: 'light',
      parentId: null,
      visible: true,
      locked: false,
      position: attrVec(attrs, 'position') ?? [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      light: map[tag] ?? 'directional',
      intensity: attrNum(attrs, 'intensity') ?? 1,
      castShadow: /castShadow=\{true\}/.test(attrs),
    });
  }

  const bg = /args=\{\[\s*['"]([^'"]+)['"]\s*\]\}/.exec(source);
  if (bg?.[1]) doc.environment.background = bg[1];

  if (doc.objects.length === 0) return null;
  const cam = doc.objects.find((o) => o.kind === 'camera');
  doc.activeCameraId = cam?.id ?? null;
  doc.selectedIds = doc.objects[0] ? [doc.objects[0].id] : [];
  return doc;
}

function attrString(attrs: string, key: string): string | null {
  const m =
    new RegExp(`${key}=\\{(?:JSON\\.stringify\\()?["']([^"']+)["']\\)?\\}`).exec(attrs) ||
    new RegExp(`${key}="([^"]+)"`).exec(attrs);
  return m?.[1] ?? null;
}

function attrNum(attrs: string, key: string): number | null {
  const m = new RegExp(`${key}=\\{(-?\\d+(?:\\.\\d+)?)\\}`).exec(attrs);
  return m ? Number(m[1]) : null;
}

function attrVec(attrs: string, key: string): Vec3 | null {
  const m = new RegExp(`${key}=\\{\\[\\s*(-?[\\d.]+)\\s*,\\s*(-?[\\d.]+)\\s*,\\s*(-?[\\d.]+)\\s*\\]\\}`).exec(attrs);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
