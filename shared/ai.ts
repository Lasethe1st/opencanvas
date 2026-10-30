/** In-app AI: provider settings and the events a turn streams to the editor. Keys never leave the main process. */

export type AiProviderKind = 'anthropic' | 'openai' | 'gemini' | 'xai' | 'ollama' | 'lmstudio' | 'custom';

export interface AiProviderMeta {
  id: AiProviderKind;
  label: string;
  /** Short product name for the composer (Claude, ChatGPT, Gemini, Grok…). */
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
  { id: 'gemini', label: 'Google Gemini', product: 'Gemini', protocol: 'openai', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true, local: false },
  { id: 'xai', label: 'xAI', product: 'Grok', protocol: 'openai', defaultBaseUrl: 'https://api.x.ai/v1', needsKey: true, local: false },
  { id: 'ollama', label: 'Ollama', product: 'Ollama', protocol: 'openai', defaultBaseUrl: 'http://localhost:11434/v1', needsKey: false, local: true },
  { id: 'lmstudio', label: 'LM Studio', product: 'LM Studio', protocol: 'openai', defaultBaseUrl: 'http://localhost:1234/v1', needsKey: false, local: true },
  { id: 'custom', label: 'Other OpenAI-compatible', product: 'Custom', protocol: 'openai', defaultBaseUrl: '', needsKey: false, local: false },
];

export const providerMeta = (id: AiProviderKind): AiProviderMeta => AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];

/** How hard the in-app model should work on a turn (maps to reply budget). */
export type AiThinkingEffort = 'low' | 'medium' | 'high';

/** Preferred TTS voices, kept per backend so switching providers remembers each choice. */
export type AiTtsVoices = {
  /** OpenAI Speech API `voice` (e.g. nova). */
  openai?: string;
  /** xAI TTS `voice_id` (e.g. eve). */
  xai?: string;
  /** Browser `speechSynthesis` voiceURI when provider TTS isn’t used. */
  browser?: string;
};

/**
 * Which engine speaks replies. Independent of the chat model provider so Claude
 * users can still use OpenAI/Grok TTS when those keys are stored.
 * `auto` picks openai/xai when the chat provider is one of those, else the first
 * available cloud key, else the device.
 */
export type AiTtsBackend = 'auto' | 'openai' | 'xai' | 'browser';

export const DEFAULT_OPENAI_TTS_VOICE = 'nova';
export const DEFAULT_XAI_TTS_VOICE = 'eve';
export const DEFAULT_TTS_BACKEND: AiTtsBackend = 'auto';

/** Classic OpenAI `tts-1` / `tts-1-hd` voices. */
export const OPENAI_TTS_VOICES = [
  { id: 'alloy', label: 'Alloy' },
  { id: 'echo', label: 'Echo' },
  { id: 'fable', label: 'Fable' },
  { id: 'onyx', label: 'Onyx' },
  { id: 'nova', label: 'Nova' },
  { id: 'shimmer', label: 'Shimmer' },
] as const;

/** Built-in xAI TTS voices (docs.x.ai). `eve` is the default. */
export const XAI_TTS_VOICES = [
  { id: 'eve', label: 'Eve', hint: 'Energetic, British' },
  { id: 'ara', label: 'Ara', hint: 'Warm and friendly' },
  { id: 'leo', label: 'Leo', hint: 'Authoritative, British' },
  { id: 'rex', label: 'Rex', hint: 'Confident and clear' },
  { id: 'sal', label: 'Sal', hint: 'Smooth and balanced' },
  { id: 'carina', label: 'Carina', hint: 'Soft, empathetic' },
  { id: 'luna', label: 'Luna', hint: 'Gentle, nurturing' },
  { id: 'iris', label: 'Iris', hint: 'Friendly, upbeat' },
  { id: 'helios', label: 'Helios', hint: 'Energetic, versatile' },
  { id: 'aurora', label: 'Aurora', hint: 'Serene, steady' },
  { id: 'atlas', label: 'Atlas', hint: 'Confident, commanding' },
  { id: 'ursa', label: 'Ursa', hint: 'Warm, steadfast' },
  { id: 'celeste', label: 'Celeste', hint: 'Compassionate' },
  { id: 'lumen', label: 'Lumen', hint: 'Warm, articulate' },
  { id: 'orion', label: 'Orion', hint: 'Cinematic narration' },
  { id: 'altair', label: 'Altair', hint: 'Elegant, refined' },
  { id: 'perseus', label: 'Perseus', hint: 'Strong, trustworthy' },
  { id: 'lux', label: 'Lux', hint: 'Grounded, calm' },
  { id: 'liora', label: 'Liora', hint: 'Calm, luminous' },
  { id: 'cosmo', label: 'Cosmo', hint: 'Bright, curious' },
  { id: 'sirius', label: 'Sirius', hint: 'Quick-witted' },
  { id: 'castor', label: 'Castor', hint: 'Down-to-earth' },
  { id: 'naksh', label: 'Naksh', hint: 'Thoughtful, Indian accent' },
  { id: 'rigel', label: 'Rigel', hint: 'Professional, Australian' },
  { id: 'kepler', label: 'Kepler', hint: 'Inventive' },
  { id: 'zenith', label: 'Zenith', hint: 'Sharp, focused' },
  { id: 'helix', label: 'Helix', hint: 'Bold, dynamic' },
  { id: 'zagan', label: 'Zagan', hint: 'Dramatic narration' },
] as const;

const OPENAI_TTS_VOICE_IDS = new Set<string>(OPENAI_TTS_VOICES.map((v) => v.id));

export function resolveOpenAiTtsVoice(settings: AiSettings): string {
  const id = settings.ttsVoices?.openai?.trim().toLowerCase();
  return id && OPENAI_TTS_VOICE_IDS.has(id) ? id : DEFAULT_OPENAI_TTS_VOICE;
}

export function resolveXaiTtsVoice(settings: AiSettings): string {
  const id = settings.ttsVoices?.xai?.trim().toLowerCase();
  if (id && /^[a-z0-9_-]{1,64}$/.test(id)) return id;
  return DEFAULT_XAI_TTS_VOICE;
}

export function normalizeTtsBackend(raw: unknown): AiTtsBackend {
  return raw === 'openai' || raw === 'xai' || raw === 'browser' || raw === 'auto' ? raw : DEFAULT_TTS_BACKEND;
}

/** Effective TTS engine after resolving `auto` against stored keys. */
export function resolveTtsBackend(
  settings: AiSettings,
  keys: { openai: boolean; xai: boolean },
): Exclude<AiTtsBackend, 'auto'> {
  const pref = normalizeTtsBackend(settings.ttsBackend);
  if (pref === 'openai') return keys.openai ? 'openai' : 'browser';
  if (pref === 'xai') return keys.xai ? 'xai' : 'browser';
  if (pref === 'browser') return 'browser';
  // auto
  if (settings.provider === 'openai' && keys.openai) return 'openai';
  if (settings.provider === 'xai' && keys.xai) return 'xai';
  if (keys.openai) return 'openai';
  if (keys.xai) return 'xai';
  return 'browser';
}

export interface AiSettings {
  provider: AiProviderKind;
  model: string;
  baseUrl: string;
  /** Optional — defaults to medium when omitted. */
  thinkingEffort?: AiThinkingEffort;
  /** Preferred speak voices per TTS backend. */
  ttsVoices?: AiTtsVoices;
  /** Speech engine for the orb / samples (defaults to auto). */
  ttsBackend?: AiTtsBackend;
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
  /** Which cloud TTS keys are on disk (chat provider can differ). */
  voiceKeys: { openai: boolean; xai: boolean };
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

/** Optional root so soft project switches can ignore stale turns. */
type AiEventBase = { turnId: string; projectRoot?: string };

export type AiEvent =
  | (AiEventBase & { type: 'start'; request: string })
  | (AiEventBase & { type: 'text'; delta: string })
  | (AiEventBase & { type: 'reasoning'; delta: string })
  | (AiEventBase & { type: 'step'; stepId: string; index: number; label?: string })
  | (AiEventBase & { type: 'tool-start'; callId: string; tool: string; summary: string; parentId?: string; startedAt?: number })
  | (AiEventBase & { type: 'tool-end'; callId: string; ok: boolean; summary: string; elementId?: string | null; endedAt?: number })
  | (AiEventBase & { type: 'question'; question: AiQuestion })
  | (AiEventBase & { type: 'approval'; approval: AiApproval })
  | (AiEventBase & { type: 'resolved'; id: string; answer: string })
  | (AiEventBase & { type: 'done'; stopped: boolean })
  | (AiEventBase & { type: 'error'; message: string });

/** The editor's view of a conversation. */
export type AiChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string; done: boolean }
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
