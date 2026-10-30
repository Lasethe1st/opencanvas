/** Mic capture, browser STT fallback, and provider TTS playback for the home voice orb. */
import type { VoiceCapabilities, VoiceSpeakResult } from '../../shared/voice';
import { api } from './api';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function SpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function browserSpeechAvailable(): boolean {
  return !!SpeechRecognitionCtor();
}

export function micCaptureAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const i = dataUrl.indexOf(',');
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
    };
    reader.onerror = () => reject(new Error('Couldn’t read the recording.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Record from the mic until silence after speech, or max duration.
 * Used for provider STT (Whisper / xAI) — Chromium SpeechRecognition is unreliable in Electron.
 */
export async function recordUtterance(opts?: {
  signal?: AbortSignal;
  maxMs?: number;
  silenceMs?: number;
}): Promise<{ base64: string; mime: string }> {
  if (!micCaptureAvailable()) throw new Error('Microphone isn’t available.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const maxMs = opts?.maxMs ?? 12_000;
  const silenceMs = opts?.silenceMs ?? 1100;

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const levels = new Uint8Array(analyser.frequencyBinCount);

  let heardSpeech = false;
  let silenceStarted = 0;
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    opts?.signal?.removeEventListener('abort', onAbort);
    stream.getTracks().forEach((t) => t.stop());
    void audioCtx.close().catch(() => undefined);
  };

  const stopRecording = () =>
    new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      recorder.onerror = () => reject(new Error('Recording failed.'));
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        else resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

  const onAbort = () => {
    cleanup();
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {
      /* ignore */
    }
  };

  return new Promise((resolve, reject) => {
    opts?.signal?.addEventListener('abort', onAbort, { once: true });

    const finish = async () => {
      try {
        const blob = await stopRecording();
        cleanup();
        if (opts?.signal?.aborted) {
          reject(new DOMException('Stopped.', 'AbortError'));
          return;
        }
        if (!blob.size) {
          reject(new Error('Didn’t catch that — try again.'));
          return;
        }
        resolve({ base64: await blobToBase64(blob), mime: blob.type || 'audio/webm' });
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const tick = () => {
      if (opts?.signal?.aborted) return;
      analyser.getByteTimeDomainData(levels);
      let sum = 0;
      for (let i = 0; i < levels.length; i++) {
        const v = (levels[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / levels.length);
      if (rms > 0.04) {
        heardSpeech = true;
        silenceStarted = 0;
      } else if (heardSpeech) {
        if (!silenceStarted) silenceStarted = performance.now();
        else if (performance.now() - silenceStarted >= silenceMs) {
          void finish();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    recorder.start(200);
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => void finish(), maxMs);
  });
}

export async function listenWithProvider(signal?: AbortSignal): Promise<string> {
  const clip = await recordUtterance({ signal });
  if (signal?.aborted) throw new DOMException('Stopped.', 'AbortError');
  return api.ai.voiceTranscribe(clip.base64, clip.mime);
}

/** Listen until the user pauses (final result) or `signal` aborts. */
export function listenOnceBrowser(opts?: { lang?: string; signal?: AbortSignal }): Promise<string> {
  const Ctor = SpeechRecognitionCtor();
  if (!Ctor) return Promise.reject(new Error('Speech recognition isn’t available in this browser.'));

  return new Promise((resolve, reject) => {
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = opts?.lang || navigator.language || 'en-US';
    let finalText = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      opts?.signal?.removeEventListener('abort', onAbort);
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      } catch {
        /* already stopped */
      }
      fn();
    };

    const onAbort = () => finish(() => reject(new DOMException('Stopped.', 'AbortError')));

    rec.onresult = (ev) => {
      for (let i = 0; i < ev.results.length; i++) {
        const row = ev.results[i];
        if (row.isFinal) finalText += row[0].transcript;
      }
    };

    rec.onerror = (ev) => {
      if (ev.error === 'aborted' || ev.error === 'no-speech') {
        finish(() => {
          const text = finalText.trim();
          if (text) resolve(text);
          else reject(new Error(ev.error === 'no-speech' ? 'Didn’t catch that — try again.' : 'Stopped.'));
        });
        return;
      }
      finish(() => reject(new Error(speechErrorMessage(ev.error))));
    };

    rec.onend = () => {
      finish(() => {
        const text = finalText.trim();
        if (text) resolve(text);
        else reject(new Error('Didn’t catch that — try again.'));
      });
    };

    opts?.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      rec.start();
    } catch (err) {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
}

/** @deprecated use listenOnceBrowser or listenForUtterance */
export const listenOnce = listenOnceBrowser;

function speechErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'Microphone permission is blocked. Allow it for OpenCanvas and try again.';
    case 'audio-capture':
      return 'No microphone found.';
    case 'network':
      return 'Built-in speech recognition isn’t available here. Use OpenAI or Grok in Settings › AI for voice.';
    default:
      return `Speech recognition failed (${code}).`;
  }
}

/** Prefer provider STT when available; fall back to browser recognition. */
export async function listenForUtterance(caps: VoiceCapabilities | null, signal?: AbortSignal): Promise<string> {
  const providerStt = caps?.stt === 'provider';

  if (providerStt) {
    return listenWithProvider(signal);
  }

  if (!browserSpeechAvailable()) {
    throw new Error('Voice listening needs OpenAI or Grok in Settings › AI (built-in speech doesn’t work in the desktop app).');
  }

  try {
    return await listenOnceBrowser({ signal });
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (/network|isn’t available here/i.test(msg)) {
      throw new Error('Built-in speech doesn’t work here. Switch the AI provider to OpenAI or Grok in Settings › AI.');
    }
    throw err;
  }
}

/** Prefer a natural local voice over the platform default (often flat/robotic). */
function pickBrowserVoice(preferredVoiceURI?: string | null): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (preferredVoiceURI) {
    const chosen = voices.find((v) => v.voiceURI === preferredVoiceURI);
    if (chosen) return chosen;
  }
  const prefer = [/google.*english/i, /microsoft.*natural/i, /samantha/i, /karen/i, /moira/i, /jenny/i, /aria/i, /en[-_]?us/i, /^en/i];
  for (const re of prefer) {
    const hit = voices.find((v) => re.test(`${v.name} ${v.lang}`));
    if (hit) return hit;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith('en')) ?? voices[0] ?? null;
}

/** Chromium drops an utterance that nothing references, and then never fires `end`. */
let liveUtterance: SpeechSynthesisUtterance | null = null;

export function speakWithBrowser(text: string, signal?: AbortSignal, preferredVoiceURI?: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof speechSynthesis === 'undefined') {
      reject(new Error('Speech synthesis isn’t available here.'));
      return;
    }
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    liveUtterance = utter;
    utter.rate = 0.98;
    utter.pitch = 1;
    const voice = pickBrowserVoice(preferredVoiceURI);
    if (voice) utter.voice = voice;
    const onAbort = () => {
      speechSynthesis.cancel();
      reject(new DOMException('Stopped.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    utter.onend = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    utter.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Couldn’t play speech.'));
    };
    // Voices often load async; retry once after voiceschanged.
    const speak = () => {
      speechSynthesis.resume();
      speechSynthesis.speak(utter);
    };
    if (!voice && speechSynthesis.getVoices().length === 0) {
      const once = () => {
        speechSynthesis.removeEventListener('voiceschanged', once);
        const v = pickBrowserVoice(preferredVoiceURI);
        if (v) utter.voice = v;
        speak();
      };
      speechSynthesis.addEventListener('voiceschanged', once);
      setTimeout(() => {
        speechSynthesis.removeEventListener('voiceschanged', once);
        if (!signal?.aborted) speak();
      }, 250);
      return;
    }
    speak();
  });
}

async function preferredBrowserVoiceURI(): Promise<string | null> {
  try {
    return (await api.ai.status()).settings.ttsVoices?.browser ?? null;
  } catch {
    return null;
  }
}

async function playAudioBase64(mime: string, base64: string, signal?: AbortSignal): Promise<void> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  try {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        audio.pause();
        reject(new DOMException('Stopped.', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      audio.onended = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      audio.onerror = () => {
        signal?.removeEventListener('abort', onAbort);
        reject(new Error('Couldn’t play the reply audio.'));
      };
      void audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function speakResult(result: VoiceSpeakResult, signal?: AbortSignal, preferredVoiceURI?: string | null): Promise<void> {
  if (result.kind === 'audio') return playAudioBase64(result.mime, result.base64, signal);
  return speakWithBrowser(result.text, signal, preferredVoiceURI);
}

export async function speakText(text: string, signal?: AbortSignal): Promise<void> {
  const browserVoiceURI = await preferredBrowserVoiceURI();
  // Do not fall back to device (Windows) voices when cloud TTS fails — that hides the real error.
  const result = await api.ai.voiceSpeak(text);
  if (signal?.aborted) throw new DOMException('Stopped.', 'AbortError');
  await speakResult(result, signal, browserVoiceURI);
}
