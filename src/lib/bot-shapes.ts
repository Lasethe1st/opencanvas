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

/** One cheerful colour per shape: bright in light mode, a little deeper in dark so they don't glare. */
const SHAPE_COLORS: Record<BotShape, { light: number; dark: number }> = {
  sphere: { light: 0xff7a6b, dark: 0xf0675a },
  cube: { light: 0x5aa9ff, dark: 0x4a93ea },
  pyramid: { light: 0xffd23f, dark: 0xf0bf2a },
  star: { light: 0xff9f43, dark: 0xf08a2e },
  torus: { light: 0xff6fae, dark: 0xee5c9b },
  gem: { light: 0x3fd9b4, dark: 0x2fc4a1 },
  cylinder: { light: 0xa78bfa, dark: 0x9272ee },
  capsule: { light: 0x9be15d, dark: 0x86cf48 },
  knot: { light: 0xff5d73, dark: 0xee4a61 },
  prism: { light: 0x6f7cff, dark: 0x5c69ee },
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
  const [{ RoundedBoxGeometry }, { ConvexGeometry }, { mergeVertices }] = await Promise.all([
    import('three/examples/jsm/geometries/RoundedBoxGeometry.js'),
    import('three/examples/jsm/geometries/ConvexGeometry.js'),
    import('three/examples/jsm/utils/BufferGeometryUtils.js'),
  ]);

  const geometry = build(THREE, { RoundedBoxGeometry, ConvexGeometry, mergeVertices }, shape);
  geometry.computeBoundingSphere();
  geometry.center();
  const r = geometry.boundingSphere?.radius || 1;

  // Matte, like painted clay: no clear coat, no specular highlight, no rim light, and soft even lighting so the
  // faces only differ a little. The shape reads from its edges and the gentle change of tone between faces.
  const material = new THREE.MeshLambertMaterial({ color: SHAPE_COLORS[shape][theme] });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(1 / r);

  const scene = new THREE.Scene();
  scene.add(mesh);
  scene.add(new THREE.AmbientLight(0xffffff, 1.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-1.5, 4, 3);
  scene.add(key);

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

type Kit = {
  RoundedBoxGeometry: typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js').RoundedBoxGeometry;
  ConvexGeometry: typeof import('three/examples/jsm/geometries/ConvexGeometry.js').ConvexGeometry;
  mergeVertices: typeof import('three/examples/jsm/utils/BufferGeometryUtils.js').mergeVertices;
};

function build(THREE: Three, kit: Kit, shape: BotShape): import('three').BufferGeometry {
  const { RoundedBoxGeometry } = kit;
  switch (shape) {
    case 'sphere':
      return new THREE.SphereGeometry(1, 48, 32);
    case 'cube':
      return new RoundedBoxGeometry(1.5, 1.5, 1.5, 10, 0.42);
    case 'pyramid':
      return roundedHull(THREE, kit, [[0.62, -0.35, 0.62], [-0.62, -0.35, 0.62], [0.62, -0.35, -0.62], [-0.62, -0.35, -0.62], [0, 0.75, 0]], 0.4);
    case 'star': {
      const s = new THREE.Shape();
      const pts = 5;
      for (let i = 0; i < pts * 2; i++) {
        const rad = i % 2 === 0 ? 1.05 : 0.62;
        const a = (i / (pts * 2)) * Math.PI * 2 + Math.PI / 2;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.28, bevelSegments: 10 });
    }
    case 'torus':
      return new THREE.TorusGeometry(0.8, 0.42, 32, 64);
    case 'gem':
      return roundedHull(THREE, kit, new THREE.IcosahedronGeometry(0.68, 0).getAttribute('position').array, 0.4);
    case 'cylinder':
      return roundedCylinder(THREE, 0.85, 1.3, 0.45);
    case 'capsule':
      return new THREE.CapsuleGeometry(0.62, 1.0, 10, 28);
    case 'knot':
      return new THREE.TorusKnotGeometry(0.72, 0.3, 160, 24);
    case 'prism':
      return roundedHull(THREE, kit, [0, 1].flatMap((y) => [0, 1, 2].map((i) => [Math.cos((i * 2 * Math.PI) / 3 + Math.PI / 2) * 0.62, y ? 0.35 : -0.35, Math.sin((i * 2 * Math.PI) / 3 + Math.PI / 2) * 0.62])), 0.38);
  }
}

/** A cylinder with softened rims, spun from a profile so it stays smooth. */
function roundedCylinder(THREE: Three, radius: number, height: number, bevel: number): import('three').BufferGeometry {
  const h = height / 2;
  const pts: import('three').Vector2[] = [new THREE.Vector2(0, -h)];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.sin(a) * bevel, -h + bevel - Math.cos(a) * bevel));
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, h - bevel + Math.sin(a) * bevel));
  }
  pts.push(new THREE.Vector2(0, h));
  return new THREE.LatheGeometry(pts, 48);
}

/** A convex shape with every corner and edge rounded: the hull of a small sphere placed on each (shrunken) corner. */
function roundedHull(THREE: Three, kit: Kit, corners: ArrayLike<number> | number[][], radius: number): import('three').BufferGeometry {
  const flat: number[][] = Array.isArray(corners) && Array.isArray(corners[0])
    ? (corners as number[][])
    : Array.from({ length: (corners as ArrayLike<number>).length / 3 }, (_, i) => [(corners as ArrayLike<number>)[i * 3], (corners as ArrayLike<number>)[i * 3 + 1], (corners as ArrayLike<number>)[i * 3 + 2]]);
  const dirs = new THREE.IcosahedronGeometry(1, 3).getAttribute('position');
  const pts: import('three').Vector3[] = [];
  for (const [x, y, z] of flat) {
    for (let i = 0; i < dirs.count; i++) pts.push(new THREE.Vector3(x + dirs.getX(i) * radius, y + dirs.getY(i) * radius, z + dirs.getZ(i) * radius));
  }
  const hull = new kit.ConvexGeometry(pts);
  // Weld and re-smooth so the rounded parts read as one soft surface rather than facets.
  hull.deleteAttribute('normal');
  const welded = kit.mergeVertices(hull, 1e-3);
  welded.computeVertexNormals();
  return welded;
}
