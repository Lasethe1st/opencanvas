import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'>;

export function StartScreen(props: { themeMenu?: ReactNode; options?: ReactNode; templates?: ReactNode; createBar?: ReactNode; recent?: ReactNode }): JSX.Element;
export const START_ICONS: Record<'blank' | 'template' | 'open', ReactNode>;
export function StartOption(props: ButtonProps & { icon: ReactNode; title: ReactNode; children?: ReactNode; selected?: boolean }): JSX.Element;
export function TemplateGrid(props: { title: ReactNode; children?: ReactNode }): JSX.Element;
export function TemplateCard(props: ButtonProps & { art: ReactNode; name: ReactNode; description: ReactNode; selected?: boolean }): JSX.Element;
export function CreateBar(props: { input: ReactNode; button: ReactNode; where: ReactNode }): JSX.Element;
export function RecentList(props: { children?: ReactNode }): JSX.Element;
export function RecentItem(props: ButtonProps & { icon?: ReactNode; name: ReactNode; path: ReactNode }): JSX.Element;
export function TemplateArt(props: { id: string }): JSX.Element;
