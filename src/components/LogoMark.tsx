import type { SVGProps } from 'react';

/** The OpenCanvas mark: a tall rectangle for the O beside a tall rectangle with its right side cut away for the C. Takes its colour from the text colour. */
export function LogoMark({ size = 20, ...rest }: { size?: number } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  return (
    <svg viewBox="0 0 32 28" width={size} height={(size * 28) / 32} fill="currentColor" role="img" aria-label="OpenCanvas" {...rest}>
      <path fillRule="evenodd" d="M0 0h14v28H0V0Zm4 4v20h6V4H4Z" />
      <path d="M18 0h14v4H22v20h10v4H18V0Z" />
    </svg>
  );
}
