import type { HTMLAttributes, JSX, ReactNode } from 'react';

export function CodeView(props: HTMLAttributes<HTMLElement> & { tabs?: ReactNode; actions?: ReactNode; editor?: ReactNode; status?: ReactNode }): JSX.Element;
export function CodeTab(props: { name: string; title: string; active?: boolean; dirty?: boolean; onSelect?: () => void; onClose?: () => void }): JSX.Element;
