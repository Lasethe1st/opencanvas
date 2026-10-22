/** In-app AI: provider settings and the events a turn streams to the editor. Keys never leave the main process. */

export type AiProviderKind = 'anthropic' | 'openai' | 'xai' | 'ollama' | 'lmstudio' | 'custom';

export interface AiProviderMeta {
  id: AiProviderKind;
  label: string;
  /** Short product name for the composer (Claude, ChatGPT, Grok…). */
  product: string;
  /** Wire protocol the provider speaks. */
  protocol: 'anthropic' | 'openai';
  defaultBaseUrl: string;
  needsKey: boolean;
  /** Runs on this computer. */
  local: boolean;
}

export const AI_PROVIDERS: AiProviderMeta[] = [
  { id: 'anthropic', label: 'Anthropic', product: 'Claude', protocol: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com', needsKey: true, local: false },
  { id: 'openai', label: 'OpenAI', product: 'ChatGPT', protocol: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', needsKey: true, local: false },
  { id: 'xai', label: 'xAI', product: 'Grok', protocol: 'openai', defaultBaseUrl: 'https://api.x.ai/v1', needsKey: true, local: false },
  { id: 'ollama', label: 'Ollama', product: 'Ollama', protocol: 'openai', defaultBaseUrl: 'http://localhost:11434/v1', needsKey: false, local: true },
  { id: 'lmstudio', label: 'LM Studio', product: 'LM Studio', protocol: 'openai', defaultBaseUrl: 'http://localhost:1234/v1', needsKey: false, local: true },
  { id: 'custom', label: 'Other OpenAI-compatible', product: 'Custom', protocol: 'openai', defaultBaseUrl: '', needsKey: false, local: false },
];

export const providerMeta = (id: AiProviderKind): AiProviderMeta => AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];

/** How hard the in-app model should work on a turn (maps to reply budget). */
export type AiThinkingEffort = 'low' | 'medium' | 'high';

export interface AiSettings {
  provider: AiProviderKind;
  model: string;
  baseUrl: string;
  /** Optional — defaults to medium when omitted. */
  thinkingEffort?: AiThinkingEffort;
}

export const defaultAiSettings = (): AiSettings => ({
  provider: 'anthropic',
  model: '',
  baseUrl: AI_PROVIDERS[0].defaultBaseUrl,
  thinkingEffort: 'medium',
});

export interface AiStatus {
  settings: AiSettings;
  /** A key is stored for the selected provider. The key itself is never sent to the editor. */
  hasKey: boolean;
  /** Settings are complete enough to send a request. */
  ready: boolean;
  /** Why the AI isn't ready, in plain words. */
  reason: string | null;
  keyStorage: 'encrypted' | 'unavailable';
  /** A turn is running. */
  busy: boolean;
}

export interface AiModel {
  id: string;
  label: string;
}

export interface AiQuestion {
  id: string;
  question: string;
  options: string[];
  allowText: boolean;
}

export interface AiApproval {
  id: string;
  tool: string;
  /** Exactly what will happen if allowed. */
  summary: string;
  /** For run_command: the exact command line and the folder it runs in. */
  command?: string;
  cwd?: string;
}

export type AiEvent =
  | { turnId: string; type: 'start'; request: string }
  | { turnId: string; type: 'text'; delta: string }
  | { turnId: string; type: 'tool-start'; callId: string; tool: string; summary: string }
  | { turnId: string; type: 'tool-end'; callId: string; ok: boolean; summary: string; elementId?: string | null }
  | { turnId: string; type: 'question'; question: AiQuestion }
  | { turnId: string; type: 'approval'; approval: AiApproval }
  | { turnId: string; type: 'resolved'; id: string; answer: string }
  | { turnId: string; type: 'done'; stopped: boolean }
  | { turnId: string; type: 'error'; message: string };

/** The editor's view of a conversation. */
export type AiChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; tool: string; summary: string; state: 'running' | 'done' | 'failed'; elementId?: string | null }
  | { kind: 'question'; id: string; question: AiQuestion; answer: string | null }
  | { kind: 'approval'; id: string; approval: AiApproval; answer: string | null }
  | { kind: 'error'; id: string; text: string };

/** Tools the in-app AI must get the user's permission for, every time. */
export const APPROVAL_TOOLS = ['git_commit', 'git_publish', 'go_live', 'import_files', 'run_command'] as const;

/** Accepts https anywhere, and http only to this computer (local model servers). */
export function validateBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a full URL, such as https://api.example.com/v1.');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) {
    if (url.username || url.password) throw new Error('Put the key in the API key field, not in the URL.');
    return value;
  }
  throw new Error('Use https. Plain http is only allowed for servers on this computer (localhost).');
}
