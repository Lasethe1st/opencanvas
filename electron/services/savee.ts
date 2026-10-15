/**
 * Savee over its MCP server: OAuth 2.1 sign-in (PKCE S256, dynamic client registration, loopback redirect)
 * and a small stateless JSON-RPC client for the read-only tools. Tokens are stored encrypted and never leave
 * the main process.
 */
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { InspirationBoard, InspirationResult } from '../../shared/inspiration';
import { readSse, type Fetcher } from './ai-providers';

export const SAVEE_MCP_URL = 'https://mcp.savee.com/mcp';
export const SAVEE_SCOPES = 'profile:read saves:read boards:read search:read';
const PROTOCOL_VERSION = '2025-06-18';
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Where the tokens live: an encrypted store in the app, an in-memory map in tests. */
export interface TokenStore {
  available(): boolean;
  get(name: string): string | null;
  set(name: string, value: string): void;
  delete(name: string): void;
}

export interface SaveeDeps {
  fetcher: Fetcher;
  store: TokenStore;
  /** Opens the sign-in page in the user's browser. */
  openExternal(url: string): Promise<void> | void;
  mcpUrl?: string;
  clientName?: string;
  signInTimeoutMs?: number;
  now?: () => number;
}

export class SaveeError extends Error {
  constructor(
    message: string,
    readonly code: 'auth' | 'rate-limit' | 'subscription' | 'network' | 'cancelled' | 'other' = 'other',
  ) {
    super(message);
  }
}

interface Session {
  clientId: string;
  tokenEndpoint: string;
  revocationEndpoint: string | null;
  resource: string;
  expiresAt: number;
  user: string | null;
}

const KEY_ACCESS = 'savee:access';
const KEY_REFRESH = 'savee:refresh';
const KEY_SESSION = 'savee:session';

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

/** Reads `resource_metadata="…"` from a `WWW-Authenticate: Bearer …` challenge. */
export function resourceMetadataUrl(header: string | null): string | null {
  const match = header?.match(/resource_metadata="([^"]+)"/i);
  return match ? match[1] : null;
}

function minutes(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  if (m < 90) return m === 1 ? 'a minute' : `${m} minutes`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hours`;
  return `${Math.round(h / 24)} days`;
}

function retryAfterSeconds(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, (at - Date.now()) / 1000) : null;
}

const SUBSCRIPTION = 'Savee needs an active subscription with API access for this. Check your plan at savee.com, then try again.';

/** Maps an HTTP failure from Savee to a sentence the user can act on. */
async function httpFailure(res: Response, what: string, search = false): Promise<SaveeError> {
  let detail = '';
  try {
    const body = await res.text();
    const json = JSON.parse(body);
    detail = String(json.error_description ?? json.message ?? json.error?.message ?? json.error ?? '');
  } catch {
    /* not JSON */
  }
  if (res.status === 429) {
    const wait = retryAfterSeconds(res);
    const when = wait === null ? 'in a little while' : `in ${minutes(wait)}`;
    return new SaveeError(
      search
        ? `Savee’s search limit is reached. Try again ${when}. Savee allows 20 searches every 5 minutes and 200 a week per account, shared with your other Savee apps; browsing your boards doesn’t count.`
        : `Savee is limiting requests right now. Try again ${when}.`,
      'rate-limit',
    );
  }
  if (res.status === 402 || /subscription|billing|plan/i.test(detail)) return new SaveeError(SUBSCRIPTION, 'subscription');
  if (res.status === 401) return new SaveeError('Your Savee sign-in has expired. Connect Savee again.', 'auth');
  if (res.status === 403) return new SaveeError(detail ? `Savee refused ${what}: ${detail}` : `Savee refused ${what}. Connect again and approve every permission.`, 'auth');
  if (res.status >= 500) return new SaveeError('Savee is having trouble right now. Try again in a few minutes.', 'network');
  return new SaveeError(`Savee couldn’t ${what} (${res.status}${detail ? `: ${detail}` : ''}).`);
}

/* ---------- Mapping Savee data ---------- */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Finds the list in a tool payload, whether it's the payload itself or under `data`, `items`, `saves`… */
function listOf(payload: unknown, keys: string[]): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) {
    const v = (payload as any)[key];
    if (Array.isArray(v)) return v;
  }
  const first = Object.values(payload).find(Array.isArray);
  return (first as any[]) ?? [];
}

export function toResult(save: any): InspirationResult | null {
  if (!save || typeof save !== 'object') return null;
  const id = str(save.id) ?? str(save.short_id);
  if (!id) return null;
  const media = save.media ?? {};
  const colors = (Array.isArray(save.colors) ? save.colors : [])
    .map((c: any) => (typeof c === 'string' ? c : str(c?.color) ?? str(c?.hex)))
    .filter((c: string | null): c is string => !!c && /^#?[0-9a-f]{3,8}$/i.test(c))
    .map((c: string) => (c.startsWith('#') ? c : `#${c}`))
    .slice(0, 8);
  const tags = [str(save.detected_aesthetics), ...(Array.isArray(save.tags) ? save.tags.map(str) : [])].filter((t): t is string => !!t).slice(0, 8);
  return {
    id,
    title: str(save.name) ?? str(save.title) ?? 'Untitled save',
    url: str(save.url) ?? `https://savee.com/i/${encodeURIComponent(str(save.short_id) ?? id)}/`,
    sourceUrl: str(save.source_url) ?? str(save.sourceUrl),
    imageUrl: str(media.thumbnail) ?? str(media.original) ?? str(save.thumbnail) ?? str(save.image_url),
    width: num(media.width) ?? num(save.width),
    height: num(media.height) ?? num(save.height),
    colors,
    tags,
  };
}

export function toBoard(board: any): InspirationBoard | null {
  if (!board || typeof board !== 'object') return null;
  const id = str(board.id) ?? str(board.short_id);
  if (!id) return null;
  return { id, name: str(board.name) ?? str(board.title) ?? 'Untitled board', count: num(board.save_count) ?? num(board.saves_count) ?? num(board.total_saves) ?? num(board.count) ?? 0 };
}

/* ---------- Client ---------- */

export class SaveeClient {
  private signIn: { abort: () => void } | null = null;
  private seq = 0;
  /** Image URLs Savee returned; only these may be downloaded for thumbnails. */
  readonly knownImages = new Set<string>();

  constructor(private deps: SaveeDeps) {}

  private get mcpUrl() {
    return this.deps.mcpUrl ?? SAVEE_MCP_URL;
  }

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  private session(): Session | null {
    const raw = this.deps.store.get(KEY_SESSION);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }

  get connected(): boolean {
    return !!this.session() && !!this.deps.store.get(KEY_REFRESH) && !!this.deps.store.get(KEY_ACCESS);
  }

  get connecting(): boolean {
    return !!this.signIn;
  }

  get user(): string | null {
    return this.session()?.user ?? null;
  }

  private async fetch(url: string, init: RequestInit, what: string): Promise<Response> {
    try {
      return await this.deps.fetcher(url, init);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw new SaveeError('Stopped.', 'cancelled');
      throw new SaveeError(`Couldn’t reach Savee to ${what}. Check your internet connection.`, 'network');
    }
  }

  private async json(url: string, what: string): Promise<any> {
    const res = await this.fetch(url, { headers: { Accept: 'application/json' } }, what);
    if (!res.ok) throw await httpFailure(res, what);
    return res.json();
  }

  /** RFC 9728 → RFC 8414: from the MCP endpoint to the authorization server's endpoints. */
  private async discover() {
    const probe = await this.fetch(
      this.mcpUrl,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL_VERSION }, body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' }) },
      'start signing in',
    );
    const mcp = new URL(this.mcpUrl);
    const prmUrl = resourceMetadataUrl(probe.headers.get('www-authenticate')) ?? `${mcp.origin}/.well-known/oauth-protected-resource`;
    await probe.body?.cancel().catch(() => {});
    const prm = await this.json(prmUrl, 'start signing in');
    const issuer = str(prm.authorization_servers?.[0]);
    if (!issuer) throw new SaveeError('Savee didn’t say where to sign in. Try again later.');
    const resource = str(prm.resource) ?? this.mcpUrl;
    const iss = new URL(issuer);
    const suffix = iss.pathname.replace(/\/$/, '');
    let meta: any;
    try {
      meta = await this.json(`${iss.origin}/.well-known/oauth-authorization-server${suffix}`, 'start signing in');
    } catch {
      meta = await this.json(`${iss.origin}/.well-known/openid-configuration${suffix}`, 'start signing in');
    }
    const methods: string[] = Array.isArray(meta.code_challenge_methods_supported) ? meta.code_challenge_methods_supported : ['S256'];
    if (!methods.includes('S256')) throw new SaveeError('Savee’s sign-in doesn’t support secure PKCE, so OpenCanvas won’t use it.');
    const authorize = str(meta.authorization_endpoint);
    const token = str(meta.token_endpoint);
    const register = str(meta.registration_endpoint);
    if (!authorize || !token) throw new SaveeError('Savee’s sign-in details are incomplete. Try again later.');
    for (const url of [authorize, token, register]) {
      if (url && new URL(url).protocol !== 'https:' && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new SaveeError('Savee’s sign-in must use https.');
    }
    if (!register) throw new SaveeError('Savee doesn’t accept new apps right now, so OpenCanvas can’t sign in.');
    const scopes: string[] = Array.isArray(prm.scopes_supported) ? prm.scopes_supported : SAVEE_SCOPES.split(' ');
    const scope = SAVEE_SCOPES.split(' ')
      .filter((s) => scopes.includes(s))
      .join(' ');
    return { authorize, token, register, revocation: str(meta.revocation_endpoint), resource, scope: scope || SAVEE_SCOPES };
  }

  /** Signs in through the browser. Resolves with the Savee username once tokens are stored. */
  async connect(): Promise<string | null> {
    if (!this.deps.store.available()) throw new SaveeError('This computer has no secure storage for the Savee sign-in, so OpenCanvas won’t keep it.');
    this.signIn?.abort();
    const endpoints = await this.discover();
    const { verifier, challenge } = pkcePair();
    const state = b64url(randomBytes(16));

    let settle!: { resolve: (code: string) => void; reject: (err: Error) => void };
    const codePromise = new Promise<string>((resolve, reject) => (settle = { resolve, reject }));
    // It can be rejected (cancel, timeout) before it's awaited.
    codePromise.catch(() => {});
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const done = (ok: boolean, text: string) => {
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><meta charset="utf-8"><title>OpenCanvas</title><body style="font:15px system-ui;padding:48px;color:#111"><h1 style="font-size:18px">${text}</h1><p>You can close this tab and go back to OpenCanvas.</p></body>`);
      };
      if (url.searchParams.get('state') !== state) {
        done(false, 'This sign-in link is out of date.');
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (error || !code) {
        done(false, 'Savee wasn’t connected.');
        settle.reject(new SaveeError(error === 'access_denied' ? 'You didn’t approve the Savee connection.' : `Savee sign-in failed${error ? ` (${error})` : ''}.`, 'cancelled'));
        return;
      }
      done(true, 'Savee is connected to OpenCanvas.');
      settle.resolve(code);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const timer = setTimeout(() => settle.reject(new SaveeError('Savee sign-in timed out. Try connecting again.', 'cancelled')), this.deps.signInTimeoutMs ?? SIGN_IN_TIMEOUT_MS);
    this.signIn = { abort: () => settle.reject(new SaveeError('Savee sign-in was cancelled.', 'cancelled')) };

    try {
      const reg = await this.fetch(
        endpoints.register,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            client_name: this.deps.clientName ?? 'OpenCanvas',
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            application_type: 'native',
            scope: endpoints.scope,
          }),
        },
        'register OpenCanvas',
      );
      if (!reg.ok) throw await httpFailure(reg, 'register OpenCanvas');
      const registered: any = await reg.json();
      const clientId = str(registered?.client_id);
      if (!clientId) throw new SaveeError('Savee didn’t register OpenCanvas. Try again later.');

      const auth = new URL(endpoints.authorize);
      for (const [k, v] of Object.entries({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: endpoints.scope,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource: endpoints.resource,
      }))
        auth.searchParams.set(k, v);
      await this.deps.openExternal(auth.toString());
      const code = await codePromise;

      const tokens = await this.tokenRequest(endpoints.token, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource: endpoints.resource,
      });
      this.store(tokens, { clientId, tokenEndpoint: endpoints.token, revocationEndpoint: endpoints.revocation, resource: endpoints.resource, expiresAt: 0, user: null });
      const user = await this.currentUser().catch((err) => {
        if (err instanceof SaveeError && err.code === 'subscription') {
          this.clear();
          throw err;
        }
        return null;
      });
      const session = this.session();
      if (session) this.deps.store.set(KEY_SESSION, JSON.stringify({ ...session, user }));
      return user;
    } finally {
      clearTimeout(timer);
      this.signIn = null;
      server.close();
      server.closeAllConnections?.();
    }
  }

  private async tokenRequest(endpoint: string, params: Record<string, string>): Promise<any> {
    const res = await this.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(params).toString() }, 'finish signing in');
    if (!res.ok) {
      if (params.grant_type === 'refresh_token' && (res.status === 400 || res.status === 401)) {
        this.clear();
        throw new SaveeError('Your Savee sign-in has expired. Connect Savee again.', 'auth');
      }
      throw await httpFailure(res, 'finish signing in');
    }
    const json: any = await res.json();
    if (!str(json?.access_token)) throw new SaveeError('Savee didn’t return a sign-in token. Try connecting again.');
    return json;
  }

  private store(tokens: any, session: Session) {
    this.deps.store.set(KEY_ACCESS, tokens.access_token);
    const refresh = str(tokens.refresh_token) ?? this.deps.store.get(KEY_REFRESH);
    if (refresh) this.deps.store.set(KEY_REFRESH, refresh);
    const expiresIn = num(tokens.expires_in) ?? 3600;
    this.deps.store.set(KEY_SESSION, JSON.stringify({ ...session, expiresAt: this.now() + expiresIn * 1000 }));
  }

  private clear() {
    this.deps.store.delete(KEY_ACCESS);
    this.deps.store.delete(KEY_REFRESH);
    this.deps.store.delete(KEY_SESSION);
    this.knownImages.clear();
    this.toolArgs = null;
  }

  /** Downloads an image Savee returned in a result. Other URLs are refused. */
  async image(url: string): Promise<{ data: Buffer; mimeType: string }> {
    if (!this.knownImages.has(url)) throw new SaveeError('That image didn’t come from Savee.');
    if (new URL(url).protocol !== 'https:' && !url.startsWith('http://127.0.0.1')) throw new SaveeError('That image isn’t served securely.');
    const res = await this.fetch(url, { headers: { Accept: 'image/*' } }, 'load the image');
    if (!res.ok) throw new SaveeError(`Savee couldn’t load the image (${res.status}).`, 'network');
    const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!/^image\/(png|jpe?g|gif|webp|avif)$/.test(mimeType)) throw new SaveeError('That Savee item isn’t an image OpenCanvas can show.');
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_IMAGE_BYTES) throw new SaveeError('That image is too large to add as a reference.');
    return { data, mimeType };
  }

  private async refresh(): Promise<string> {
    const session = this.session();
    const refresh = this.deps.store.get(KEY_REFRESH);
    if (!session || !refresh) {
      this.clear();
      throw new SaveeError('Savee isn’t connected. Connect it first.', 'auth');
    }
    const tokens = await this.tokenRequest(session.tokenEndpoint, { grant_type: 'refresh_token', refresh_token: refresh, client_id: session.clientId, resource: session.resource });
    this.store(tokens, session);
    return tokens.access_token;
  }

  private async accessToken(): Promise<string> {
    const session = this.session();
    const token = this.deps.store.get(KEY_ACCESS);
    if (!session || !token) throw new SaveeError('Savee isn’t connected. Connect it first.', 'auth');
    return session.expiresAt - 60_000 > this.now() ? token : this.refresh();
  }

  /** Signs out: revokes the refresh token (and with it the access token) and forgets both. */
  async disconnect() {
    this.signIn?.abort();
    const session = this.session();
    const refresh = this.deps.store.get(KEY_REFRESH);
    this.clear();
    if (session?.revocationEndpoint && refresh) {
      await this.deps
        .fetcher(session.revocationEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: refresh, token_type_hint: 'refresh_token', client_id: session.clientId }) })
        .catch(() => {});
    }
  }

  private toolArgs: Map<string, string[]> | null = null;

  /** Builds tool arguments with the names the server's schema uses; unknown optional ones are left out. */
  private async argsFor(tool: string, wanted: { names: string[]; value: unknown; required?: boolean }[]): Promise<Record<string, unknown>> {
    if (!this.toolArgs) {
      try {
        const message = await this.rpc('tools/list', {}, 'load your Savee library', false);
        const tools: any[] = Array.isArray(message.result?.tools) ? message.result.tools : [];
        this.toolArgs = new Map(tools.map((t) => [String(t.name), Object.keys(t.inputSchema?.properties ?? {})]));
      } catch (err) {
        if (err instanceof SaveeError && (err.code === 'auth' || err.code === 'subscription')) throw err;
        this.toolArgs = new Map();
      }
    }
    const props = this.toolArgs.get(tool);
    const out: Record<string, unknown> = {};
    for (const w of wanted) {
      const name = props ? w.names.find((n) => props.includes(n)) : w.names[0];
      if (name) out[name] = w.value;
      else if (w.required && props?.length === 1) out[props[0]] = w.value;
    }
    return out;
  }

  private async rpc(method: string, params: unknown, what: string, search: boolean): Promise<any> {
    const attempt = async (token: string) =>
      this.fetch(
        this.mcpUrl,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL_VERSION },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++this.seq, method, params }),
        },
        what,
      );
    let res = await attempt(await this.accessToken());
    if (res.status === 401) {
      await res.body?.cancel().catch(() => {});
      res = await attempt(await this.refresh());
    }
    if (!res.ok) {
      const err = await httpFailure(res, what, search);
      if (err.code === 'auth' && res.status === 401) this.clear();
      throw err;
    }
    return this.readMessage(res);
  }

  /** Calls one Savee MCP tool and returns its parsed payload. */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const search = name === 'search';
    const what = search ? 'search' : 'load your Savee library';
    const message = await this.rpc('tools/call', { name, arguments: args }, what, search);
    if (message.error) {
      const text = String(message.error.message ?? 'Unknown error');
      if (/subscription|billing|payment/i.test(text)) throw new SaveeError(SUBSCRIPTION, 'subscription');
      if (/rate|limit/i.test(text) && search) throw new SaveeError('Savee’s search limit is reached. Try again later. Savee allows 20 searches every 5 minutes and 200 a week per account.', 'rate-limit');
      throw new SaveeError(`Savee: ${text}`);
    }
    const result = message.result ?? {};
    const text = (Array.isArray(result.content) ? result.content : []).filter((c: any) => c?.type === 'text').map((c: any) => String(c.text)).join('\n');
    if (result.isError) {
      if (/subscription|billing|payment|402/i.test(text)) throw new SaveeError(SUBSCRIPTION, 'subscription');
      if (/429|rate limit|too many/i.test(text)) throw new SaveeError(search ? 'Savee’s search limit is reached. Try again later. Savee allows 20 searches every 5 minutes and 200 a week per account.' : 'Savee is limiting requests right now. Try again later.', 'rate-limit');
      throw new SaveeError(text ? `Savee: ${text.slice(0, 300)}` : `Savee couldn’t ${what}.`);
    }
    if (result.structuredContent !== undefined) return result.structuredContent;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** The JSON-RPC reply, from a JSON body or the first matching message of an event stream. */
  private async readMessage(res: Response): Promise<any> {
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('text/event-stream') && res.body) {
      for await (const event of readSse(res.body)) {
        try {
          const msg = JSON.parse(event.data);
          if (msg && ('result' in msg || 'error' in msg)) {
            await res.body.cancel().catch(() => {});
            return msg;
          }
        } catch {
          /* keep reading */
        }
      }
      throw new SaveeError('Savee ended the reply early. Try again.');
    }
    try {
      return await res.json();
    } catch {
      throw new SaveeError('Savee sent a reply OpenCanvas couldn’t read. Try again.');
    }
  }

  async currentUser(): Promise<string | null> {
    const payload: any = await this.callTool('get_current_user', {});
    const user = payload?.user ?? payload?.data ?? payload;
    return str(user?.username) ?? str(user?.name);
  }

  private results(payload: unknown): InspirationResult[] {
    const out = listOf(payload, ['data', 'saves', 'items', 'results'])
      .map(toResult)
      .filter((r): r is InspirationResult => !!r);
    for (const r of out) if (r.imageUrl) this.knownImages.add(r.imageUrl);
    return out;
  }

  async search(query: string): Promise<InspirationResult[]> {
    const q = query.trim();
    if (q.length < 2) throw new SaveeError('Type at least 2 characters to search Savee.');
    const args = await this.argsFor('search', [
      { names: ['query', 'q', 'text'], value: q.slice(0, 200), required: true },
      { names: ['limit', 'page_size'], value: 30 },
    ]);
    return this.results(await this.callTool('search', args));
  }

  async boards(): Promise<InspirationBoard[]> {
    const args = await this.argsFor('list_boards', [{ names: ['limit', 'page_size'], value: 100 }]);
    return listOf(await this.callTool('list_boards', args), ['data', 'boards', 'items'])
      .map(toBoard)
      .filter((b): b is InspirationBoard => !!b);
  }

  async boardItems(boardId: string): Promise<InspirationResult[]> {
    const args = await this.argsFor('list_board_saves', [
      { names: ['board_id', 'boardId', 'board', 'id'], value: boardId, required: true },
      { names: ['limit', 'page_size'], value: 30 },
    ]);
    return this.results(await this.callTool('list_board_saves', args));
  }

  async save(idOrUrl: string): Promise<InspirationResult | null> {
    const args = await this.argsFor('get_save', [{ names: ['id', 'save', 'url', 'save_id'], value: idOrUrl, required: true }]);
    const payload: any = await this.callTool('get_save', args);
    const found = toResult(payload?.data ?? payload?.save ?? payload);
    if (found?.imageUrl) this.knownImages.add(found.imageUrl);
    return found;
  }
}
