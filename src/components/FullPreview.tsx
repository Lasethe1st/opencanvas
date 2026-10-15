import { Monitor, RotateCw, Smartphone, Tablet, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { pageUrl } from '../lib/pages';
import { activeFrame, pageOf, setState, useStore } from '../lib/store';
import { IconButton, Segmented } from '../ui/primitives.jsx';

const SIZES = [
  { id: 'desktop', label: 'Desktop', icon: <Monitor size={14} />, width: null },
  { id: 'tablet', label: 'Tablet', icon: <Tablet size={14} />, width: 834 },
  { id: 'mobile', label: 'Mobile', icon: <Smartphone size={14} />, width: 390 },
] as const;

type SizeId = (typeof SIZES)[number]['id'];

export function openFullPreview() {
  setState({ fullPreview: true });
  void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

function closeFullPreview() {
  setState({ fullPreview: false });
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}

export function FullPreview() {
  const open = useStore((s) => s.fullPreview);
  const status = useStore((s) => s.previewStatus);
  const page = useStore((s) => pageOf(activeFrame(s), s));
  const routeValues = useStore((s) => activeFrame(s)?.routeValues);
  const [size, setSize] = useState<SizeId>('desktop');
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeFullPreview();
    const onFullscreen = () => !document.fullscreenElement && setState({ fullPreview: false });
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [open]);

  if (!open) return null;
  const width = SIZES.find((s) => s.id === size)!.width;
  const interact = () => frame.current?.contentWindow?.postMessage({ source: 'oc-editor', type: 'mode', mode: 'interact' }, '*');

  return (
    <div className="full-preview" role="dialog" aria-label="Full screen preview">
      <div className="full-preview__bar">
        <Segmented label="Preview size" value={size} onChange={(id: SizeId) => setSize(id)} options={SIZES.map(({ id, label, icon }) => ({ id, label, icon }))} />
        <IconButton label="Reload" onClick={() => frame.current && (frame.current.src = frame.current.src)}>
          <RotateCw size={14} />
        </IconButton>
        <IconButton label="Exit preview (Esc)" onClick={closeFullPreview}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="full-preview__stage">
        {status.state === 'running' && status.url && !pageUrl(status.url, page, routeValues) ? (
          <p className="full-preview__note">This page needs example values. Enter them on its frame in the canvas.</p>
        ) : status.state === 'running' && status.url ? (
          <iframe
            ref={frame}
            src={pageUrl(status.url, page, routeValues)!}
            title="Full screen preview"
            className={width ? 'is-device' : undefined}
            style={width ? { width } : undefined}
            onLoad={interact}
          />
        ) : (
          <p className="full-preview__note">The preview isn’t running yet.</p>
        )}
      </div>
    </div>
  );
}
