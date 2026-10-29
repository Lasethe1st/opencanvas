/** Lightweight web search + page fetch for the in-app AI (no extra API key). */
import type { Fetcher } from './ai-providers';

const UA = 'OpenCanvas/1.0 (design assistant; +https://opencanvas.app)';
const MAX_BODY = 500_000;
const MAX_TEXT = 12_000;
const MAX_RESULTS = 5;

export type WebHit = { title: string; url: string; snippet: string };

export class WebBrowseError extends Error {}

function assertHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebBrowseError('That doesn’t look like a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new WebBrowseError('Only http and https URLs are allowed.');
  if (url.username || url.password) throw new WebBrowseError('URLs with credentials aren’t allowed.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local') || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    throw new WebBrowseError('Local and private network URLs aren’t allowed.');
  }
  return url;
}

async function readText(fetcher: Fetcher, url: string, init?: RequestInit): Promise<{ finalUrl: string; html: string }> {
  let res: Response;
  try {
    res = await fetcher(url, {
      ...init,
      headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'User-Agent': UA, ...(init?.headers ?? {}) },
      redirect: 'follow',
    });
  } catch {
    throw new WebBrowseError(`Couldn’t reach ${url}. Check your connection and try again.`);
  }
  if (!res.ok) throw new WebBrowseError(`The page returned ${res.status} (${url}).`);
  const buf = await res.arrayBuffer();
  const slice = buf.byteLength > MAX_BODY ? buf.slice(0, MAX_BODY) : buf;
  const html = new TextDecoder('utf-8').decode(slice);
  return { finalUrl: res.url || url, html };
}

/** Strip tags and collapse whitespace for a readable excerpt. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(br|p|div|h[1-6]|li|tr|section|article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function pageTitle(html: string, fallback: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = m ? htmlToText(m[1]).replace(/\s+/g, ' ').trim() : '';
  return title.slice(0, 120) || fallback;
}

function unwrapDdgHref(href: string): string | null {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      if (u.hostname.includes('duckduckgo.com')) return null;
      return u.href;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Public web search via DuckDuckGo HTML results (no API key). */
export async function webSearch(query: string, fetcher: Fetcher): Promise<{ hits: WebHit[]; report: string; summary: string }> {
  const q = query.trim().slice(0, 200);
  if (!q) throw new WebBrowseError('"query" is required.');
  const { html } = await readText(fetcher, `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });

  const hits: WebHit[] = [];
  const seen = new Set<string>();
  // result__a is the classic DDG HTML result link
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && hits.length < MAX_RESULTS) {
    const url = unwrapDdgHref(m[1].replace(/&amp;/g, '&'));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = htmlToText(m[2]).replace(/\s+/g, ' ').trim() || url;
    // Snippet often sits in result__snippet nearby — best-effort window
    const window = html.slice(m.index, m.index + 800);
    const snip = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)/i.exec(window);
    hits.push({ title: title.slice(0, 140), url, snippet: snip ? htmlToText(snip[1]).slice(0, 220) : '' });
  }

  if (!hits.length) {
    return {
      hits: [],
      report: `No web results for “${q}”. Try a simpler query, or fetch a specific URL with fetch_url.`,
      summary: `Searched “${q.slice(0, 40)}” · no results`,
    };
  }

  const lines = hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? `\n   ${h.snippet}` : ''}`);
  const report = `Web search for “${q}” (${hits.length} result${hits.length === 1 ? '' : 's'}):\n\n${lines.join('\n\n')}\n\nCite these URLs when you use them. Prefer fetch_url on a result before quoting long passages.`;
  const summary = `Searched “${q.slice(0, 40)}${q.length > 40 ? '…' : ''}” · ${hits.map((h) => h.url).join(' · ')}`;
  return { hits, report, summary };
}

/** Fetch a public page and return a text excerpt for the model. */
export async function fetchUrl(rawUrl: string, fetcher: Fetcher): Promise<{ title: string; url: string; report: string; summary: string }> {
  const target = assertHttpUrl(rawUrl);
  const { finalUrl, html } = await readText(fetcher, target.href);
  const title = pageTitle(html, target.hostname);
  const body = htmlToText(html).slice(0, MAX_TEXT);
  if (!body) throw new WebBrowseError(`No readable text on ${finalUrl}.`);
  const report = `Fetched “${title}”\nURL: ${finalUrl}\n\n${body}${body.length >= MAX_TEXT ? '\n\n…(truncated)' : ''}`;
  const summary = `Fetched ${title} · ${finalUrl}`;
  return { title, url: finalUrl, report, summary };
}
