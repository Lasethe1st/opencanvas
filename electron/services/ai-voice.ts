/** Provider voice (STT/TTS) using the stored AI key. Keys never leave the main process. */
import { File as NodeFile } from 'node:buffer';
import type { AiSettings } from '../../shared/ai';
import {
  normalizeTtsBackend,
  providerMeta,
  resolveOpenAiTtsVoice,
  resolveTtsBackend,
  resolveXaiTtsVoice,
} from '../../shared/ai';
import type { VoiceCapabilities, VoiceChatMessage, VoiceSpeakResult } from '../../shared/voice';
import { streamChat, type Fetcher } from './ai-providers';

const VOICE_SYSTEM = `You're chatting out loud inside OpenCanvas — think friend on a call, not a phone menu.
Keep answers to 1–3 spoken sentences. Sound warm and natural: contractions, everyday words, vary rhythm.
No markdown, bullets, numbered lists, code, or “As an AI…”. Don't narrate tools or steps.
If they want to build something, give one concrete next move and at most one short question.`;

export type VoiceKeyFlags = { openai: boolean; xai: boolean };

export function voiceCapabilities(settings: AiSettings, keys: VoiceKeyFlags): VoiceCapabilities {
  const meta = providerMeta(settings.provider);
  const ttsBackend = resolveTtsBackend(settings, keys);
  const sttProvider =
    (settings.provider === 'openai' && keys.openai) || (settings.provider === 'xai' && keys.xai)
      ? settings.provider
      : keys.openai
        ? 'openai'
        : keys.xai
          ? 'xai'
          : null;
  return {
    provider: settings.provider,
    label: ttsBackend === 'openai' ? 'ChatGPT' : ttsBackend === 'xai' ? 'Grok' : meta.product,
    stt: sttProvider ? 'provider' : 'browser',
    tts: ttsBackend === 'browser' ? 'browser' : 'provider',
    ttsBackend,
  };
}

function openaiBase(settings: AiSettings): string {
  // Prefer OpenAI’s default URL when speaking via OpenAI TTS while chat uses another provider.
  if (settings.provider === 'openai' && settings.baseUrl) return settings.baseUrl.replace(/\/$/, '');
  return providerMeta('openai').defaultBaseUrl.replace(/\/$/, '');
}

function xaiBase(settings: AiSettings): string {
  if (settings.provider === 'xai' && settings.baseUrl) return settings.baseUrl.replace(/\/$/, '');
  return providerMeta('xai').defaultBaseUrl.replace(/\/$/, '');
}

async function bufferToBase64(buf: ArrayBuffer): Promise<string> {
  return Buffer.from(buf).toString('base64');
}

function sttBackend(settings: AiSettings, keys: VoiceKeyFlags): 'openai' | 'xai' | null {
  if (settings.provider === 'openai' && keys.openai) return 'openai';
  if (settings.provider === 'xai' && keys.xai) return 'xai';
  if (keys.openai) return 'openai';
  if (keys.xai) return 'xai';
  return null;
}

/** Transcribe a short mic clip (base64) with OpenAI Whisper or xAI STT. */
export async function voiceTranscribe(
  audioBase64: string,
  mime: string,
  settings: AiSettings,
  keys: VoiceKeyFlags,
  getKey: (provider: 'openai' | 'xai') => string | null,
  fetcher: Fetcher,
): Promise<string> {
  if (!audioBase64.trim()) throw new Error('No audio captured.');
  const backend = sttBackend(settings, keys);
  if (!backend) {
    throw new Error('Add an OpenAI or Grok API key in Settings › AI to use voice (built-in speech doesn’t work in the desktop app).');
  }
  const key = getKey(backend);
  if (!key) throw new Error(`Add your ${backend === 'openai' ? 'OpenAI' : 'xAI'} API key in Settings › AI to use voice.`);

  const bytes = Buffer.from(audioBase64, 'base64');
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('wav') ? 'wav' : 'webm';
  const filename = `voice.${ext}`;
  const blobType = mime.split(';')[0] || 'audio/webm';
  const file = new NodeFile([bytes], filename, { type: blobType });

  if (backend === 'openai') {
    const form = new FormData();
    form.append('model', 'whisper-1');
    form.append('language', 'en');
    form.append('file', file);
    const res = await fetcher(`${openaiBase(settings)}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(readableVoiceError('OpenAI', res.status, body));
    }
    const data = (await res.json()) as { text?: string };
    const text = data.text?.trim();
    if (!text) throw new Error('Didn’t catch that — try again.');
    return text;
  }

  const form = new FormData();
  form.append('model', 'grok-voice-transcribe-2.0');
  form.append('language', 'en');
  form.append('file', file);
  const res = await fetcher(`${xaiBase(settings)}/stt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(readableVoiceError('xAI', res.status, body));
  }
  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) throw new Error('Didn’t catch that — try again.');
  return text;
}

/** Synthesize speech with the selected TTS backend; otherwise ask the renderer to use the browser. */
export async function voiceSpeak(
  text: string,
  settings: AiSettings,
  keys: VoiceKeyFlags,
  getKey: (provider: 'openai' | 'xai') => string | null,
  fetcher: Fetcher,
): Promise<VoiceSpeakResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Nothing to speak.');
  const pref = normalizeTtsBackend(settings.ttsBackend);
  const backend = resolveTtsBackend(settings, keys);
  if (backend === 'browser') {
    if (pref === 'openai' || pref === 'xai') {
      throw new Error(
        `Add your ${pref === 'openai' ? 'OpenAI' : 'xAI'} API key in Settings › AI to use that voice.`,
      );
    }
    return { kind: 'browser', text: trimmed };
  }

  const key = getKey(backend);
  if (!key) {
    throw new Error(
      `Add your ${backend === 'openai' ? 'OpenAI' : 'xAI'} API key in Settings › AI to use voice.`,
    );
  }

  if (backend === 'openai') {
    const res = await fetcher(`${openaiBase(settings)}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        voice: resolveOpenAiTtsVoice(settings),
        input: trimmed.slice(0, 4096),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(readableVoiceError('OpenAI', res.status, body));
    }
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength) throw new Error('OpenAI returned empty audio.');
    return { kind: 'audio', mime: 'audio/mpeg', base64: await bufferToBase64(bytes) };
  }

  const res = await fetcher(`${xaiBase(settings)}/tts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: trimmed.slice(0, 60000),
      voice_id: resolveXaiTtsVoice(settings),
      language: 'en',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(readableVoiceError('xAI', res.status, body));
  }
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) throw new Error('xAI returned empty audio.');
  const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/mpeg';
  // Some gateways return JSON errors with a 2xx status; reject those before playback.
  if (mime.includes('json')) {
    const snip = Buffer.from(bytes).toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error(snip ? `xAI voice failed: ${snip}` : 'xAI voice returned JSON instead of audio.');
  }
  return { kind: 'audio', mime: mime.startsWith('audio/') ? mime : 'audio/mpeg', base64: await bufferToBase64(bytes) };
}

/** Short tool-free chat turn for the voice loop. */
export async function voiceReply(
  history: VoiceChatMessage[],
  settings: AiSettings,
  key: string | null,
  fetcher: Fetcher,
  signal?: AbortSignal,
): Promise<string> {
  const messages = history
    .filter((m) => m.text.trim())
    .slice(-12)
    .map((m) =>
      m.role === 'user'
        ? ({ role: 'user' as const, content: [{ type: 'text' as const, text: m.text.trim() }] })
        : ({ role: 'assistant' as const, text: m.text.trim(), toolCalls: [] }),
    );
  if (!messages.length || messages[messages.length - 1]?.role !== 'user') {
    throw new Error('Say something first.');
  }
  const res = await streamChat(
    {
      settings,
      key,
      system: VOICE_SYSTEM,
      messages,
      tools: [],
      maxTokens: 280,
      signal,
    },
    fetcher,
  );
  const text = res.text.trim();
  if (!text) throw new Error('The model sent an empty reply.');
  return text;
}

function readableVoiceError(who: string, status: number, body: string): string {
  const snip = body.replace(/\s+/g, ' ').trim().slice(0, 160);
  if (status === 401 || status === 403) return `${who} rejected the API key for voice. Check Settings › AI.`;
  if (status === 404) return `${who} voice isn’t available on this endpoint. Try browser speech, or update the base URL.`;
  return snip ? `${who} voice failed (${status}): ${snip}` : `${who} voice failed (${status}).`;
}
