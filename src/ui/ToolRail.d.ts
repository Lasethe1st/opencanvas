import type { ButtonHTMLAttributes, JSX, ReactNode, Ref } from 'react';

export function ToolRails(props: { children?: ReactNode }): JSX.Element;
export function ToolRail(props: { children?: ReactNode; label?: string }): JSX.Element;
export const ToolButton: (props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  shortcut?: string;
  active?: boolean;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) => JSX.Element;
export function ToolGroup(props: { children?: ReactNode }): JSX.Element;
export function ToolSeparator(): JSX.Element;
export function ToolFlyout(props: { title?: ReactNode; children?: ReactNode; anchor?: HTMLElement | null }): JSX.Element;
