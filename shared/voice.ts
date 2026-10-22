import type { AiProviderKind } from './ai';

/** How mic input is turned into text. */
export type VoiceSttMode = 'browser' | 'provider';

/** How reply text is spoken. */
export type VoiceTtsMode = 'browser' | 'provider';

export type VoiceCapabilities = {
  provider: AiProviderKind;
  /** Product label for status copy (e.g. "Grok", "ChatGPT"). */
  label: string;
  stt: VoiceSttMode;
  tts: VoiceTtsMode;
};

export type VoiceChatMessage = {
  role: 'user' | 'assistant';
  text: string;
};

/** Result of `ai.voiceSpeak` — play bytes, or let the renderer use speechSynthesis. */
export type VoiceSpeakResult =
  | { kind: 'audio'; mime: string; base64: string }
  | { kind: 'browser'; text: string };
