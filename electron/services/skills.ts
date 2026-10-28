import fs from 'node:fs';
import path from 'node:path';
import type { SkillMeta } from '../../shared/types';

const README = `# OpenCanvas skills

Put a skill here and type "/" in the home chat box to call it.

A skill is one of:

- a folder with a file named SKILL.md inside it   (my-skill/SKILL.md)
- a single Markdown file                           (my-skill.md)

Start the file with a short header so it shows up with a description:

---
name: Write release notes
description: Turn a list of changes into friendly release notes
---

Then write the instructions the AI should follow when the skill is used.
`;

const MAX_BODY = 20_000;

/** Creates the skills folder (and a README that explains the format) the first time it's needed. */
export function ensureSkillsDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const readme = path.join(dir, 'README.md');
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, README);
  return dir;
}

function parse(raw: string, fallback: string): { name: string; description: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  const head = m?.[1] ?? '';
  const field = (key: string) => new RegExp(`^${key}:\\s*(.+)$`, 'mi').exec(head)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  return { name: field('name') || fallback, description: field('description'), body: (m ? raw.slice(m[0].length) : raw).trim() };
}

export function listSkills(dir: string): SkillMeta[] {
  ensureSkillsDir(dir);
  const out: SkillMeta[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    let rel: string | null = null;
    let fallback = '';
    if (entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'SKILL.md'))) {
      rel = `${entry.name}/SKILL.md`;
      fallback = entry.name;
    } else if (entry.isFile() && /\.md$/i.test(entry.name) && entry.name.toLowerCase() !== 'readme.md') {
      rel = entry.name;
      fallback = entry.name.replace(/\.md$/i, '');
    }
    if (!rel) continue;
    try {
      const { name, description } = parse(fs.readFileSync(path.join(dir, rel), 'utf8'), fallback);
      out.push({ id: rel, name, description });
    } catch {
      /* unreadable file: skip it */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The skill's instructions without its header. Refuses paths outside the skills folder. */
export function readSkill(dir: string, id: string): string {
  const root = path.resolve(dir);
  const file = path.resolve(root, id);
  if (file !== root && !file.startsWith(root + path.sep)) throw new Error('That skill is outside the skills folder.');
  const { body } = parse(fs.readFileSync(file, 'utf8'), '');
  return body.slice(0, MAX_BODY);
}
