/** Pure geometry for the free canvas: camera, frames, fitting, snapping and persistence. */
import type { Breakpoint, BreakpointConfig } from './types';

export interface Camera {
  /** Screen position of the world origin, in CSS pixels. */
  x: number;
  y: number;
  zoom: number;
}

export type FramePreset = 'desktop' | 'laptop' | 'tablet' | 'mobile' | 'custom';

export interface FrameLayout {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  preset: FramePreset;
  /** Grow the frame to the page height instead of scrolling inside a fixed viewport. */
  fitPage: boolean;
  /** Project page this frame shows; absent in layouts saved before pages existed (the first page). */
  pageId?: string;
  /** Example values for the page's dynamic segments, e.g. { slug: "hello-world" }. */
  routeValues?: Record<string, string>;
}

export interface CanvasLayout {
  version: 1;
  frames: FrameLayout[];
  activeFrameId: string | null;
  camera: Camera;
  syncScroll: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Guide {
  axis: 'x' | 'y';
  /** World coordinate of the guide line. */
  at: number;
  from: number;
  to: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;
export const MIN_FRAME = { width: 240, height: 240 };
export const MAX_FRAME = { width: 3840, height: 20000 };
export const GRID = 8;
export const FRAME_GAP = 120;

export const PRESETS: Record<Exclude<FramePreset, 'custom'>, { name: string; width: number; height: number }> = {
  desktop: { name: 'Desktop', width: 1440, height: 900 },
  laptop: { name: 'Laptop', width: 1280, height: 800 },
  tablet: { name: 'Tablet', width: 834, height: 1112 },
  mobile: { name: 'Mobile', width: 390, height: 844 },
};

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function worldToScreen(camera: Camera, p: Point): Point {
  return { x: p.x * camera.zoom + camera.x, y: p.y * camera.zoom + camera.y };
}

export function screenToWorld(camera: Camera, p: Point): Point {
  return { x: (p.x - camera.x) / camera.zoom, y: (p.y - camera.y) / camera.zoom };
}

/** Zooms by `factor` while keeping the world point under `anchor` (screen coordinates) fixed. */
export function zoomAt(camera: Camera, factor: number, anchor: Point): Camera {
  const zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const world = screenToWorld(camera, anchor);
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom };
}

export function zoomTo(camera: Camera, zoom: number, anchor: Point): Camera {
  return zoomAt(camera, zoom / camera.zoom, anchor);
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/** Converts a wheel delta into a zoom factor; trackpad pinches arrive as small ctrl+wheel deltas. */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaY;
  return Math.exp(-clamp(pixels, -60, 60) * 0.0075);
}

export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** Camera that shows `bounds` inside a viewport, leaving `padding` screen pixels (frame labels sit above frames). */
export function fitCamera(bounds: Rect, viewport: { width: number; height: number }, padding = 64, maxZoom = 1): Camera {
  const availW = Math.max(viewport.width - padding * 2, 40);
  const availH = Math.max(viewport.height - padding * 2, 40);
  const zoom = clamp(Math.min(availW / Math.max(bounds.width, 1), availH / Math.max(bounds.height, 1), maxZoom), MIN_ZOOM, MAX_ZOOM);
  return {
    zoom,
    x: (viewport.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (viewport.height - bounds.height * zoom) / 2 - bounds.y * zoom,
  };
}

/** The breakpoint whose overrides apply to a viewport of this width (max-width media queries). */
export function breakpointFor(width: number, config: BreakpointConfig): Breakpoint {
  if (width <= config.mobile) return 'mobile';
  if (width <= config.tablet) return 'tablet';
  return 'base';
}

export const snapToGrid = (value: number, grid = GRID) => Math.round(value / grid) * grid;

function closest<T extends { value: number; target: number }>(candidates: T[], threshold: number) {
  let best: (T & { distance: number }) | null = null;
  for (const c of candidates) {
    const distance = Math.abs(c.value - c.target);
    if (distance <= threshold && (!best || distance < best.distance)) best = { ...c, distance };
  }
  return best;
}

const xs = (r: Rect) => [r.x, r.x + r.width / 2, r.x + r.width];
const ys = (r: Rect) => [r.y, r.y + r.height / 2, r.y + r.height];

/**
 * Snaps a moving rect to the edges and centres of other frames (within `threshold` world px),
 * falling back to the 8px grid. Returns the snapped position and the guides to draw.
 */
export function snapMove(rect: Rect, others: Rect[], threshold: number, enabled = true): { x: number; y: number; guides: Guide[] } {
  if (!enabled) return { x: Math.round(rect.x), y: Math.round(rect.y), guides: [] };
  const guides: Guide[] = [];
  const offsetsX = xs(rect).map((v) => v - rect.x);
  const offsetsY = ys(rect).map((v) => v - rect.y);
  const candX = others.flatMap((o) => xs(o).flatMap((target) => offsetsX.map((off) => ({ value: rect.x + off, target, off }))));
  const candY = others.flatMap((o) => ys(o).flatMap((target) => offsetsY.map((off) => ({ value: rect.y + off, target, off }))));
  const bx = closest(candX, threshold);
  const by = closest(candY, threshold);
  const x = bx ? bx.target - bx.off : snapToGrid(rect.x);
  const y = by ? by.target - by.off : snapToGrid(rect.y);
  const moved = { ...rect, x, y };
  if (bx) guides.push(guideFor('x', bx.target, moved, others));
  if (by) guides.push(guideFor('y', by.target, moved, others));
  return { x, y, guides };
}

/** Snaps the right/bottom edges of a resizing rect, keeping its top-left fixed. */
export function snapResize(rect: Rect, others: Rect[], threshold: number, enabled = true): { width: number; height: number; guides: Guide[] } {
  const limit = (w: number, h: number) => ({
    width: clamp(Math.round(w), MIN_FRAME.width, MAX_FRAME.width),
    height: clamp(Math.round(h), MIN_FRAME.height, MAX_FRAME.height),
  });
  if (!enabled) return { ...limit(rect.width, rect.height), guides: [] };
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const bx = closest(others.flatMap((o) => xs(o).map((target) => ({ value: right, target }))), threshold);
  const by = closest(others.flatMap((o) => ys(o).map((target) => ({ value: bottom, target }))), threshold);
  const size = limit(bx ? bx.target - rect.x : snapToGrid(rect.width), by ? by.target - rect.y : snapToGrid(rect.height));
  const sized = { ...rect, ...size };
  const guides: Guide[] = [];
  if (bx) guides.push(guideFor('x', bx.target, sized, others));
  if (by) guides.push(guideFor('y', by.target, sized, others));
  return { ...size, guides };
}

function guideFor(axis: 'x' | 'y', at: number, rect: Rect, others: Rect[]): Guide {
  const touching = others.filter((o) => (axis === 'x' ? xs(o) : ys(o)).some((v) => Math.abs(v - at) < 0.5));
  const all = [rect, ...touching];
  if (axis === 'x') return { axis, at, from: Math.min(...all.map((r) => r.y)) - 24, to: Math.max(...all.map((r) => r.y + r.height)) + 24 };
  return { axis, at, from: Math.min(...all.map((r) => r.x)) - 24, to: Math.max(...all.map((r) => r.x + r.width)) + 24 };
}

/** A free spot to the right of the existing frames, top-aligned with them. */
export function placeFrame(frames: Rect[], size: { width: number; height: number }): Point {
  if (!frames.length) return { x: 0, y: 0 };
  const bounds = unionRect(frames)!;
  return { x: snapToGrid(bounds.x + bounds.width + FRAME_GAP), y: snapToGrid(bounds.y) };
}

/** A free spot under all existing frames, left-aligned with them; each page starts its own row. */
export function placeBelow(frames: Rect[]): Point {
  if (!frames.length) return { x: 0, y: 0 };
  const bounds = unionRect(frames)!;
  return { x: snapToGrid(bounds.x), y: snapToGrid(bounds.y + bounds.height + FRAME_GAP * 2) };
}

let idCounter = 0;
export function frameId(): string {
  idCounter += 1;
  return `f${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function presetFrame(preset: Exclude<FramePreset, 'custom'>, at: Point, config?: BreakpointConfig): FrameLayout {
  const p = PRESETS[preset];
  // Keep preset frames inside the project's own breakpoints so they edit the expected scope.
  const width = config && preset === 'tablet' ? Math.min(p.width, config.tablet) : config && preset === 'mobile' ? Math.min(p.width, config.mobile) : p.width;
  return { id: frameId(), name: p.name, x: at.x, y: at.y, width, height: p.height, preset, fitPage: false };
}

/** Desktop, tablet and mobile side by side. */
export function defaultFrames(config?: BreakpointConfig): FrameLayout[] {
  const frames: FrameLayout[] = [];
  for (const preset of ['desktop', 'tablet', 'mobile'] as const) {
    const at = placeFrame(frames, PRESETS[preset]);
    frames.push(presetFrame(preset, at, config));
  }
  return frames;
}

export function defaultLayout(config?: BreakpointConfig): CanvasLayout {
  const frames = defaultFrames(config);
  return { version: 1, frames, activeFrameId: frames[0].id, camera: { x: 0, y: 0, zoom: 0.25 }, syncScroll: false };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validates persisted layouts; anything unusable falls back to the default layout. */
export function normalizeLayout(raw: unknown, config?: BreakpointConfig): CanvasLayout {
  const value = raw as Partial<CanvasLayout> | null;
  if (!value || value.version !== 1 || !Array.isArray(value.frames)) return defaultLayout(config);
  const frames: FrameLayout[] = [];
  for (const f of value.frames as Partial<FrameLayout>[]) {
    if (!f || typeof f.id !== 'string' || !finite(f.x) || !finite(f.y) || !finite(f.width) || !finite(f.height)) continue;
    frames.push({
      id: f.id,
      name: typeof f.name === 'string' && f.name.trim() ? f.name : 'Frame',
      x: f.x,
      y: f.y,
      width: clamp(f.width, MIN_FRAME.width, MAX_FRAME.width),
      height: clamp(f.height, MIN_FRAME.height, MAX_FRAME.height),
      preset: f.preset && (f.preset === 'custom' || f.preset in PRESETS) ? f.preset : 'custom',
      fitPage: !!f.fitPage,
      ...(typeof f.pageId === 'string' && f.pageId ? { pageId: f.pageId } : {}),
      ...(f.routeValues && typeof f.routeValues === 'object'
        ? { routeValues: Object.fromEntries(Object.entries(f.routeValues).filter(([k, v]) => /^[\w-]+$/.test(k) && typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 200)])) }
        : {}),
    });
  }
  if (!frames.length) return defaultLayout(config);
  const cam = value.camera;
  const camera = cam && finite(cam.x) && finite(cam.y) && finite(cam.zoom) ? { x: cam.x, y: cam.y, zoom: clamp(cam.zoom, MIN_ZOOM, MAX_ZOOM) } : { x: 0, y: 0, zoom: 0.25 };
  const activeFrameId = frames.some((f) => f.id === value.activeFrameId) ? value.activeFrameId! : frames[0].id;
  return { version: 1, frames, activeFrameId, camera, syncScroll: !!value.syncScroll };
}

/** A copy of `frame` placed to its right, with a unique name. */
export function duplicateFrame(frame: FrameLayout, frames: FrameLayout[]): FrameLayout {
  const names = new Set(frames.map((f) => f.name));
  let name = `${frame.name} copy`;
  for (let i = 2; names.has(name); i++) name = `${frame.name} copy ${i}`;
  const at = placeFrame(frames, frame);
  return { ...frame, id: frameId(), name, ...at };
}
