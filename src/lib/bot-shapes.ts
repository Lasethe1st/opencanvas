/**
 * 3D isometric avatars for bots. Each shape is built with three.js, lit like a small studio still, and rendered once to a
 * transparent PNG, then cached. The rest of the app just shows an <img>, so a page full of bots costs one WebGL
 * context, and three.js is only fetched the first time a bot is drawn.
 */
export const BOT_SHAPES = ['sphere', 'cube', 'pyramid', 'star', 'torus', 'gem', 'cylinder', 'capsule', 'knot', 'prism'] as const;
export type BotShape = (typeof BOT_SHAPES)[number];

export const BOT_SHAPE_LABELS: Record<BotShape, string> = {
  sphere: 'Sphere',
  cube: 'Cube',
  pyramid: 'Pyramid',
  star: 'Star',
  torus: 'Ring',
  gem: 'Gem',
  cylinder: 'Cylinder',
  capsule: 'Capsule',
  knot: 'Knot',
  prism: 'Prism',
};

export const isBotShape = (v: unknown): v is BotShape => typeof v === 'string' && (BOT_SHAPES as readonly string[]).includes(v);

/** A bot without a chosen shape gets a steady one from its id, so it never changes under you. */
export function defaultShape(id: string): BotShape {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BOT_SHAPES[h % BOT_SHAPES.length];
}

export type BotTheme = 'light' | 'dark';

const SIZE = 192;
const cache = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

/** A data-URL PNG of the shape for the theme, or null when WebGL isn't available. */
export function renderBotShape(shape: BotShape, theme: BotTheme): Promise<string | null> {
  const key = `${shape}:${theme}`;
  let hit = cache.get(key);
  if (!hit) {
    // One at a time: they share a single renderer.
    hit = queue.then(() => draw(shape, theme)).catch(() => null);
    queue = hit;
    cache.set(key, hit);
  }
  return hit;
}

type Three = typeof import('three');
let ctx: Promise<{ THREE: Three; renderer: import('three').WebGLRenderer }> | null = null;

function getContext() {
  ctx ??= (async () => {
    const THREE = await import('three');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return { THREE, renderer };
  })();
  return ctx;
}

async function draw(shape: BotShape, theme: BotTheme): Promise<string | null> {
  const { THREE, renderer } = await getContext();
  const { RoundedBoxGeometry } = await import('three/examples/jsm/geometries/RoundedBoxGeometry.js');

  const geometry = build(THREE, RoundedBoxGeometry, shape);
  geometry.computeBoundingSphere();
  geometry.center();
  const r = geometry.boundingSphere?.radius || 1;

  // Soft clay: one quiet grey per theme, no brand colour. The shading does the work.
  const color = theme === 'dark' ? 0x8e8e96 : 0xb4b4be;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.06 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(1 / r);

  const scene = new THREE.Scene();
  scene.add(mesh);
  scene.add(new THREE.HemisphereLight(0xffffff, theme === 'dark' ? 0x2a2a30 : 0x9a9aa6, theme === 'dark' ? 1.1 : 0.95));
  const key = new THREE.DirectionalLight(0xffffff, theme === 'dark' ? 2.2 : 2.0);
  key.position.set(-1.5, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(3, -1, -2);
  scene.add(rim);

  // True isometric: an orthographic camera on the (1, 1, 1) diagonal, so equal edges stay equal and parallel lines stay parallel.
  const half = 1.12;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 20);
  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  geometry.dispose();
  material.dispose();
  return url;
}

function build(THREE: Three, RoundedBoxGeometry: typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js').RoundedBoxGeometry, shape: BotShape): import('three').BufferGeometry {
  switch (shape) {
    case 'sphere':
      return new THREE.SphereGeometry(1, 48, 32);
    case 'cube':
      return new RoundedBoxGeometry(1.5, 1.5, 1.5, 6, 0.18);
    case 'pyramid':
      return new THREE.ConeGeometry(1.1, 1.6, 4, 1).rotateY(Math.PI / 4);
    case 'star': {
      const s = new THREE.Shape();
      const pts = 5;
      for (let i = 0; i < pts * 2; i++) {
        const rad = i % 2 === 0 ? 1.1 : 0.5;
        const a = (i / (pts * 2)) * Math.PI * 2 + Math.PI / 2;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 5 });
    }
    case 'torus':
      return new THREE.TorusGeometry(0.85, 0.34, 28, 64);
    case 'gem':
      return new THREE.IcosahedronGeometry(1.1, 0);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.8, 0.8, 1.5, 40);
    case 'capsule':
      return new THREE.CapsuleGeometry(0.62, 1.0, 10, 28);
    case 'knot':
      return new THREE.TorusKnotGeometry(0.75, 0.26, 140, 20);
    case 'prism':
      return new THREE.CylinderGeometry(0.95, 0.95, 1.4, 3);
  }
}
