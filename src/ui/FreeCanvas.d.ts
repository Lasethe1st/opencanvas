import type { HTMLAttributes, JSX, PointerEvent, ReactNode, Ref } from 'react';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function Stage(
  props: HTMLAttributes<HTMLElement> & {
    stageRef?: Ref<HTMLDivElement>;
    camera: { x: number; y: number; zoom: number };
    dots: number;
    tool: 'select' | 'hand';
    panning?: boolean;
    world?: ReactNode;
    chrome?: ReactNode;
    overlay?: ReactNode;
    notice?: ReactNode;
    nav?: ReactNode;
    dock?: ReactNode;
  },
): JSX.Element;

export function WorldFrame(props: Box & { active?: boolean; shadow?: boolean; children?: ReactNode }): JSX.Element;

export type ResizeEdge = 'e' | 's' | 'se';

export function FrameChrome(props: {
  rect: Box;
  name: ReactNode;
  size: ReactNode;
  scope: ReactNode;
  active?: boolean;
  fitPage?: boolean;
  onActivate?: () => void;
  onDragStart?: (e: PointerEvent<HTMLDivElement>) => void;
  onRename?: () => void;
  onResizeStart?: (e: PointerEvent<HTMLDivElement>, edge: ResizeEdge) => void;
  menuOpen?: boolean;
  onMenu?: () => void;
  menu?: ReactNode;
}): JSX.Element;

export function FrameRename(props: { value: string; onCommit: (value: string) => void; onCancel: () => void }): JSX.Element;

export function Guides(props: { lines: { axis: 'x' | 'y'; at: number; from: number; to: number }[] }): JSX.Element;
export function SizeTip(props: { x: number; y: number; children?: ReactNode }): JSX.Element;
export function SelectionBar(props: { x: number; y: number; below?: boolean; children?: ReactNode }): JSX.Element;

export function Minimap(props: {
  frames: (Box & { id: string; active?: boolean })[];
  view: Box;
  width?: number;
  height?: number;
  onNavigate?: (world: { x: number; y: number }) => void;
}): JSX.Element;

export function CanvasNav(props: {
  zoom: ReactNode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFitAll: () => void;
  onFitSelection: () => void;
  syncScroll: boolean;
  onSyncScroll: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  minimap?: ReactNode;
  minimapOpen: boolean;
  onToggleMinimap: () => void;
}): JSX.Element;
