import type { AuditIssue, AuditReport } from '../../../shared/types';

const FRAMES = [
  { name: 'Desktop', width: 1440 },
  { name: 'Tablet', width: 834 },
  { name: 'Mobile', width: 390 },
];
const ALL = FRAMES.map((f) => f.name);
const minutesAgo = (m: number) => Date.now() - m * 60_000;

const issue = (i: Omit<AuditIssue, 'key' | 'id' | 'name' | 'frames'> & Partial<AuditIssue>): AuditIssue => ({
  key: `${i.rule}:${i.id ?? i.title}`,
  id: null,
  name: null,
  frames: ALL,
  ...i,
});

const viewport = issue({
  rule: 'viewport-meta',
  severity: 'error',
  category: 'layout',
  title: 'Page has no viewport meta tag',
  detail: 'Phones render the page at 980px wide and zoom out, so text looks tiny.',
  fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to index.html.',
});

const TYPICAL: AuditIssue[] = [
  issue({
    rule: 'runtime-error',
    severity: 'error',
    category: 'errors',
    title: 'TypeError in CaseStudyGrid',
    detail: "TypeError: Cannot read properties of undefined (reading 'map')\n    at CaseStudyGrid (src/components/CaseStudyGrid.jsx:18:22)",
    fix: 'Default the projects prop to an empty array, or wait for the data before rendering the grid.',
    id: 'src/components/CaseStudyGrid.jsx:16:4',
    name: 'Case studies',
  }),
  viewport,
  issue({
    rule: 'horizontal-overflow',
    severity: 'error',
    category: 'layout',
    title: 'Content is wider than the screen',
    detail: 'The logo strip is 612px wide on a 390px screen, so the page scrolls sideways.',
    fix: 'Let the logos wrap with flex-wrap: wrap, or give the strip overflow-x: auto.',
    id: 'src/components/ClientLogos.jsx:9:6',
    name: 'Client logos',
    frames: ['Mobile'],
  }),
  issue({
    rule: 'broken-link',
    severity: 'warning',
    category: 'links',
    title: 'Link goes to a section that does not exist',
    detail: 'href="#careers" but no element has id="careers".',
    fix: 'Add id="careers" to the careers section, or point the link at an existing section.',
    id: 'src/components/Footer.jsx:22:10',
    name: 'Careers',
  }),
  issue({
    rule: 'contrast',
    severity: 'warning',
    category: 'a11y',
    title: 'Text is hard to read: 3.0:1 contrast',
    detail: '#9a9aa2 on #ffffff. Body text needs at least 4.5:1.',
    fix: 'Darken the text to #6b6b74 or darker.',
    id: 'src/components/Hero.jsx:5:8',
    name: 'Eyebrow',
  }),
  issue({
    rule: 'img-alt',
    severity: 'warning',
    category: 'a11y',
    title: 'Image has no alt text',
    fix: 'Describe the image in an alt attribute, or use alt="" if it is decorative.',
    id: 'src/components/Team.jsx:31:12',
    name: 'Portrait of Maya Okafor',
  }),
  issue({
    rule: 'meta-description',
    severity: 'info',
    category: 'seo',
    title: 'Page has no description',
    fix: 'Add <meta name="description" content="…"> with one or two sentences about the agency.',
  }),
];

const LONG: AuditIssue[] = [
  ...TYPICAL,
  ...['Studio', 'Services', 'Work', 'Process', 'Awards', 'Journal', 'Contact', 'Newsletter'].map((name, i) =>
    issue({
      rule: 'tap-target',
      severity: 'warning',
      category: 'a11y',
      title: 'Tap target is smaller than 24 × 24px',
      detail: `The ${name} link is 18px tall on touch screens.`,
      fix: 'Add vertical padding so the link is at least 24px tall.',
      id: `src/components/Nav.jsx:${12 + i}:8`,
      name,
      frames: ['Tablet', 'Mobile'],
    }),
  ),
  ...['hero-reel.mp4', 'office.jpg', 'brand-film.mp4', 'team-offsite.jpg', 'award-night.jpg'].map((file, i) =>
    issue({
      rule: 'missing-asset',
      severity: 'error',
      category: 'links',
      title: 'File not found',
      detail: `/media/${file} returned 404.`,
      fix: `Add ${file} to public/media, or update the path.`,
      id: `src/components/Gallery.jsx:${40 + i * 3}:10`,
      name: file,
    }),
  ),
  issue({ rule: 'html-lang', severity: 'info', category: 'seo', title: 'Page language is not set', fix: 'Add lang="en" to the <html> tag in index.html.' }),
  issue({ rule: 'favicon', severity: 'info', category: 'seo', title: 'Site has no favicon', fix: 'Add a favicon to public and link it from index.html.' }),
  issue({ rule: 'title', severity: 'warning', category: 'seo', title: 'Page has no title', fix: 'Add a <title> to index.html, such as "Northbound — Creative agency".' }),
];

const report = (issues: AuditIssue[], minutes = 2): AuditReport => ({ at: minutesAgo(minutes), frames: FRAMES, issues });

export interface StateFixture {
  label: string;
  running: boolean;
  audit: AuditReport | null;
}

export const GROUPS: { heading: string; states: Record<string, StateFixture> }[] = [
  {
    heading: 'Check',
    states: {
      'not-run': { label: 'Not run yet', running: false, audit: null },
      checking: { label: 'First check running', running: true, audit: null },
      rechecking: { label: 'Re-checking', running: true, audit: report(TYPICAL, 12) },
    },
  },
  {
    heading: 'Results',
    states: {
      clean: { label: 'No problems', running: false, audit: report([]) },
      'one-issue': { label: 'One issue', running: false, audit: report([viewport]) },
      typical: { label: 'Typical site', running: false, audit: report(TYPICAL) },
      long: { label: 'Long list', running: false, audit: report(LONG) },
    },
  },
  {
    heading: 'Project',
    states: {
      'preview-down': {
        label: 'Preview not running',
        running: false,
        audit: report([
          issue({
            rule: 'no-preview',
            severity: 'error',
            category: 'project',
            title: 'The preview is not running',
            detail: 'Error: Cannot find module "framer-motion" imported from src/components/Hero.jsx',
            fix: 'Install the missing package with npm install framer-motion, then restart the preview.',
            frames: [],
          }),
        ]),
      },
    },
  },
];

export const STATE_KEYS = GROUPS.flatMap((g) => Object.keys(g.states));
export const STATES: Record<string, StateFixture> = Object.assign({}, ...GROUPS.map((g) => g.states));
