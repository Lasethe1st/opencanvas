import type { HTMLAttributes, JSX, ReactNode } from 'react';

export function FrameRow(
  props: HTMLAttributes<HTMLDivElement> & {
    name: ReactNode;
    size: ReactNode;
    scope: 'base' | 'tablet' | 'mobile';
    scopeLabel: ReactNode;
    active?: boolean;
    actions?: ReactNode;
    children?: ReactNode;
  },
): JSX.Element;
