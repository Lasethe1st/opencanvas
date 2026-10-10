import type { BreakpointConfig } from '../../shared/types';
import type { Viewport } from './store';

export function viewportSize(viewport: Viewport, bps: BreakpointConfig): { width: number; height: number | null } {
  if (viewport === 'tablet') return { width: Math.min(834, bps.tablet), height: 1112 };
  if (viewport === 'mobile') return { width: Math.min(390, bps.mobile), height: 844 };
  return { width: 1440, height: null };
}

export const VIEWPORT_LABEL: Record<Viewport, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
