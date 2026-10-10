import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const h = require('../dist-electron/harness.cjs');

const BPS = { tablet: 1024, mobile: 640, detected: false };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('world and screen coordinates round-trip through the camera', () => {
  const camera = { x: 120, y: -40, zoom: 0.5 };
  const p = h.worldToScreen(camera, { x: 200, y: 300 });
  assert.deepEqual(p, { x: 220, y: 110 });
  assert.deepEqual(h.screenToWorld(camera, p), { x: 200, y: 300 });
});

test('zooming keeps the point under the cursor fixed and respects limits', () => {
  const camera = { x: 10, y: 20, zoom: 1 };
  const anchor = { x: 400, y: 300 };
  const before = h.screenToWorld(camera, anchor);
  const zoomed = h.zoomAt(camera, 2, anchor);
  assert.equal(zoomed.zoom, 2);
  const after = h.screenToWorld(zoomed, anchor);
  near(after.x, before.x);
  near(after.y, before.y);
  assert.equal(h.zoomAt(camera, 1000, anchor).zoom, h.MAX_ZOOM);
  assert.equal(h.zoomAt(camera, 0.0001, anchor).zoom, h.MIN_ZOOM);
  assert.equal(h.zoomTo(camera, 0.25, anchor).zoom, 0.25);
  assert.deepEqual(h.panBy(camera, 5, -5), { x: 15, y: 15, zoom: 1 });
});

test('wheel zoom factor zooms in on negative deltas and is bounded', () => {
  assert.ok(h.wheelZoomFactor(-10) > 1);
  assert.ok(h.wheelZoomFactor(10) < 1);
  assert.equal(h.wheelZoomFactor(10000), h.wheelZoomFactor(60));
  assert.equal(h.wheelZoomFactor(3, 1), h.wheelZoomFactor(48));
});

test('fitCamera centres the bounds inside the padded viewport', () => {
  const bounds = { x: 0, y: 0, width: 2000, height: 1000 };
  const cam = h.fitCamera(bounds, { width: 1128, height: 628 }, 64);
  near(cam.zoom, 0.5);
  const tl = h.worldToScreen(cam, { x: 0, y: 0 });
  const br = h.worldToScreen(cam, { x: 2000, y: 1000 });
  near(tl.x, 1128 - br.x);
  near(tl.y, 628 - br.y);
  assert.equal(h.fitCamera({ x: 0, y: 0, width: 100, height: 100 }, { width: 1000, height: 1000 }).zoom, 1, 'never zooms past maxZoom');
});

test('breakpointFor infers the scope from the frame width', () => {
  assert.equal(h.breakpointFor(1440, BPS), 'base');
  assert.equal(h.breakpointFor(1025, BPS), 'base');
  assert.equal(h.breakpointFor(1024, BPS), 'tablet');
  assert.equal(h.breakpointFor(641, BPS), 'tablet');
  assert.equal(h.breakpointFor(640, BPS), 'mobile');
  assert.equal(h.breakpointFor(390, BPS), 'mobile');
});

test('snapMove aligns to other frames and falls back to the grid', () => {
  const other = { x: 0, y: 0, width: 400, height: 300 };
  const snapped = h.snapMove({ x: 403, y: 501, width: 200, height: 200 }, [other], 6);
  assert.equal(snapped.x, 400, 'left edge snaps to the right edge of the other frame');
  assert.equal(snapped.y, 504, 'no frame nearby vertically, so the grid wins');
  assert.equal(snapped.guides.length, 1);
  assert.equal(snapped.guides[0].axis, 'x');
  assert.equal(snapped.guides[0].at, 400);
  const free = h.snapMove({ x: 403.4, y: 501.6, width: 200, height: 200 }, [other], 6, false);
  assert.deepEqual(free, { x: 403, y: 502, guides: [] });
});

test('snapResize clamps sizes and snaps the moving edges', () => {
  const other = { x: 1000, y: 0, width: 400, height: 900 };
  const r = h.snapResize({ x: 0, y: 0, width: 998, height: 897 }, [other], 6);
  assert.equal(r.width, 1000);
  assert.equal(r.height, 900);
  assert.equal(r.guides.length, 2);
  const tiny = h.snapResize({ x: 0, y: 0, width: 10, height: 10 }, [], 6, false);
  assert.deepEqual(tiny, { width: h.MIN_FRAME.width, height: h.MIN_FRAME.height, guides: [] });
});

test('new frames are placed to the right of existing ones', () => {
  assert.deepEqual(h.placeFrame([], { width: 100, height: 100 }), { x: 0, y: 0 });
  const at = h.placeFrame([{ x: 0, y: 16, width: 1440, height: 900 }], { width: 390, height: 844 });
  assert.deepEqual(at, { x: 1440 + h.FRAME_GAP, y: 16 });
});

test('default layout has desktop, tablet and mobile in their own scopes', () => {
  const layout = h.defaultLayout(BPS);
  assert.deepEqual(layout.frames.map((f) => f.name), ['Desktop', 'Tablet', 'Mobile']);
  assert.deepEqual(layout.frames.map((f) => h.breakpointFor(f.width, BPS)), ['base', 'tablet', 'mobile']);
  assert.equal(layout.activeFrameId, layout.frames[0].id);
  for (let i = 1; i < layout.frames.length; i++) {
    const prev = layout.frames[i - 1];
    assert.ok(layout.frames[i].x >= prev.x + prev.width, 'frames do not overlap');
  }
  const narrow = h.presetFrame('tablet', { x: 0, y: 0 }, { tablet: 768, mobile: 480, detected: true });
  assert.equal(narrow.width, 768, 'tablet preset clamps to the project breakpoint');
});

test('normalizeLayout keeps valid data and repairs or rejects the rest', () => {
  assert.equal(h.normalizeLayout(null, BPS).frames.length, 3);
  assert.equal(h.normalizeLayout({ version: 2, frames: [] }, BPS).frames.length, 3);
  assert.equal(h.normalizeLayout({ version: 1, frames: [{ id: 'x' }] }, BPS).frames.length, 3, 'unusable frames fall back to defaults');

  const layout = h.normalizeLayout({
    version: 1,
    frames: [
      { id: 'a', name: '', x: 0, y: 0, width: 50, height: 99999, preset: 'weird', fitPage: 1 },
      { id: 'b', name: 'Phone', x: 500, y: 0, width: 390, height: 844, preset: 'mobile' },
      { id: 'c', name: 'Broken', x: NaN, y: 0, width: 100, height: 100 },
    ],
    activeFrameId: 'gone',
    camera: { x: 1, y: 2, zoom: 99 },
    syncScroll: 'yes',
  }, BPS);
  assert.deepEqual(layout.frames.map((f) => f.id), ['a', 'b']);
  assert.deepEqual(layout.frames[0], { id: 'a', name: 'Frame', x: 0, y: 0, width: h.MIN_FRAME.width, height: h.MAX_FRAME.height, preset: 'custom', fitPage: true });
  assert.equal(layout.activeFrameId, 'a');
  assert.deepEqual(layout.camera, { x: 1, y: 2, zoom: h.MAX_ZOOM });
  assert.equal(layout.syncScroll, true);
  assert.deepEqual(h.normalizeLayout(JSON.parse(JSON.stringify(layout)), BPS), layout, 'normalizing is idempotent');
});

test('duplicateFrame gives a unique name and a free position', () => {
  const layout = h.defaultLayout(BPS);
  const desktop = layout.frames[0];
  const copy = h.duplicateFrame(desktop, layout.frames);
  assert.equal(copy.name, 'Desktop copy');
  assert.notEqual(copy.id, desktop.id);
  assert.equal(copy.width, desktop.width);
  const second = h.duplicateFrame(desktop, [...layout.frames, copy]);
  assert.equal(second.name, 'Desktop copy 2');
  assert.ok(second.x > copy.x);
});
