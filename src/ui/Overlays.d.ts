import type { ButtonHTMLAttributes, HTMLAttributes, JSX, ReactNode } from 'react';

export function Dialog(props: HTMLAttributes<HTMLDivElement> & { title: string; onClose?: () => void }): JSX.Element;
export function ExportOption(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & { icon: ReactNode; title: ReactNode }): JSX.Element;
export function Toasts(props: { toasts: { id: number; kind: 'info' | 'success' | 'error'; message: ReactNode }[] }): JSX.Element;
