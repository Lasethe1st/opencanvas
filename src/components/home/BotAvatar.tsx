import { useEffect, useState } from 'react';
import { renderBotShape, type BotShape } from '@/lib/bot-shapes';
import { useTheme } from '@/lib/theme';

/** A bot's 3D avatar: a still render of its shape, drawn once and cached. Empty until it's ready (or if WebGL isn't there). */
export function BotAvatar({ shape, size = 32, className }: { shape: BotShape; size?: number; className?: string }) {
  const theme = useTheme().resolved === 'dark' ? 'dark' : 'light';
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    renderBotShape(shape, theme).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [shape, theme]);
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden>
      {src ? <img src={src} alt="" width={size} height={size} draggable={false} className="size-full select-none object-contain" /> : null}
    </span>
  );
}
