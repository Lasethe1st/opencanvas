import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, JSX, ReactNode, Ref } from 'react';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { children?: ReactNode; ref?: Ref<HTMLButtonElement> };

export function Button(props: ButtonProps & { variant?: 'default' | 'primary' | 'ghost' | 'danger'; size?: 'sm'; icon?: ReactNode }): JSX.Element;
export function IconButton(props: ButtonProps & { label: string; tipSide?: 'top'; active?: boolean; size?: 'sm' }): JSX.Element;

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  text?: ReactNode;
  icon?: ReactNode;
}
export function Segmented<T extends string>(props: {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (id: T) => void;
  /** Unique Motion layout id so multiple segmented controls don’t share one pill. Defaults to the aria label. */
  layoutId?: string;
}): JSX.Element;

export function Badge(props: { tone?: 'busy' | 'warning'; children?: ReactNode }): JSX.Element;
export function Section(props: { title: string; icon?: ReactNode; open?: boolean; onToggle?: () => void; children?: ReactNode }): JSX.Element;
export function Field(props: { label: ReactNode; state?: 'set' | 'inherited' | 'computed'; children?: ReactNode }): JSX.Element;
export function InputShell(props: { inherited?: boolean; prefix?: ReactNode; onReset?: () => void; children?: ReactNode }): JSX.Element;
export function SelectShell(props: { inherited?: boolean; onReset?: () => void; children?: ReactNode }): JSX.Element;
export function Swatch(props: { color?: string; children?: ReactNode }): JSX.Element;
export function ToggleRow<T extends string>(props: { options: { value: T; title: string; icon?: ReactNode; text?: string }[]; value?: T; onChange?: (value: T) => void }): JSX.Element;
export function SectionLabel(props: { children?: ReactNode; actions?: ReactNode }): JSX.Element;
export function Notice(props: { tone?: 'info'; icon?: ReactNode; children?: ReactNode; action?: ReactNode }): JSX.Element;
export function Menu(props: HTMLAttributes<HTMLDivElement> & { style?: CSSProperties }): JSX.Element;
export function MenuItem(props: ButtonProps & { icon?: ReactNode; hint?: ReactNode }): JSX.Element;
export function Spinner(): JSX.Element;
export function cx(...parts: unknown[]): string;
