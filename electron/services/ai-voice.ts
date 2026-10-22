/** Provider voice (STT/TTS) using the stored AI key. Keys never leave the main process. */
import { File as NodeFile } from 'node:buffer';
import type { AiSettings } from '../../shared/ai';
import { providerMeta } from '../../shared/ai';
import type { VoiceCapabilities, VoiceChatMessage, VoiceSpeakResult } from '../../shared/voice';
import { streamChat, type Fetcher } from './ai-providers';

const VOICE_SYSTEM = `You're chatting out loud inside OpenCanvas — think friend on a call, not a phone menu.
Keep answers to 1–3 spoken sentences. Sound warm and natural: contractions, everyday words, vary rhythm.
No markdown, bullets, numbered lists, code, or “As an AI…”. Don't narrate tools or steps.
If they want to build something, give one concrete next move and at most one short question.`;

export function voiceCapabilities(settings: AiSettings, hasKey: boolean): VoiceCapabilities {
  const meta = providerMeta(settings.provider);
  const providerVoice = (settings.provider === 'openai' || settings.provider === 'xai') && hasKey;
  return {
    provider: settings.provider,
    label: meta.product,
    // Chromium's built-in SpeechRecognition often fails in Electron (`network` error).
    // Prefer the provider's STT whenever the key supports it.
    stt: providerVoice ? 'provider' : 'browser',
    tts: providerVoice ? 'provider' : 'browser',
  };
}

function openaiBase(settings: AiSettings): string {
  return (settings.baseUrl || providerMeta('openai').defaultBaseUrl).replace(/\/$/, '');
}

function xaiBase(settings: AiSettings): string {
  return (settings.baseUrl || providerMeta('xai').defaultBaseUrl).replace(/\/$/, '');
}

async function bufferToBase64(buf: ArrayBuffer): Promise<string> {
  return Buffer.from(buf).toString('base64');
}

/** Transcribe a short mic clip (base64) with OpenAI Whisper or xAI STT. */
export async function voiceTranscribe(
  audioBase64: string,
  mime: string,
  settings: AiSettings,
  key: string | null,
  fetcher: Fetcher,
): Promise<string> {
  if (!key) throw new Error('Add your API key in Settings › AI to use voice.');
  if (!audioBase64.trim()) throw new Error('No audio captured.');

  const bytes = Buffer.from(audioBase64, 'base64');
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('wav') ? 'wav' : 'webm';
  const filename = `voice.${ext}`;
  const blobType = mime.split(';')[0] || 'audio/webm';
  const file = new NodeFile([bytes], filename, { type: blobType });

  if (settings.provider === 'openai') {
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

  if (settings.provider === 'xai') {
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

  throw new Error(`${providerMeta(settings.provider).label} doesn’t support speech-to-text yet. Switch to OpenAI or Grok, or use a Chromium build with speech recognition.`);
}

/** Synthesize speech with the selected provider when supported; otherwise ask the renderer to use the browser. */
export async function voiceSpeak(
  text: string,
  settings: AiSettings,
  key: string | null,
  fetcher: Fetcher,
): Promise<VoiceSpeakResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Nothing to speak.');
  const caps = voiceCapabilities(settings, !!key);
  if (caps.tts === 'browser' || !key) return { kind: 'browser', text: trimmed };

  if (settings.provider === 'openai') {
    const res = await fetcher(`${openaiBase(settings)}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // HD + nova reads warmer than tts-1/alloy (less “robot announcer”).
        model: 'tts-1-hd',
        voice: 'nova',
        input: trimmed.slice(0, 4096),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(readableVoiceError('OpenAI', res.status, body));
    }
    return { kind: 'audio', mime: 'audio/mpeg', base64: await bufferToBase64(await res.arrayBuffer()) };
  }

  if (settings.provider === 'xai') {
    const res = await fetcher(`${xaiBase(settings)}/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: trimmed.slice(0, 60000),
        voice_id: 'eve',
        language: 'en',
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(readableVoiceError('xAI', res.status, body));
    }
    const mime = res.headers.get('content-type')?.split(';')[0] || 'audio/mpeg';
    return { kind: 'audio', mime, base64: await bufferToBase64(await res.arrayBuffer()) };
  }

  return { kind: 'browser', text: trimmed };
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
