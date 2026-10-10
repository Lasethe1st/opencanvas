import type { JSX, ReactNode } from 'react';

export function InspectorHeader(props: { name: string; tag: string; parent?: string | null; source?: string | null; onRename?: (name: string) => void; onSource?: () => void }): JSX.Element;
export function BreakpointBanner(props: { icon?: ReactNode; children?: ReactNode }): JSX.Element;
export function BoxModel(props: { margin?: ReactNode; padding?: ReactNode; size?: ReactNode }): JSX.Element;
export function BoxSlot(props: { side: 'top' | 'right' | 'bottom' | 'left'; set?: boolean; title?: string; children?: ReactNode }): JSX.Element;
export function LinkToggles(props: { marginLinked?: boolean; paddingLinked?: boolean; onMargin?: () => void; onPadding?: () => void }): JSX.Element;
export function KeyValue(props: { label: ReactNode; children?: ReactNode }): JSX.Element;
