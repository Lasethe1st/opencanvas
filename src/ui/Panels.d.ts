import type { HTMLAttributes, JSX, PointerEventHandler, ReactNode } from 'react';

export function Panel(props: HTMLAttributes<HTMLElement> & { side: 'left' | 'right'; width?: number; head?: ReactNode; resizer?: ReactNode; onCollapse?: () => void }): JSX.Element;
export function PanelTitle(props: { children?: ReactNode }): JSX.Element;
export function Rail(props: { side: 'left' | 'right'; children?: ReactNode }): JSX.Element;
export function SearchField(props: { value?: string; onChange?: (value: string) => void; placeholder?: string }): JSX.Element;
export function Tree(props: { children?: ReactNode }): JSX.Element;
export function TreeRow(
  props: Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
    depth?: number;
    icon?: ReactNode;
    name?: ReactNode;
    meta?: ReactNode;
    active?: boolean;
    hovered?: boolean;
    expandable?: boolean;
    expanded?: boolean;
    onToggle?: () => void;
    actions?: ReactNode;
    trailing?: ReactNode;
    children?: ReactNode;
    'data-uid'?: string;
  },
): JSX.Element;
export function Resizer(props: { onPointerDown?: PointerEventHandler<HTMLDivElement>; dragging?: boolean }): JSX.Element;
