/** Streaming chat with tools over Anthropic's Messages API or any OpenAI-compatible Chat Completions API. No SDKs. */
import { providerMeta, type AiModel, type AiSettings } from '../../shared/ai';

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export type ChatPart = { type: 'text'; text: string } | { type: 'image'; mimeType: string; data: string };

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

export interface ToolResult {
  callId: string;
  name: string;
  content: ChatPart[];
  isError: boolean;
}

/** Anthropic thinking blocks must be passed back unchanged on the next tool-result turn. */
export type ThinkingBlock = { thinking: string; signature: string };

export type ChatMessage =
  | { role: 'user'; content: ChatPart[] }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[]; thinkingBlocks?: ThinkingBlock[] }
  | { role: 'tool'; results: ToolResult[] };

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatRequest {
  settings: AiSettings;
  key: string | null;
  system: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  /** Streamed model reasoning / thinking summary (shown in the chat before the reply). */
  onReasoning?: (delta: string) => void;
  maxTokens?: number;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  thinkingBlocks?: ThinkingBlock[];
  /** "tool_use" when the model wants tool results next. */
  stopReason: string;
}

export class AiProviderError extends Error {}

/* ---------- SSE ---------- */

export interface SseEvent {
  event: string;
  data: string;
}

/** Parses a text/event-stream body into events. Handles CRLF, multi-line data and chunks split anywhere. */
export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];
  const flush = (): SseEvent | null => {
    if (!data.length) {
      event = '';
      return null;
    }
    const out = { event: event || 'message', data: data.join('\n') };
    event = '';
    data = [];
    return out;
  };
  try {
    for (;;) {
      if (signal?.aborted) throw abortError();
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.search(/\r\n|\r|\n/)) >= 0) {
        // A trailing \r may be the first half of a \r\n split across chunks.
        if (!done && nl === buffer.length - 1 && buffer[nl] === '\r') break;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + (buffer.startsWith('\r\n', nl) ? 2 : 1));
        if (line === '') {
          const out = flush();
          if (out) yield out;
        } else if (line.startsWith(':')) {
          continue;
        } else {
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') event = value;
          else if (field === 'data') data.push(value);
        }
      }
      if (done) {
        if (buffer) data.push(...(buffer.startsWith('data:') ? [buffer.slice(5).replace(/^ /, '')] : []));
        const out = flush();
        if (out) yield out;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const abortError = () => Object.assign(new Error('Stopped.'), { name: 'AbortError' });

/* ---------- Errors ---------- */

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Turns a network failure into a sentence the user can act on. */
export function networkError(settings: AiSettings, err: unknown): AiProviderError {
  if ((err as Error)?.name === 'AbortError') return Object.assign(new AiProviderError('Stopped.'), { name: 'AbortError' });
  const meta = providerMeta(settings.provider);
  if (meta.local || /localhost|127\.0\.0\.1/.test(settings.baseUrl)) {
    return new AiProviderError(`I couldn’t reach ${meta.local ? meta.label : 'your local model'} at ${settings.baseUrl}. Make sure it’s running, then try again.`);
  }
  return new AiProviderError(`I couldn’t reach ${hostOf(settings.baseUrl)} just now. Check your connection (and the server URL in Settings › AI), then try again.`);
}

async function httpError(settings: AiSettings, res: Response): Promise<AiProviderError> {
  const meta = providerMeta(settings.provider);
  let detail = '';
  try {
    const body = await res.text();
    try {
      const json = JSON.parse(body);
      detail = json?.error?.message ?? json?.message ?? (typeof json?.error === 'string' ? json.error : '');
    } catch {
      detail = body.slice(0, 200);
    }
  } catch {
    /* no body */
  }
  const name = meta.id === 'custom' ? 'The server' : meta.label;
  if (res.status === 401 || res.status === 403) return new AiProviderError(`${name} rejected the API key. Check it in Settings › AI.`);
  if (res.status === 404) return new AiProviderError(`${name} couldn’t find that model or endpoint. Check the model and server URL in Settings › AI.${detail ? ` (${detail})` : ''}`);
  if (res.status === 429) {
    const retry = res.headers.get('retry-after');
    return new AiProviderError(`${name} is rate limiting requests${retry ? `; try again in ${retry} s` : '; try again shortly'}.${detail ? ` (${detail})` : ''}`);
  }
  if (res.status >= 500) return new AiProviderError(`${name} is having trouble (${res.status}). Try again in a moment.`);
  return new AiProviderError(detail ? `${name}: ${detail}` : `${name} refused the request (${res.status}).`);
}

async function post(settings: AiSettings, fetcher: Fetcher, url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (err) {
    throw networkError(settings, err);
  }
  if (!res.ok) throw await httpError(settings, res);
  if (!res.body) throw new AiProviderError('The server sent an empty response.');
  return res;
}

/* ---------- Anthropic ---------- */

const anthropicBase = (url: string) => url.replace(/\/+$/, '').replace(/\/v1$/, '');
const anthropicHeaders = (key: string | null): Record<string, string> => ({ 'anthropic-version': '2023-06-01', ...(key ? { 'x-api-key': key } : {}) });

function anthropicParts(parts: ChatPart[]) {
  return parts.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'base64', media_type: p.mimeType, data: p.data } }));
}

function anthropicMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: anthropicParts(m.content) };
    if (m.role === 'assistant') {
      const content: unknown[] = [];
      for (const block of m.thinkingBlocks ?? []) content.push({ type: 'thinking', thinking: block.thinking, signature: block.signature });
      if (m.text) content.push({ type: 'text', text: m.text });
      for (const c of m.toolCalls) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args });
      return { role: 'assistant', content };
    }
    return {
      role: 'user',
      content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.callId, content: anthropicParts(r.content.length ? r.content : [{ type: 'text', text: '(no output)' }]), is_error: r.isError })),
    };
  });
}

/** Budget for classic extended thinking; must stay below max_tokens and ≥ 1024. */
function thinkingBudget(maxTokens: number, effort: AiSettings['thinkingEffort']): number {
  const want = effort === 'high' ? 10000 : effort === 'low' ? 1024 : 4096;
  return Math.max(1024, Math.min(want, maxTokens - 1024));
}

function anthropicThinkingConfigs(settings: AiSettings, maxTokens: number): Record<string, unknown>[] {
  const effort = settings.thinkingEffort ?? 'medium';
  const budget = thinkingBudget(maxTokens, effort);
  // Newer Claude models prefer adaptive + summarized display; older ones need enabled + budget.
  return [
    { thinking: { type: 'adaptive', display: 'summarized' } },
    { thinking: { type: 'enabled', budget_tokens: budget, display: 'summarized' } },
    { thinking: { type: 'enabled', budget_tokens: budget } },
  ];
}

async function anthropicChatOnce(req: ChatRequest, fetcher: Fetcher, extra: Record<string, unknown> = {}): Promise<ChatResponse> {
  const maxTokens = req.maxTokens ?? 8192;
  const res = await post(
    req.settings,
    fetcher,
    `${anthropicBase(req.settings.baseUrl)}/v1/messages`,
    anthropicHeaders(req.key),
    {
      model: req.settings.model,
      max_tokens: maxTokens,
      system: req.system,
      messages: anthropicMessages(req.messages),
      ...(req.tools.length ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) } : {}),
      stream: true,
      ...extra,
    },
    req.signal,
  );
  let text = '';
  let stopReason = 'end_turn';
  const blocks = new Map<number, { id: string; name: string; json: string }>();
  const thinking = new Map<number, { thinking: string; signature: string }>();
  const calls: ToolCall[] = [];
  try {
    for await (const ev of readSse(res.body!, req.signal)) {
      if (!ev.data || ev.data === '[DONE]') continue;
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case 'content_block_start':
          if (msg.content_block?.type === 'tool_use') blocks.set(msg.index, { id: msg.content_block.id, name: msg.content_block.name, json: '' });
          else if (msg.content_block?.type === 'thinking') thinking.set(msg.index, { thinking: msg.content_block.thinking ?? '', signature: msg.content_block.signature ?? '' });
          break;
        case 'content_block_delta':
          if (msg.delta?.type === 'text_delta') {
            text += msg.delta.text;
            req.onText?.(msg.delta.text);
          } else if (msg.delta?.type === 'thinking_delta') {
            const chunk = msg.delta.thinking ?? '';
            const block = thinking.get(msg.index) ?? { thinking: '', signature: '' };
            block.thinking += chunk;
            thinking.set(msg.index, block);
            if (chunk) req.onReasoning?.(chunk);
          } else if (msg.delta?.type === 'signature_delta') {
            const block = thinking.get(msg.index) ?? { thinking: '', signature: '' };
            block.signature += msg.delta.signature ?? '';
            thinking.set(msg.index, block);
          } else if (msg.delta?.type === 'input_json_delta') {
            const b = blocks.get(msg.index);
            if (b) b.json += msg.delta.partial_json ?? '';
          }
          break;
        case 'content_block_stop': {
          const b = blocks.get(msg.index);
          if (b) {
            calls.push({ id: b.id, name: b.name, args: parseArgs(b.json) });
            blocks.delete(msg.index);
          }
          break;
        }
        case 'message_delta':
          if (msg.delta?.stop_reason) stopReason = msg.delta.stop_reason;
          break;
        case 'error':
          throw new AiProviderError(`Anthropic: ${msg.error?.message ?? 'the stream failed.'}`);
      }
    }
  } catch (err) {
    if (err instanceof AiProviderError) throw err;
    throw networkError(req.settings, err);
  }
  const thinkingBlocks = [...thinking.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, b]) => b)
    .filter((b) => b.signature);
  return { text, toolCalls: calls, thinkingBlocks: thinkingBlocks.length ? thinkingBlocks : undefined, stopReason: calls.length ? 'tool_use' : stopReason };
}

async function anthropicChat(req: ChatRequest, fetcher: Fetcher): Promise<ChatResponse> {
  const maxTokens = req.maxTokens ?? 8192;
  const configs = anthropicThinkingConfigs(req.settings, maxTokens);
  let lastErr: unknown;
  for (const extra of [...configs, {}]) {
    try {
      return await anthropicChatOnce(req, fetcher, extra);
    } catch (err) {
      lastErr = err;
      const msg = (err as Error)?.message ?? '';
      // Thinking config rejected or unsupported — try the next shape, then none.
      if (err instanceof AiProviderError && /thinking|budget_tokens|display|adaptive|enabled/i.test(msg)) continue;
      throw err;
    }
  }
  throw lastErr;
}

function parseArgs(json: string): Record<string, any> {
  if (!json.trim()) return {};
  try {
    const value = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return { __invalid_json: json.slice(0, 500) };
  }
}

/* ---------- OpenAI-compatible ---------- */

const openaiBase = (url: string) => url.replace(/\/+$/, '');
const openaiHeaders = (key: string | null): Record<string, string> => (key ? { Authorization: `Bearer ${key}` } : {});

function openaiMessages(system: string, messages: ChatMessage[], images: boolean) {
  const out: unknown[] = [{ role: 'system', content: system }];
  const userContent = (parts: ChatPart[]) => {
    const visible = parts.filter((p) => images || p.type === 'text');
    if (visible.every((p) => p.type === 'text')) return visible.map((p) => (p as { text: string }).text).join('\n\n');
    return visible.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:${p.mimeType};base64,${p.data}` } }));
  };
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: userContent(m.content) });
    else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.text || null,
        ...(m.toolCalls.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}),
      });
    } else {
      const shots: ChatPart[] = [];
      for (const r of m.results) {
        const textOut = r.content.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('\n\n');
        const imgs = r.content.filter((p) => p.type === 'image');
        shots.push(...imgs);
        out.push({ role: 'tool', tool_call_id: r.callId, content: (r.isError ? 'Error: ' : '') + (textOut || (imgs.length ? '(image attached in the next message)' : '(no output)')) });
      }
      if (shots.length && images) out.push({ role: 'user', content: userContent([{ type: 'text', text: 'Screenshot from the tool call above:' }, ...shots]) });
    }
  }
  return out;
}

async function openaiChatOnce(req: ChatRequest, fetcher: Fetcher, images: boolean): Promise<ChatResponse> {
  const res = await post(
    req.settings,
    fetcher,
    `${openaiBase(req.settings.baseUrl)}/chat/completions`,
    openaiHeaders(req.key),
    {
      model: req.settings.model,
      messages: openaiMessages(req.system, req.messages, images),
      ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
      stream: true,
    },
    req.signal,
  );
  let text = '';
  let stopReason = 'stop';
  const calls = new Map<number, { id: string; name: string; json: string }>();
  try {
    for await (const ev of readSse(res.body!, req.signal)) {
      if (!ev.data || ev.data === '[DONE]') continue;
      const msg = JSON.parse(ev.data);
      if (msg.error) throw new AiProviderError(msg.error.message ?? 'The stream failed.');
      const choice = msg.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      if (typeof delta.content === 'string' && delta.content) {
        text += delta.content;
        req.onText?.(delta.content);
      }
      // OpenAI-compatible reasoning streams (DeepSeek-R1, Grok reasoning, etc.).
      const reasoning =
        (typeof delta.reasoning_content === 'string' && delta.reasoning_content) ||
        (typeof delta.reasoning === 'string' && delta.reasoning) ||
        (typeof (delta as { reasoning_text?: string }).reasoning_text === 'string' && (delta as { reasoning_text: string }).reasoning_text) ||
        '';
      if (reasoning) req.onReasoning?.(reasoning);
      for (const tc of delta.tool_calls ?? []) {
        const index = typeof tc.index === 'number' ? tc.index : calls.size;
        const cur = calls.get(index) ?? { id: '', name: '', json: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.json += tc.function.arguments;
        calls.set(index, cur);
      }
      if (choice.finish_reason) stopReason = choice.finish_reason;
    }
  } catch (err) {
    if (err instanceof AiProviderError) throw err;
    throw networkError(req.settings, err);
  }
  const toolCalls = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, c]) => ({ id: c.id || `call_${i}_${Date.now().toString(36)}`, name: c.name, args: parseArgs(c.json) }))
    .filter((c) => c.name);
  return { text, toolCalls, stopReason: toolCalls.length ? 'tool_use' : stopReason };
}

/** Models that can't read images get the same request without them. */
const noImageModels = new Set<string>();

async function openaiChat(req: ChatRequest, fetcher: Fetcher): Promise<ChatResponse> {
  const key = `${req.settings.baseUrl}|${req.settings.model}`;
  const hasImages = req.messages.some((m) => (m.role === 'user' ? m.content : m.role === 'tool' ? m.results.flatMap((r) => r.content) : []).some((p) => p.type === 'image'));
  if (!hasImages || noImageModels.has(key)) return openaiChatOnce(req, fetcher, false);
  try {
    return await openaiChatOnce(req, fetcher, true);
  } catch (err) {
    if (err instanceof AiProviderError && /image|vision|multimodal|content type|image_url/i.test(err.message)) {
      noImageModels.add(key);
      return openaiChatOnce(req, fetcher, false);
    }
    throw err;
  }
}

/* ---------- Public ---------- */

export function streamChat(req: ChatRequest, fetcher: Fetcher): Promise<ChatResponse> {
  return providerMeta(req.settings.provider).protocol === 'anthropic' ? anthropicChat(req, fetcher) : openaiChat(req, fetcher);
}

async function getJson(settings: AiSettings, fetcher: Fetcher, url: string, headers: Record<string, string>): Promise<any> {
  let res: Response;
  try {
    res = await fetcher(url, { method: 'GET', headers });
  } catch (err) {
    throw networkError(settings, err);
  }
  if (!res.ok) throw await httpError(settings, res);
  return res.json();
}

export async function listModels(settings: AiSettings, key: string | null, fetcher: Fetcher): Promise<AiModel[]> {
  const meta = providerMeta(settings.provider);
  let models: AiModel[];
  if (meta.protocol === 'anthropic') {
    const json: any = await getJson(settings, fetcher, `${anthropicBase(settings.baseUrl)}/v1/models?limit=100`, anthropicHeaders(key));
    models = (json?.data ?? []).map((m: any) => ({ id: String(m.id), label: m.display_name ? `${m.display_name} (${m.id})` : String(m.id) }));
  } else {
    try {
      const json: any = await getJson(settings, fetcher, `${openaiBase(settings.baseUrl)}/models`, openaiHeaders(key));
      models = (json?.data ?? []).map((m: any) => ({ id: String(m.id), label: String(m.id) }));
    } catch (err) {
      if (meta.id !== 'ollama') throw err;
      const json: any = await getJson(settings, fetcher, `${openaiBase(settings.baseUrl).replace(/\/v1$/, '')}/api/tags`, {});
      models = (json?.models ?? []).map((m: any) => ({ id: String(m.name), label: String(m.name) }));
    }
  }
  return models.filter((m) => m.id).sort((a, b) => a.id.localeCompare(b.id));
}

/** One tiny request with the current settings, to prove the key, URL and model all work. */
export async function testConnection(settings: AiSettings, key: string | null, fetcher: Fetcher): Promise<string> {
  const res = await streamChat(
    { settings, key, system: 'You are a connection test.', messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word OK.' }] }], tools: [], maxTokens: 16 },
    fetcher,
  );
  return res.text.trim() || 'Connected (the model sent an empty reply).';
}
