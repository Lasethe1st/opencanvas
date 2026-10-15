import postcss, { type AtRule, type Root, type Rule } from 'postcss';
import type { Breakpoint, BreakpointConfig, StyleState } from '../types';

export const DEFAULT_BREAKPOINTS: BreakpointConfig = { tablet: 1024, mobile: 640, detected: false };

export function selectorFor(key: string, state: StyleState = 'default'): string {
  return `[data-oc="${key}"]${state === 'hover' ? ':hover' : ''}`;
}

function mediaParams(bp: Breakpoint, config: BreakpointConfig): string | null {
  if (bp === 'base') return null;
  return `(max-width: ${bp === 'tablet' ? config.tablet : config.mobile}px)`;
}

function normalizeParams(params: string): string {
  return params.replace(/\s+/g, '').toLowerCase();
}

function findMedia(root: Root, params: string): AtRule | null {
  let found: AtRule | null = null;
  root.each((node) => {
    if (!found && node.type === 'atrule' && node.name === 'media' && normalizeParams(node.params) === normalizeParams(params)) {
      found = node;
    }
  });
  return found;
}

function findRule(container: Root | AtRule, selector: string): Rule | null {
  let found: Rule | null = null;
  container.each((node) => {
    if (!found && node.type === 'rule' && node.selector.trim() === selector) found = node;
  });
  return found;
}

export function readElementStyles(css: string, key: string, config: BreakpointConfig, state: StyleState = 'default'): Record<Breakpoint, Record<string, string>> {
  const result: Record<Breakpoint, Record<string, string>> = { base: {}, tablet: {}, mobile: {} };
  let root: Root;
  try {
    root = postcss.parse(css);
  } catch {
    return result;
  }
  const selector = selectorFor(key, state);
  for (const bp of ['base', 'tablet', 'mobile'] as Breakpoint[]) {
    const params = mediaParams(bp, config);
    const container = params ? findMedia(root, params) : root;
    if (!container) continue;
    const rule = findRule(container, selector);
    rule?.walkDecls((decl) => {
      result[bp][decl.prop] = decl.value;
    });
  }
  return result;
}

/** Sets (or removes, when value is empty) a declaration for an element key. */
export function setElementStyle(
  css: string,
  key: string,
  bp: Breakpoint,
  prop: string,
  value: string,
  config: BreakpointConfig,
  state: StyleState = 'default',
): string {
  const root = postcss.parse(css);
  const selector = selectorFor(key, state);
  const params = mediaParams(bp, config);
  let container: Root | AtRule | null = params ? findMedia(root, params) : root;

  if (!value) {
    if (!container) return css;
    const rule = findRule(container, selector);
    if (!rule) return css;
    rule.walkDecls(prop, (decl) => {
      decl.remove();
    });
    if (rule.nodes.length === 0) rule.remove();
    if (container.type === 'atrule' && (container.nodes?.length ?? 0) === 0) container.remove();
    return root.toString();
  }

  if (!container) {
    const media = postcss.atRule({ name: 'media', params: params! });
    media.raws.before = root.nodes.length ? '\n\n' : '';
    media.raws.between = ' ';
    media.raws.after = '\n';
    if (bp === 'tablet') {
      const mobileMedia = findMedia(root, mediaParams('mobile', config)!);
      if (mobileMedia) mobileMedia.before(media);
      else root.append(media);
    } else {
      root.append(media);
    }
    container = media;
  }

  let rule = findRule(container, selector);
  if (!rule) {
    const inMedia = container.type === 'atrule';
    rule = postcss.rule({ selector });
    rule.raws.before = inMedia ? '\n  ' : root.nodes.length ? '\n\n' : '';
    rule.raws.between = ' ';
    rule.raws.after = inMedia ? '\n  ' : '\n';
    rule.raws.semicolon = true;
    if (inMedia) {
      container.append(rule);
    } else {
      let firstMedia: AtRule | null = null;
      root.each((node) => {
        if (!firstMedia && node.type === 'atrule' && node.name === 'media') firstMedia = node;
      });
      if (firstMedia) (firstMedia as AtRule).before(rule);
      else root.append(rule);
    }
  }

  const indent = container.type === 'atrule' ? '\n    ' : '\n  ';
  let updated = false;
  rule.walkDecls(prop, (decl) => {
    if (!updated) {
      decl.value = value;
      updated = true;
    } else {
      decl.remove();
    }
  });
  if (!updated) {
    const decl = postcss.decl({ prop, value });
    decl.raws.before = indent;
    decl.raws.between = ': ';
    rule.append(decl);
  }
  rule.raws.semicolon = true;
  return root.toString();
}

/** Copies every rule for `from` (base and media queries) to `to`, right after the original. */
export function copyElementStyles(css: string, from: string, to: string): string {
  const root = postcss.parse(css);
  const states: StyleState[] = ['default', 'hover'];
  let copied = false;
  root.walkRules((rule) => {
    const state = states.find((s) => rule.selector.trim() === selectorFor(from, s));
    if (!state) return;
    rule.after(rule.clone({ selector: selectorFor(to, state) }));
    copied = true;
  });
  return copied ? root.toString() : css;
}

/** Picks the project's own max-width breakpoints when they look like tablet/mobile sizes. */
export function detectBreakpoints(cssSources: string[]): BreakpointConfig {
  const widths = new Set<number>();
  for (const css of cssSources) {
    for (const match of css.matchAll(/@media[^{]*max-width\s*:\s*(\d+)px/g)) widths.add(Number(match[1]));
  }
  const pick = (min: number, max: number, target: number) =>
    [...widths].filter((w) => w >= min && w <= max).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
  const tablet = pick(700, 1199, 1024);
  const mobile = pick(400, 699, 640);
  if (!tablet && !mobile) return DEFAULT_BREAKPOINTS;
  return { tablet: tablet ?? DEFAULT_BREAKPOINTS.tablet, mobile: mobile ?? DEFAULT_BREAKPOINTS.mobile, detected: true };
}
