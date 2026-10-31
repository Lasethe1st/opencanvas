import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/** Wide mark in a square: fill most of the width and thicken slightly on Y so it reads at small sizes. */
const MARK_PAD_X = 28;
const TARGET_H = 560; // ~55% of canvas — was ~40% at uniform scale
const scaleX = (1024 - MARK_PAD_X * 2) / 1182;
const scaleY = TARGET_H / 499;
const tx = MARK_PAD_X;
const ty = (1024 - TARGET_H) / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="228" ry="228" fill="#1C1C1E"/>
  <g transform="translate(${tx} ${ty}) scale(${scaleX} ${scaleY})">
    <path fill="#FFFFFF" d="M725.671 389.087C770.516 455.404 846.417 499 932.5 499C1070.29 499 1182 387.295 1182 249.5C1182 111.705 1070.29 0 932.5 0C846.417 0 770.516 43.5957 725.671 109.913C695.453 154.601 650.893 194.055 596.948 194.055H585.052C531.106 194.055 486.547 154.601 456.329 109.913C411.484 43.5957 335.583 0 249.5 0C111.705 0 0 111.705 0 249.5C0 387.295 111.705 499 249.5 499C335.583 499 411.484 455.404 456.329 389.087C486.547 344.399 531.106 304.944 585.052 304.944H596.948C650.893 304.944 695.453 344.399 725.671 389.087Z"/>
  </g>
</svg>`;

const html = `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`;
const out = path.resolve('src/assets/brand-mark.png');

const launch = async () => {
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      return await chromium.launch(channel ? { channel } : undefined);
    } catch {
      /* try next */
    }
  }
  throw new Error('No Chromium available for playwright-core');
};

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.locator('svg').screenshot({ path: out, omitBackground: true });
await browser.close();
console.log('wrote', out, fs.statSync(out).size);
