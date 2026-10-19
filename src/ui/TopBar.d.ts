import type { JSX, ReactNode } from 'react';

export type ViewportId = 'desktop' | 'tablet' | 'mobile';
export const VIEWPORTS: { id: ViewportId; label: string; icon: ReactNode }[];

export function Brand(): JSX.Element;
export function ProjectButton(props: { name: string; onClick?: () => void }): JSX.Element;
export function SaveStatus(props: { state: 'saved' | 'saving' | 'dirty' }): JSX.Element | null;
export interface Crumb {
  key?: string;
  label: ReactNode;
}
export function Breadcrumb<T extends Crumb>(props: { items: T[]; onSelect?: (item: T) => void }): JSX.Element;
export function ViewportSwitch(props: { value: ViewportId; onChange?: (id: ViewportId) => void; width: ReactNode }): JSX.Element;
export function ModeSwitch(props: { value: 'visual' | 'code'; onChange?: (id: 'visual' | 'code') => void }): JSX.Element;
export function PreviewButton(props: { onClick?: () => void }): JSX.Element;
export function PanelsButton(props: { hidden: boolean; onClick?: () => void }): JSX.Element;
export function TopBar(props: { start?: ReactNode; center?: ReactNode; end?: ReactNode }): JSX.Element;
export function Divider(): JSX.Element;
