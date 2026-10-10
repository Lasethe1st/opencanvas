import type { Breakpoint } from '../../../shared/types';
import { useActiveBreakpoint, useStore } from '../../lib/store';

export type ValueState = 'set' | 'inherited' | 'computed';

export interface StyleValue {
  value: string;
  state: ValueState;
  from?: Breakpoint;
}

const CHAIN: Record<Breakpoint, Breakpoint[]> = {
  base: ['base'],
  tablet: ['tablet', 'base'],
  mobile: ['mobile', 'tablet', 'base'],
};

const COMPUTED_ALIAS: Record<string, string> = {
  'border-color': 'border-top-color',
  'border-width': 'border-top-width',
  'border-style': 'border-top-style',
  'text-decoration': 'text-decoration-line',
  background: 'background-color',
};

export const BREAKPOINT_LABEL: Record<Breakpoint, string> = { base: 'Base', tablet: 'Tablet', mobile: 'Mobile' };

export function useStyleValue(prop: string): StyleValue {
  const sourceInfo = useStore((s) => s.sourceInfo);
  const computed = useStore((s) => s.selection?.computed);
  const bp = useActiveBreakpoint();
  if (sourceInfo) {
    for (const level of CHAIN[bp]) {
      const value = sourceInfo.styles[level][prop];
      if (value !== undefined) return { value, state: level === bp ? 'set' : 'inherited', from: level };
    }
  }
  return { value: computed?.[COMPUTED_ALIAS[prop] ?? prop] ?? '', state: 'computed' };
}

const UNITLESS = new Set(['opacity', 'font-weight', 'line-height', 'z-index', 'flex-grow', 'flex-shrink', 'order']);

/** Adds `px` to bare numbers for length properties. */
export function normalizeValue(prop: string, raw: string): string {
  const value = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(value) && !UNITLESS.has(prop) && value !== '0') return `${value}px`;
  return value;
}

export function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map((c) => c + c).join('')}`;
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
  if (!match) return '#000000';
  return `#${match.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

export function shortValue(value: string): string {
  return value.replace(/rgba\(0, 0, 0, 0\)/, 'transparent');
}
