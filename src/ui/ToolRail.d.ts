import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

export function ToolRail(props: { children?: ReactNode }): JSX.Element;
export function ToolButton(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { label: string; shortcut?: string; active?: boolean; children?: ReactNode }): JSX.Element;
export function ToolGroup(props: { children?: ReactNode }): JSX.Element;
export function ToolSeparator(): JSX.Element;
export function ToolFlyout(props: { title?: ReactNode; children?: ReactNode }): JSX.Element;
