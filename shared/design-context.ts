/** Plain-text design brief built from the project's direction. Shared by the prompt hand-off and the MCP tools. */
import { REFERENCE_ROLES, type DirectionConfig, type PageConfig, type VisualStyle } from './project-config';

function lean(v: number, low: string, high: string): string | null {
  if (v < 0.4) return v < 0.2 ? `very ${low}` : low;
  if (v > 0.6) return v > 0.8 ? `very ${high}` : high;
  return null;
}

/** "Minimal and professional", "Very expressive", or "Balanced". */
export function describeStyle({ minimalExpressive: x, casualProfessional: y }: VisualStyle): string {
  const parts = [lean(x, 'minimal', 'expressive'), lean(y, 'casual', 'professional')].filter(Boolean);
  return parts.length ? parts.join(' and ').replace(/^\w/, (c) => c.toUpperCase()) : 'Balanced';
}

const STYLE_GUIDANCE: [keyof VisualStyle, string, string][] = [
  ['minimalExpressive', 'Restrained: generous whitespace, few colours, quiet type, little decoration.', 'Expressive: bold type scale, confident colour, distinctive shapes and imagery.'],
  ['casualProfessional', 'Casual: friendly copy, rounder shapes, relaxed rhythm.', 'Professional: precise grid, measured copy, crisp shapes, clear hierarchy.'],
];

const MAX_TOKENS_IN_BRIEF = 80;

export interface DesignContextOptions {
  projectName?: string;
  pages?: PageConfig[];
  /** What the user asked for, if anything. */
  request?: string;
}

export function buildDesignContext(direction: DirectionConfig, options: DesignContextOptions = {}): string {
  const { visualStyle: vs, font, iconPack, references, designSystem } = direction;
  const lines: string[] = [];
  lines.push(`# Design direction${options.projectName ? ` for ${options.projectName}` : ''}`);
  lines.push('');
  lines.push(`Visual style: ${describeStyle(vs)} (minimal→expressive ${vs.minimalExpressive.toFixed(2)}, casual→professional ${vs.casualProfessional.toFixed(2)}, each 0–1).`);
  for (const [key, low, high] of STYLE_GUIDANCE) {
    const v = vs[key];
    if (v < 0.4) lines.push(`- ${low}`);
    else if (v > 0.6) lines.push(`- ${high}`);
  }
  lines.push(`Typeface: ${font ? `${font} (load it from Google Fonts if it isn't installed)` : 'no preference; pick one that fits the style'}.`);
  lines.push(`Icons: ${iconPack === 'phosphor' ? 'Phosphor (@phosphor-icons/react)' : 'Lucide (lucide-react)'}.`);

  if (designSystem) {
    const entries = Object.entries(designSystem.tokens);
    lines.push('');
    lines.push(`## Design system (${designSystem.file}, ${entries.length} tokens)`);
    lines.push('Use these tokens instead of new values where they fit.');
    for (const [k, v] of entries.slice(0, MAX_TOKENS_IN_BRIEF)) lines.push(`- ${k}: ${v}`);
    if (entries.length > MAX_TOKENS_IN_BRIEF) lines.push(`- …and ${entries.length - MAX_TOKENS_IN_BRIEF} more`);
  }

  if (references.length) {
    lines.push('');
    lines.push('## References');
    const ordered = [...references].sort((a, b) => Number(b.primary) - Number(a.primary));
    for (const r of ordered) {
      const role = REFERENCE_ROLES.find((x) => x.id === r.role)?.label ?? r.role;
      const where = r.url ?? r.imagePath ?? '';
      const bits = [`${r.primary ? '[primary] ' : ''}${r.title}`, `take: ${role.toLowerCase()}`, where];
      if (r.note) bits.push(`note: ${r.note}`);
      if (r.colors.length) bits.push(`colours: ${r.colors.join(' ')}`);
      lines.push(`- ${bits.filter(Boolean).join(' · ')}`);
    }
    if (references.some((r) => r.imagePath)) lines.push('Uploaded images are in the project under .opencanvas/references/.');
  }

  if (options.pages?.length) {
    lines.push('');
    lines.push('## Pages');
    for (const p of options.pages) lines.push(`- ${p.name}: ${p.path}${p.file ? ` (${p.file})` : ''}`);
  }

  if (options.request?.trim()) {
    lines.push('');
    lines.push('## Request');
    lines.push(options.request.trim());
  }
  return lines.join('\n');
}
