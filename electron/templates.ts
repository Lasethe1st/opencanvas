import type { TemplateId, TemplateMeta } from '../shared/types';

export const TEMPLATES: TemplateMeta[] = [
  { id: 'blank', name: 'Blank', description: 'An empty page with a minimal React + Vite setup.' },
  { id: 'landing', name: 'Landing page', description: 'Header, hero, feature grid and footer split into components.' },
  { id: 'portfolio', name: 'Portfolio', description: 'Personal intro, selected work and contact section.' },
  { id: 'dashboard', name: 'Dashboard', description: 'Sidebar navigation, stat cards and an activity table.' },
  { id: 'marketing', name: 'Marketing site', description: 'Product announcement with pricing tiers and FAQ.' },
];

export interface DependencyVersions {
  react: string;
  reactDom: string;
  vite: string;
  pluginReact: string;
}

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <rect width="640" height="400" fill="#eceef1"/>
  <path d="M250 250l60-70 45 50 30-30 55 50z" fill="#c4c9d1"/>
  <circle cx="400" cy="160" r="22" fill="#c4c9d1"/>
</svg>
`;

const BASE_CSS = `*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #16181d;
  background: #ffffff;
  -webkit-font-smoothing: antialiased;
}

img {
  max-width: 100%;
}
`;

const CANVAS_CSS = `/* Styles written by visual edits. Plain CSS: safe to edit by hand. */
`;

function baseFiles(slug: string, title: string, v: DependencyVersions): Record<string, string> {
  return {
    'package.json': JSON.stringify(
      {
        name: slug,
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: `^${v.react}`, 'react-dom': `^${v.reactDom}` },
        devDependencies: { '@vitejs/plugin-react': `^${v.pluginReact}`, vite: `^${v.vite}` },
      },
      null,
      2,
    ) + '\n',
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
    'vite.config.js': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
    'src/main.jsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './open-canvas.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
    'src/open-canvas.css': CANVAS_CSS,
    'public/placeholder.svg': PLACEHOLDER_SVG,
    '.gitignore': 'node_modules\ndist\n.vite\n.opencanvas/variants\n',
    'README.md': `# ${title}

A React + Vite project created with OpenCanvas.

## Run locally

\`\`\`bash
npm install
npm run dev
\`\`\`

## Build for production

\`\`\`bash
npm run build
npm run preview
\`\`\`

Visual edits are stored as plain CSS in \`src/open-canvas.css\`, keyed by
\`data-oc\` attributes on elements. Nothing in this project depends on Open Canvas.
`,
  };
}

const BLANK: Record<string, string> = {
  'src/App.jsx': `export default function App() {
  return (
    <main className="page" data-oc-name="Page">
    </main>
  );
}
`,
  'src/index.css': `${BASE_CSS}
.page {
  min-height: 100vh;
  padding: 32px;
}
`,
};

const LANDING: Record<string, string> = {
  'src/App.jsx': `import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import Features from './components/Features.jsx';

export default function App() {
  return (
    <div className="page" data-oc-name="Page">
      <Header />
      <main data-oc-name="Main">
        <Hero />
        <Features />
      </main>
      <footer className="footer" data-oc-name="Footer">
        <p>© 2026 Northstar Studio. All rights reserved.</p>
      </footer>
    </div>
  );
}
`,
  'src/components/Header.jsx': `export default function Header() {
  return (
    <header className="header" data-oc-name="Header">
      <a className="logo" href="/" data-oc-name="Logo">Northstar</a>
      <nav className="nav" data-oc-name="Navigation">
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#about">About</a>
      </nav>
      <a className="button button--small" href="#start">Get started</a>
    </header>
  );
}
`,
  'src/components/Hero.jsx': `export default function Hero() {
  return (
    <section className="hero" data-oc-name="Hero">
      <span className="eyebrow">New · Version 2.0</span>
      <h1 className="hero__title" data-oc-name="Heading">Ship beautiful products, faster.</h1>
      <p className="hero__lead" data-oc-name="Paragraph">
        Northstar gives small teams a calm, focused workspace to plan, design and launch.
      </p>
      <div className="hero__actions">
        <a className="button" href="#start" data-oc-name="CTA">Start free trial</a>
        <a className="button button--ghost" href="#demo">Watch demo</a>
      </div>
    </section>
  );
}
`,
  'src/components/Features.jsx': `const FEATURES = [
  { title: 'Plan', body: 'Roadmaps that stay in sync with the work.' },
  { title: 'Design', body: 'Share ideas early with live, editable mockups.' },
  { title: 'Launch', body: 'Release checklists and status pages built in.' },
];

export default function Features() {
  return (
    <section className="features" id="features" data-oc-name="Features">
      <h2>Everything in one place</h2>
      <div className="features__grid">
        {FEATURES.map((feature) => (
          <article className="card" key={feature.title}>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
`,
  'src/index.css': `${BASE_CSS}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 48px;
  border-bottom: 1px solid #ececf0;
}

.logo {
  font-weight: 700;
  font-size: 18px;
  color: inherit;
  text-decoration: none;
}

.nav {
  display: flex;
  gap: 28px;
}

.nav a {
  color: #5b606b;
  text-decoration: none;
  font-size: 14px;
}

.button {
  display: inline-block;
  padding: 12px 20px;
  border-radius: 10px;
  background: #16181d;
  color: #ffffff;
  font-weight: 600;
  font-size: 15px;
  text-decoration: none;
}

.button--small {
  padding: 8px 14px;
  font-size: 14px;
}

.button--ghost {
  background: transparent;
  color: #16181d;
  border: 1px solid #d9dbe1;
}

.hero {
  max-width: 880px;
  margin: 0 auto;
  padding: 96px 32px 72px;
  text-align: center;
}

.eyebrow {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 999px;
  background: #f1f2f5;
  font-size: 13px;
  color: #5b606b;
}

.hero__title {
  margin: 20px 0 16px;
  font-size: 56px;
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.hero__lead {
  margin: 0 auto 32px;
  max-width: 560px;
  font-size: 19px;
  line-height: 1.6;
  color: #5b606b;
}

.hero__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.features {
  max-width: 1080px;
  margin: 0 auto;
  padding: 48px 32px 96px;
}

.features h2 {
  text-align: center;
  font-size: 32px;
  margin: 0 0 40px;
}

.features__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.card {
  padding: 24px;
  border: 1px solid #ececf0;
  border-radius: 14px;
}

.card h3 {
  margin: 0 0 8px;
}

.card p {
  margin: 0;
  color: #5b606b;
  line-height: 1.55;
}

.footer {
  padding: 32px 48px;
  border-top: 1px solid #ececf0;
  color: #8a8f99;
  font-size: 14px;
}

@media (max-width: 1024px) {
  .features__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .header {
    padding: 16px 20px;
  }

  .nav {
    display: none;
  }

  .hero__title {
    font-size: 38px;
  }

  .features__grid {
    grid-template-columns: 1fr;
  }
}
`,
};

const PORTFOLIO: Record<string, string> = {
  'src/App.jsx': `const WORK = [
  { title: 'Atlas Banking', role: 'Product design', year: '2026' },
  { title: 'Fieldnotes', role: 'Brand & web', year: '2025' },
  { title: 'Kiln Studio', role: 'Design system', year: '2024' },
  { title: 'Orbit Maps', role: 'iOS app', year: '2024' },
];

export default function App() {
  return (
    <main className="portfolio" data-oc-name="Page">
      <header className="intro" data-oc-name="Intro">
        <p className="intro__name">Maya Chen</p>
        <h1 className="intro__title">Designer crafting clear, quiet interfaces for ambitious products.</h1>
        <p className="intro__meta">Currently independent · Based in Lisbon</p>
      </header>
      <section className="work" data-oc-name="Selected work">
        <h2>Selected work</h2>
        <div className="work__grid">
          {WORK.map((item) => (
            <article className="work__item" key={item.title}>
              <img src="/placeholder.svg" alt={item.title} />
              <h3>{item.title}</h3>
              <p>{item.role} · {item.year}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="contact" data-oc-name="Contact">
        <h2>Let's work together</h2>
        <a className="contact__link" href="mailto:hello@example.com">hello@example.com</a>
      </section>
    </main>
  );
}
`,
  'src/index.css': `${BASE_CSS}
.portfolio {
  max-width: 1040px;
  margin: 0 auto;
  padding: 72px 32px;
}

.intro__name {
  font-weight: 600;
  margin: 0 0 24px;
}

.intro__title {
  font-size: 44px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0 0 16px;
  max-width: 760px;
}

.intro__meta {
  color: #6b7079;
  margin: 0;
}

.work {
  margin-top: 96px;
}

.work h2,
.contact h2 {
  font-size: 22px;
  margin: 0 0 24px;
}

.work__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 32px;
}

.work__item img {
  width: 100%;
  border-radius: 12px;
  display: block;
}

.work__item h3 {
  margin: 14px 0 4px;
  font-size: 17px;
}

.work__item p {
  margin: 0;
  color: #6b7079;
}

.contact {
  margin-top: 96px;
  padding-top: 48px;
  border-top: 1px solid #ececf0;
}

.contact__link {
  font-size: 28px;
  color: inherit;
}

@media (max-width: 640px) {
  .intro__title {
    font-size: 32px;
  }

  .work__grid {
    grid-template-columns: 1fr;
  }
}
`,
};

const DASHBOARD: Record<string, string> = {
  'src/App.jsx': `const STATS = [
  { label: 'Revenue', value: '$48,290', change: '+12.4%' },
  { label: 'Active users', value: '3,184', change: '+4.1%' },
  { label: 'Conversion', value: '3.9%', change: '-0.3%' },
];

const ACTIVITY = [
  { name: 'Invoice #1042 paid', date: 'Today', amount: '$1,200' },
  { name: 'New team member', date: 'Yesterday', amount: '—' },
  { name: 'Invoice #1041 paid', date: 'Oct 8', amount: '$860' },
];

export default function App() {
  return (
    <div className="dashboard" data-oc-name="Page">
      <aside className="sidebar" data-oc-name="Sidebar">
        <p className="sidebar__brand">Ledger</p>
        <nav className="sidebar__nav">
          <a className="is-active" href="#">Overview</a>
          <a href="#">Customers</a>
          <a href="#">Invoices</a>
          <a href="#">Settings</a>
        </nav>
      </aside>
      <main className="content" data-oc-name="Content">
        <h1>Overview</h1>
        <div className="stats" data-oc-name="Stats">
          {STATS.map((stat) => (
            <div className="stat" key={stat.label}>
              <p className="stat__label">{stat.label}</p>
              <p className="stat__value">{stat.value}</p>
              <p className="stat__change">{stat.change}</p>
            </div>
          ))}
        </div>
        <section className="panel" data-oc-name="Activity">
          <h2>Recent activity</h2>
          <table>
            <tbody>
              {ACTIVITY.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.date}</td>
                  <td>{row.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
`,
  'src/index.css': `${BASE_CSS}
body {
  background: #f6f7f9;
}

.dashboard {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}

.sidebar {
  padding: 24px 16px;
  background: #ffffff;
  border-right: 1px solid #e7e8ec;
}

.sidebar__brand {
  font-weight: 700;
  margin: 0 8px 24px;
}

.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar__nav a {
  padding: 8px;
  border-radius: 8px;
  color: #5b606b;
  text-decoration: none;
  font-size: 14px;
}

.sidebar__nav a.is-active {
  background: #f1f2f5;
  color: #16181d;
}

.content {
  padding: 32px 40px;
}

.content h1 {
  margin: 0 0 24px;
  font-size: 26px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.stat,
.panel {
  background: #ffffff;
  border: 1px solid #e7e8ec;
  border-radius: 12px;
  padding: 18px 20px;
}

.stat p {
  margin: 0;
}

.stat__label {
  color: #6b7079;
  font-size: 13px;
}

.stat__value {
  font-size: 26px;
  font-weight: 700;
  margin: 6px 0 !important;
}

.stat__change {
  color: #16a34a;
  font-size: 13px;
}

.panel {
  margin-top: 16px;
}

.panel h2 {
  font-size: 16px;
  margin: 0 0 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

td {
  padding: 10px 0;
  border-top: 1px solid #f0f1f4;
}

td:last-child {
  text-align: right;
}

@media (max-width: 1024px) {
  .dashboard {
    grid-template-columns: 1fr;
  }

  .sidebar {
    border-right: none;
    border-bottom: 1px solid #e7e8ec;
  }
}

@media (max-width: 640px) {
  .stats {
    grid-template-columns: 1fr;
  }

  .content {
    padding: 24px 16px;
  }
}
`,
};

const MARKETING: Record<string, string> = {
  'src/App.jsx': `const PLANS = [
  { name: 'Starter', price: '$0', note: 'For individuals getting started.' },
  { name: 'Team', price: '$24', note: 'Collaboration for growing teams.' },
  { name: 'Scale', price: '$79', note: 'Advanced controls and support.' },
];

export default function App() {
  return (
    <div className="site" data-oc-name="Page">
      <section className="announce" data-oc-name="Announcement">
        <p className="announce__tag">Introducing Relay</p>
        <h1>Customer messaging that feels personal at any scale.</h1>
        <p className="announce__lead">Bring email, chat and in-app messages together in one calm inbox.</p>
        <a className="cta" href="#pricing">See pricing</a>
      </section>
      <section className="pricing" id="pricing" data-oc-name="Pricing">
        <h2>Simple pricing</h2>
        <div className="pricing__grid">
          {PLANS.map((plan) => (
            <div className="plan" key={plan.name}>
              <h3>{plan.name}</h3>
              <p className="plan__price">{plan.price}<span>/mo</span></p>
              <p>{plan.note}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="faq" data-oc-name="FAQ">
        <h2>Questions</h2>
        <details>
          <summary>Can I cancel anytime?</summary>
          <p>Yes. Plans are month to month with no lock-in.</p>
        </details>
        <details>
          <summary>Is there a free trial?</summary>
          <p>Every paid plan starts with a 14-day trial.</p>
        </details>
      </section>
    </div>
  );
}
`,
  'src/index.css': `${BASE_CSS}
.announce {
  padding: 112px 32px 88px;
  text-align: center;
  background: #0f1115;
  color: #ffffff;
}

.announce__tag {
  margin: 0 0 16px;
  color: #a3a8b3;
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.announce h1 {
  max-width: 760px;
  margin: 0 auto 18px;
  font-size: 50px;
  line-height: 1.08;
  letter-spacing: -0.02em;
}

.announce__lead {
  max-width: 520px;
  margin: 0 auto 32px;
  color: #c9ccd3;
  font-size: 18px;
  line-height: 1.6;
}

.cta {
  display: inline-block;
  padding: 12px 22px;
  border-radius: 999px;
  background: #ffffff;
  color: #0f1115;
  font-weight: 600;
  text-decoration: none;
}

.pricing,
.faq {
  max-width: 1000px;
  margin: 0 auto;
  padding: 80px 32px 0;
}

.pricing h2,
.faq h2 {
  font-size: 30px;
  margin: 0 0 32px;
}

.pricing__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.plan {
  padding: 24px;
  border: 1px solid #e7e8ec;
  border-radius: 14px;
}

.plan h3 {
  margin: 0;
}

.plan__price {
  font-size: 34px;
  font-weight: 700;
  margin: 12px 0;
}

.plan__price span {
  font-size: 15px;
  color: #6b7079;
  font-weight: 400;
}

.faq {
  padding-bottom: 96px;
}

details {
  padding: 16px 0;
  border-top: 1px solid #e7e8ec;
}

summary {
  cursor: pointer;
  font-weight: 600;
}

@media (max-width: 640px) {
  .announce h1 {
    font-size: 34px;
  }

  .pricing__grid {
    grid-template-columns: 1fr;
  }
}
`,
};

const TEMPLATE_FILES: Record<TemplateId, Record<string, string>> = {
  blank: BLANK,
  landing: LANDING,
  portfolio: PORTFOLIO,
  dashboard: DASHBOARD,
  marketing: MARKETING,
};

export function generateTemplate(id: TemplateId, slug: string, title: string, versions: DependencyVersions): Record<string, string> {
  return { ...baseFiles(slug, title, versions), ...TEMPLATE_FILES[id] };
}
