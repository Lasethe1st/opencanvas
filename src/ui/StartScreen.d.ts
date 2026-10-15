import type { ButtonHTMLAttributes, ForwardRefExoticComponent, InputHTMLAttributes, JSX, ReactNode, RefAttributes } from 'react';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'>;
type TitledButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export function StartScreen(props: { corner?: ReactNode; search?: ReactNode; actions?: ReactNode; recent?: ReactNode; children?: ReactNode }): JSX.Element;
export const SearchPill: ForwardRefExoticComponent<InputHTMLAttributes<HTMLInputElement> & { hint?: ReactNode } & RefAttributes<HTMLInputElement>>;
export function ActionPill(props: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; tone?: 'blue' | 'violet' | 'green' | 'amber' }): JSX.Element;
export function GithubMark(props: { size?: number }): JSX.Element;
export function RecentList(props: { title: ReactNode; empty?: ReactNode; children?: ReactNode }): JSX.Element;
export function ProjectIcon(props: { src?: string | null; name: string }): JSX.Element;
export function RecentItem(props: TitledButtonProps & { icon?: ReactNode; name: ReactNode; path: ReactNode; meta?: ReactNode; active?: boolean }): JSX.Element;
export function TemplateGrid(props: { children?: ReactNode }): JSX.Element;
export function TemplateCard(props: ButtonProps & { art: ReactNode; name: ReactNode; description: ReactNode; selected?: boolean }): JSX.Element;
export function TemplateArt(props: { id: string }): JSX.Element;
