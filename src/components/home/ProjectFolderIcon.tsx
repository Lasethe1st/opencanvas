import { useId } from 'react';
import { cn } from '@/lib/utils';

/** A project's folder colour: picked from its name, so the same project is the same colour everywhere. */
export function folderHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Hue for a plain folder that belongs to no project (a directory in the file tree). */
export const PLAIN_FOLDER_HUE = 215;

/**
 * The small folder used wherever a project is named in the app: a back with its tab and a lit front, solid colour, no
 * outline. It is the Projects page folder simplified, because the paper and the highlight only blur at 16px.
 */
export function ProjectFolderIcon({ name, hue, className = 'size-4' }: { name?: string; hue?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const h = hue ?? (name ? folderHue(name) : PLAIN_FOLDER_HUE);
  return (
    <svg viewBox="0 0 24 20" className={cn('shrink-0', className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${h} 62% 72%)`} />
          <stop offset="1" stopColor={`hsl(${h} 52% 60%)`} />
        </linearGradient>
      </defs>
      <path d="M2.5 1.5h6.2c.8 0 1.3.3 1.8.9l.9 1.1h9.6c1 0 1.5.7 1.5 1.5v11.5c0 1-.7 1.5-1.5 1.5h-18.5c-1 0-1.5-.7-1.5-1.5V3c0-.9.6-1.5 1.5-1.5z" fill={`hsl(${h} 42% 48%)`} />
      <path d="M1 7.2c0-1 .6-1.7 1.6-1.7h18.8c1 0 1.6.7 1.6 1.7v9.1c0 1-.6 1.7-1.6 1.7H2.6C1.600 18 1 17.300 1 16.300z" fill={`url(#f${id})`} />
    </svg>
  );
}
