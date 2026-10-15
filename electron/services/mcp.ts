import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

/**
 * A minimal Model Context Protocol server (Streamable HTTP transport, JSON responses only).
 * It listens on 127.0.0.1, rejects foreign Host/Origin headers (DNS rebinding, browser pages)
 * and requires a bearer token, because its tools can modify the open project.
 */

export type McpContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export interface McpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  run(args: Record<string, any>): Promise<McpContent[]> | McpContent[];
}

export class McpToolError extends Error {}

export interface McpSettings {
  enabled: boolean;
  port: number;
  token: string;
}

export const DEFAULT_MCP_PORT = 7457;
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY = 8 * 1024 * 1024;

export function newToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function readMcpSettings(file: string): McpSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<McpSettings>;
    const port = Number(raw.port);
    return {
      enabled: raw.enabled === true,
      port: Number.isInteger(port) && port > 1023 && port < 65536 ? port : DEFAULT_MCP_PORT,
      token: typeof raw.token === 'string' && raw.token.length >= 24 ? raw.token : newToken(),
    };
  } catch {
    return { enabled: false, port: DEFAULT_MCP_PORT, token: newToken() };
  }
}

export function writeMcpSettings(file: string, settings: McpSettings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

interface RpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
}

const rpcError = (id: RpcMessage['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export interface McpServerOptions {
  name: string;
  version: string;
  instructions: string;
  tools: McpTool[];
  token: () => string;
  onCall?: (tool: string, ok: boolean) => void;
}

export class McpServer {
  private server: http.Server | null = null;
  private port = 0;

  constructor(private options: McpServerOptions) {}

  get listening() {
    return !!this.server?.listening;
  }

  listen(port: number): Promise<void> {
    this.port = port;
    const server = http.createServer((req, res) => void this.handle(req, res));
    this.server = server;
    return new Promise((resolve, reject) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        this.server = null;
        reject(err.code === 'EADDRINUSE' ? new Error(`Port ${port} is already in use.`) : err);
      });
      server.listen(port, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') this.port = address.port;
        resolve();
      });
    });
  }

  get boundPort() {
    return this.port;
  }

  close(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return Promise.resolve();
    server.closeAllConnections?.();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  private send(res: http.ServerResponse, status: number, body?: unknown) {
    if (body === undefined) {
      res.writeHead(status).end();
      return;
    }
    const text = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(text);
  }

  private allowedHost(host: string | undefined) {
    return host === `127.0.0.1:${this.port}` || host === `localhost:${this.port}`;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (!this.allowedHost(req.headers.host)) return this.send(res, 403, rpcError(null, -32000, 'Forbidden host.'));
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && !this.allowedHost(origin.replace(/^https?:\/\//, ''))) {
      return this.send(res, 403, rpcError(null, -32000, 'Forbidden origin.'));
    }
    if (url.pathname !== '/mcp') return this.send(res, 404, rpcError(null, -32000, 'Not found. The MCP endpoint is /mcp.'));
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token || !safeEqual(token, this.options.token())) {
      return this.send(res, 401, rpcError(null, -32001, 'Missing or invalid bearer token. Copy the config from OpenCanvas → MCP.'));
    }
    if (req.method === 'DELETE') return this.send(res, 200);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, DELETE');
      return this.send(res, 405, rpcError(null, -32000, 'This server does not offer an SSE stream; use POST.'));
    }

    let raw = '';
    let size = 0;
    try {
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY) return this.send(res, 413, rpcError(null, -32600, 'Request too large.'));
        raw += chunk;
      }
    } catch {
      return;
    }
    let payload: RpcMessage | RpcMessage[];
    try {
      payload = JSON.parse(raw);
    } catch {
      return this.send(res, 400, rpcError(null, -32700, 'Parse error.'));
    }
    const messages = Array.isArray(payload) ? payload : [payload];
    const replies = (await Promise.all(messages.map((m) => this.dispatch(m)))).filter((r) => r !== null);
    if (replies.length === 0) return this.send(res, 202);
    this.send(res, 200, Array.isArray(payload) ? replies : replies[0]);
  }

  private async dispatch(msg: RpcMessage): Promise<object | null> {
    if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') {
      // Responses to server requests and malformed entries: nothing to answer.
      return msg && 'id' in msg && msg.id !== undefined && !('result' in msg) && !('error' in msg) ? rpcError(msg.id, -32600, 'Invalid request.') : null;
    }
    const isNotification = msg.id === undefined;
    const result = await this.call(msg.method, msg.params ?? {}).then(
      (value) => ({ jsonrpc: '2.0', id: msg.id, result: value }),
      (err: Error & { code?: number }) => rpcError(msg.id, err.code ?? -32603, err.message),
    );
    return isNotification ? null : result;
  }

  private async call(method: string, params: any): Promise<unknown> {
    switch (method) {
      case 'initialize': {
        const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
        return {
          protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: this.options.name, version: this.options.version },
          instructions: this.options.instructions,
        };
      }
      case 'ping':
        return {};
      case 'tools/list':
        return {
          tools: this.options.tools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
        };
      case 'tools/call': {
        const tool = this.options.tools.find((t) => t.name === params.name);
        if (!tool) throw Object.assign(new Error(`Unknown tool: ${params.name}`), { code: -32602 });
        try {
          const content = await tool.run(params.arguments ?? {});
          this.options.onCall?.(tool.name, true);
          return { content };
        } catch (err) {
          this.options.onCall?.(tool.name, false);
          return { content: [{ type: 'text', text: (err as Error).message || String(err) }], isError: true };
        }
      }
      default:
        if (method.startsWith('notifications/')) return {};
        throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
    }
  }
}
