/** The project's visual assets (images, SVGs, videos) and dragging them from the panel onto the canvas. */
import { useMemo } from 'react';
import type { FileNode } from '../../shared/types';
import { dropAssets, assetUrl } from './actions';
import { frameElement, frameIds, sendToFrame } from './bridge';
import { useStore } from './store';

export interface ProjectAsset {
  path: string;
  name: string;
  kind: 'image' | 'video';
  /** Where the preview serves it, or null while the preview isn't running. */
  url: string | null;
}

const IMAGE = /\.(svg|png|jpe?g|gif|webp|avif|ico)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)$/i;
const SKIP = new Set(['node_modules', 'dist', 'build', '.git', '.opencanvas', '.next', '.vite']);

function walk(node: FileNode, out: Omit<ProjectAsset, 'url'>[]) {
  if (node.type === 'file') {
    if (IMAGE.test(node.name)) out.push({ path: node.path, name: node.name, kind: 'image' });
    else if (VIDEO.test(node.name)) out.push({ path: node.path, name: node.name, kind: 'video' });
    return;
  }
  for (const child of node.children ?? []) if (!SKIP.has(child.name)) walk(child, out);
}

export function useProjectAssets(): ProjectAsset[] {
  const tree = useStore((s) => s.fileTree);
  const base = useStore((s) => (s.previewStatus.state === 'running' ? s.previewStatus.url : null));
  return useMemo(() => {
    const found: Omit<ProjectAsset, 'url'>[] = [];
    if (tree) walk(tree, found);
    const origin = base ? base.replace(/\/$/, '') : null;
    return found
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((a) => ({ ...a, url: origin ? origin + assetUrl(a.path) : null }));
  }, [tree, base]);
}

/** Whichever preview frame the point is over, with the point in that frame's own pixels. */
function frameAt(x: number, y: number) {
  for (const id of frameIds()) {
    const el = frameElement(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const scale = el.clientWidth ? r.width / el.clientWidth : 1;
    return { id, x: (x - r.left) / scale, y: (y - r.top) / scale };
  }
  return null;
}

let token = 0;
function askFrame(frameId: string, x: number, y: number, hover: boolean) {
  return new Promise<{ id: string | null; tag: string | null }>((resolve) => {
    const mine = ++token;
    const done = (v: { id: string | null; tag: string | null }) => {
      window.removeEventListener('oc-asset-hit', on);
      clearTimeout(timer);
      resolve(v);
    };
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.token === mine) done({ id: d.id ?? null, tag: d.tag ?? null });
    };
    const timer = setTimeout(() => done({ id: null, tag: null }), 600);
    window.addEventListener('oc-asset-hit', on);
    sendToFrame(frameId, 'asset-hit', { x, y, hover, token: mine });
  });
}

/**
 * Pointer drag: a ghost follows the cursor, the frame under it highlights the element it would land in, and releasing over a
 * frame drops every dragged asset there. Returns false when the pointer never moved (a plain click).
 */
export function startAssetDrag(e: React.PointerEvent, assets: ProjectAsset[]): Promise<boolean> {
  const startX = e.clientX;
  const startY = e.clientY;
  return new Promise((resolve) => {
    let ghost: HTMLDivElement | null = null;
    let shield: HTMLDivElement | null = null;
    let moved = false;
    let lastHover = 0;
    let overFrame: string | null = null;

    const makeGhost = () => {
      const g = document.createElement('div');
      g.setAttribute('data-tw', '');
      g.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483000;pointer-events:none;width:72px;height:54px;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.28);background:#f1f1ef;border:1px solid rgba(0,0,0,.1);will-change:transform;';
      const first = assets[0];
      if (first.url && first.kind === 'image') {
        const img = document.createElement('img');
        img.src = first.url;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        g.appendChild(img);
      }
      if (assets.length > 1) {
        const b = document.createElement('span');
        b.textContent = String(assets.length);
        b.style.cssText = 'position:absolute;top:4px;right:4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#111;color:#fff;font:600 11px/18px system-ui;text-align:center;';
        g.appendChild(b);
      }
      document.body.appendChild(g);
      return g;
    };

    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
      if (!moved) {
        moved = true;
        // Frames swallow pointer events; a transparent sheet above everything keeps them coming to the window.
        shield = document.createElement('div');
        shield.style.cssText = 'position:fixed;inset:0;z-index:2147482999;cursor:grabbing;';
        document.body.appendChild(shield);
        ghost = makeGhost();
        document.body.style.cursor = 'grabbing';
      }
      ghost!.style.transform = `translate(${ev.clientX - 36}px, ${ev.clientY - 27}px)`;
      const f = frameAt(ev.clientX, ev.clientY);
      if (overFrame && overFrame !== f?.id) sendToFrame(overFrame, 'hover', { id: null });
      overFrame = f?.id ?? null;
      const now = performance.now();
      if (f && now - lastHover > 60) {
        lastHover = now;
        void askFrame(f.id, f.x, f.y, true);
      }
    };

    const finish = async (ev: PointerEvent | null) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      ghost?.remove();
      shield?.remove();
      document.body.style.cursor = '';
      if (overFrame) sendToFrame(overFrame, 'hover', { id: null });
      if (moved && ev) {
        const f = frameAt(ev.clientX, ev.clientY);
        if (f) {
          const hit = await askFrame(f.id, f.x, f.y, false);
          await dropAssets(assets.map((a) => a.path), hit);
        }
      }
      resolve(moved);
    };
    const up = (ev: PointerEvent) => void finish(ev);
    const cancel = () => void finish(null);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); void finish(null); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
  });
}
