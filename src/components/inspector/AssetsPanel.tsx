import { useEffect, useState } from 'react';
import { Image as ImageIcon, VideoCamera } from '../../lib/hugeicons';
import { importAssets } from '../../lib/actions';
import { startAssetDrag, useProjectAssets, type ProjectAsset } from '../../lib/assets';

function Thumb({ asset }: { asset: ProjectAsset }) {
  const [failed, setFailed] = useState(false);
  if (!asset.url || failed) {
    return <span className="grid size-full place-items-center text-muted-foreground">{asset.kind === 'video' ? <VideoCamera size={22} /> : <ImageIcon size={22} />}</span>;
  }
  return asset.kind === 'video' ? (
    <video src={asset.url} muted preload="metadata" playsInline className="size-full object-cover" onError={() => setFailed(true)} />
  ) : (
    <img src={asset.url} alt="" draggable={false} loading="lazy" className="size-full object-contain p-2" onError={() => setFailed(true)} />
  );
}

/** Every image, SVG and video in the project, two to a row. Click to pick several, then drag them onto the canvas together. */
export function AssetsPanel() {
  const assets = useProjectAssets();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Files that no longer exist drop out of the selection.
  useEffect(() => {
    setPicked((prev) => {
      const live = new Set(assets.map((a) => a.path));
      const next = new Set([...prev].filter((p) => live.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [assets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && picked.size && !(e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]'))) setPicked(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked.size]);

  if (!assets.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted-foreground" data-tw="">
        <ImageIcon size={26} />
        <p className="m-0">No images or videos in this project yet. Drop files onto the canvas, or import them.</p>
        <button type="button" onClick={() => void importAssets('public')} className="h-8 cursor-pointer rounded-full border border-foreground/10 bg-transparent px-3.5 text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          Import files
        </button>
      </div>
    );
  }

  const toggle = (path: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return (
    <div className="vb flex flex-col gap-2 p-3" data-tw="">
      {picked.size > 0 && (
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>{picked.size} selected · drag onto the canvas</span>
          <button type="button" onClick={() => setPicked(new Set())} className="cursor-pointer rounded-full border-0 bg-transparent px-2 py-1 text-xs text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            Clear
          </button>
        </div>
      )}
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0" aria-label="Project assets">
        {assets.map((a) => {
          const on = picked.has(a.path);
          return (
            <li key={a.path} className="min-w-0">
              <div className="relative w-full" style={{ aspectRatio: '4 / 3' }}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${a.name}${on ? ', selected' : ''}`}
                  title={a.path}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    // Dragging a picked block takes every picked block; dragging an unpicked one takes just it.
                    const set = on ? assets.filter((x) => picked.has(x.path)) : [a];
                    void startAssetDrag(e, set).then((moved) => {
                      if (!moved) toggle(a.path);
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(a.path); }
                  }}
                  className="absolute inset-0 block size-full cursor-grab touch-none select-none overflow-hidden border-0 bg-muted/60 p-0 outline-none transition-[box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ height: '100%', borderRadius: 16, cornerShape: 'squircle', boxShadow: on ? 'inset 0 0 0 2px var(--foreground, currentColor)' : 'inset 0 0 0 1px color-mix(in srgb, var(--foreground, currentColor) 10%, transparent)' } as React.CSSProperties}
                >
                  <Thumb asset={a} />
                </button>
              </div>
              <span className="mt-1 block truncate px-1 text-[11px] text-muted-foreground">{a.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
