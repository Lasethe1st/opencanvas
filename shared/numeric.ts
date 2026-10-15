/** Arithmetic and arrow-key stepping for numeric inspector fields. */

type Token = { kind: 'num'; value: number; unit: string } | { kind: 'op'; value: string };

const UNIT = '(?:px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|cm|mm|in|fr|deg|s|ms)?';
const TOKEN = new RegExp(`\\s*(?:(\\d*\\.?\\d+(?:e[+-]?\\d+)?)(${UNIT})|([-+*/()]))`, 'iy');

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < input.length) {
    if (/^\s*$/.test(input.slice(TOKEN.lastIndex))) break;
    const m = TOKEN.exec(input);
    if (!m) return null;
    if (m[1] !== undefined) tokens.push({ kind: 'num', value: Number(m[1]), unit: m[2].toLowerCase() });
    else tokens.push({ kind: 'op', value: m[3] });
  }
  return tokens;
}

/**
 * Evaluates `16/2`, `10px + 4px`, `(24 - 8) * 2rem` and similar. Returns null when the input is not a
 * pure arithmetic expression with at least one operator, or mixes units.
 */
export function evaluateExpression(input: string): string | null {
  const parsed = tokenize(input.trim());
  if (!parsed) return null;
  const tokens = parsed;
  if (tokens.length < 3 || !tokens.some((t, i) => t.kind === 'op' && t.value !== '(' && t.value !== ')' && i > 0)) return null;
  let pos = 0;
  let unit = '';
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.kind === 'op' && peek()!.value === v;

  function primary(): number {
    const t = tokens[pos++];
    if (!t) throw new Error('end');
    if (t.kind === 'num') {
      if (t.unit) {
        if (unit && unit !== t.unit) throw new Error('units');
        unit = t.unit;
      }
      return t.value;
    }
    if (t.value === '-') return -primary();
    if (t.value === '+') return primary();
    if (t.value === '(') {
      const v = sum();
      if (!isOp(')')) throw new Error('paren');
      pos++;
      return v;
    }
    throw new Error('token');
  }
  function product(): number {
    let v = primary();
    while (isOp('*') || isOp('/')) {
      const op = tokens[pos++].value;
      const r = primary();
      if (op === '/' && r === 0) throw new Error('div0');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function sum(): number {
    let v = product();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].value;
      const r = product();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  try {
    const value = sum();
    if (pos !== tokens.length || !Number.isFinite(value)) return null;
    return `${formatNumber(value)}${unit}`;
  } catch {
    return null;
  }
}

export function formatNumber(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Adds `delta` to a single number (keeping its unit); returns null for values like `auto` or `1px 2px`. */
export function stepValue(value: string, delta: number, fallbackUnit = ''): string | null {
  const v = value.trim();
  if (v === '' || v === 'auto' || v === 'normal' || v === 'none') return `${formatNumber(delta)}${delta === 0 ? '' : fallbackUnit}`;
  const m = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(v);
  if (!m) return null;
  return `${formatNumber(Number(m[1]) + delta)}${m[2]}`;
}

/** Arrow step: 1, Shift = 10, Alt = 0.1; unitless fractional properties step by tenths. */
export function stepSize(e: { shiftKey: boolean; altKey: boolean }, fine = false): number {
  const base = fine ? 0.1 : 1;
  if (e.shiftKey) return base * 10;
  if (e.altKey) return base / 10;
  return base;
}
