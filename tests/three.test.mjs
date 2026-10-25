import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(APP_ROOT, 'tests', '.tmp');
const versions = { react: '19.0.0', reactDom: '19.0.0', vite: '7.0.0', pluginReact: '5.0.0' };

function makeProject() {
  const root = path.join(TMP, `three-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(root, { recursive: true });
  h.writeFiles(root, h.generateTemplate('blank', path.basename(root), 'Test', versions));
  return h.detectProject(root);
}

test('default scene has camera, light, ground, and cube', () => {
  const doc = h.createDefaultScene('src/scenes/MainScene.jsx');
  assert.equal(doc.version, 1);
  assert.equal(doc.file, 'src/scenes/MainScene.jsx');
  assert.ok(doc.objects.some((o) => o.kind === 'camera'));
  assert.ok(doc.objects.some((o) => o.kind === 'light'));
  assert.ok(doc.objects.some((o) => o.kind === 'mesh' && o.primitive === 'box'));
});

test('scene CRUD: add, rename, duplicate, delete, reparent', () => {
  let doc = h.createDefaultScene(null);
  const sphere = h.createPrimitive('sphere', 'Ball');
  doc = h.addObject(doc, sphere);
  assert.deepEqual(doc.selectedIds, [sphere.id]);
  doc = h.renameObject(doc, sphere.id, 'Hero ball');
  assert.equal(h.findObject(doc, sphere.id).name, 'Hero ball');
  doc = h.duplicateObject(doc, sphere.id);
  assert.equal(doc.objects.filter((o) => o.kind === 'mesh' && o.primitive === 'sphere').length, 2);
  const group = {
    id: h.nextThreeId('group'),
    name: 'Group',
    kind: 'group',
    parentId: null,
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  doc = h.addObject(doc, group);
  doc = h.reparentObject(doc, sphere.id, group.id);
  assert.equal(h.findObject(doc, sphere.id).parentId, group.id);
  doc = h.removeObjects(doc, [group.id]);
  assert.equal(h.findObject(doc, sphere.id), null);
  assert.equal(h.findObject(doc, group.id), null);
});

test('R3F generate → parse round-trip preserves meshes and lights', () => {
  const doc = h.createDefaultScene('src/scenes/MainScene.jsx');
  const source = h.generateR3fSceneSource(doc, 'MainScene');
  assert.match(source, /@opencanvas-three\s+scene/);
  assert.match(source, /meshStandardMaterial/);
  assert.match(source, /directionalLight/);
  const parsed = h.parseR3fSceneSource(source, 'src/scenes/MainScene.jsx');
  assert.ok(parsed);
  assert.ok(parsed.objects.some((o) => o.kind === 'mesh'));
  assert.ok(parsed.objects.some((o) => o.kind === 'light'));
  assert.equal(parsed.environment.background, doc.environment.background);
});

test('export formats emit r3f, json, and vanilla three', () => {
  const doc = h.createDefaultScene(null);
  const r3f = h.exportScene(doc, 'r3f');
  const json = h.exportScene(doc, 'json');
  const vanilla = h.exportScene(doc, 'three-vanilla');
  assert.equal(r3f.format, 'r3f');
  assert.match(r3f.content, /@react-three\/fiber/);
  assert.equal(json.format, 'json');
  assert.ok(JSON.parse(json.content).objects.length > 0);
  assert.equal(vanilla.format, 'three-vanilla');
  assert.match(vanilla.content, /WebGLRenderer/);
  assert.match(vanilla.content, /dispose\(\)/);
});

test('shader draft provides vertex and fragment GLSL', () => {
  const draft = h.createShaderMaterialDraft('#ff00aa');
  assert.equal(draft.type, 'shader');
  assert.match(draft.vertexShader, /gl_Position/);
  assert.match(draft.fragmentShader, /gl_FragColor/);
});

test('creating a three workspace page writes scene source and JSON', () => {
  const p = makeProject();
  const result = h.createWorkspacePage(p, 'Hero 3D', 'three');
  assert.equal(result.page.viewType, 'three');
  assert.equal(result.page.icon, 'box');
  assert.ok(result.page.file?.startsWith('src/scenes/'));
  assert.ok(fs.existsSync(path.join(p.root, result.page.file)));
  const source = fs.readFileSync(path.join(p.root, result.page.file), 'utf8');
  assert.match(source, /@opencanvas-three/);
  const jsonPath = path.join(p.root, '.opencanvas', 'three', `${result.page.id}.json`);
  assert.ok(fs.existsSync(jsonPath));
  const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(doc.file, result.page.file);
});

test('GLTF asset helpers validate paths', () => {
  const obj = h.createGltfObject('public/models/hero.glb');
  assert.equal(obj.kind, 'gltf');
  assert.equal(obj.assetPath, 'public/models/hero.glb');
  assert.equal(h.validateAssetPath('public/models/hero.glb').ok, true);
  assert.equal(h.validateAssetPath('../secret.glb').ok, false);
  assert.equal(h.isSupportedThreeAsset('a.fbx'), true);
  assert.equal(h.isSupportedThreeAsset('a.txt'), false);
});
