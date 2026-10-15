import type { ComponentType, HTMLAttributes, JSX, ReactNode } from 'react';

export function FrameRow(
  props: HTMLAttributes<HTMLDivElement> & {
    name: ReactNode;
    size?: ReactNode;
    scope?: 'base' | 'tablet' | 'mobile';
    scopeLabel?: ReactNode;
    meta?: ReactNode;
    icon?: ComponentType<{ size?: number; className?: string }>;
    active?: boolean;
    actions?: ReactNode;
    children?: ReactNode;
  },
): JSX.Element;
