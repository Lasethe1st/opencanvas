import type { JSX, ReactNode } from 'react';

export function Dock(props: { children?: ReactNode }): JSX.Element;
export function DockSeparator(): JSX.Element;
export function DockContext(props: { verb: ReactNode; target?: ReactNode }): JSX.Element;
