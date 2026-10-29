import type { SVGProps } from 'react';

/** The OpenCanvas mark: a solid tall rectangle for the O beside a bold tall rectangle with its right side cut away for the C. Takes its colour from the text colour. */
export function LogoMark({ size = 20, ...rest }: { size?: number } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  return (
    <svg viewBox="0 0 32 28" width={size} height={(size * 28) / 32} fill="currentColor" role="img" aria-label="OpenCanvas" {...rest}>
      <path d="M0 0h14v28H0V0Z" />
      <path d="M18 0h14v6H24.5v16H32v6H18V0Z" />
    </svg>
  );
}
