import type { HTMLAttributes, JSX, ReactNode, Ref } from 'react';

export function CanvasBar(props: {
  label: ReactNode;
  zoom: ReactNode;
  onZoomOut?: () => void;
  onZoomIn?: () => void;
  onFit?: () => void;
  onActual?: () => void;
  fitActive?: boolean;
  onReload?: () => void;
}): JSX.Element;
export function Canvas(
  props: HTMLAttributes<HTMLElement> & { bar?: ReactNode; notice?: ReactNode; overlay?: ReactNode; dock?: ReactNode; stageRef?: Ref<HTMLDivElement> },
): JSX.Element;
export function CanvasFrame(props: { width: number; height: number; scale?: number; children?: ReactNode }): JSX.Element;
export function StateCard(props: { icon?: ReactNode; busy?: boolean; title: ReactNode; children?: ReactNode; actions?: ReactNode; log?: ReactNode }): JSX.Element;
