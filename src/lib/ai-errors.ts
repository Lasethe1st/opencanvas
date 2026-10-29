/** Rewrites technical AI failures into a short reply-style sentence. */
export function humanizeAiError(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return 'Something went wrong on my side. Try sending that again.';

  if (/^stopped\.?$/i.test(text)) return 'Okay — I stopped.';

  const reach = text.match(/^can[’']t reach\s+(.+?)(?:\.|$)/i);
  if (reach) {
    const target = reach[1].replace(/\s+at\s+\S+$/i, '').trim();
    if (/localhost|127\.0\.0\.1|model server|ollama|lm studio/i.test(text)) {
      return `I couldn’t reach ${target || 'your local model'}. Make sure it’s running, then try again.`;
    }
    return `I couldn’t reach ${target || 'the model'} just now. Check your connection (and the server URL in Settings › AI), then try again.`;
  }

  if (/rejected the api key/i.test(text)) {
    return 'That API key was rejected. Double-check it in Settings › AI and try again.';
  }
  if (/couldn[’']t find that model|couldn[’']t find that model or endpoint/i.test(text)) {
    return 'I couldn’t find that model or endpoint. Check the model and server URL in Settings › AI.';
  }
  if (/rate limit/i.test(text)) {
    return 'The model is asking me to slow down. Wait a moment and try again.';
  }
  if (/having trouble \(\d+\)/i.test(text) || /\b5\d\d\b/.test(text)) {
    return 'The model is having a moment. Try again shortly.';
  }
  if (/empty response/i.test(text)) {
    return 'I got an empty reply from the model. Try sending that again.';
  }
  if (/type what you/i.test(text) || /describe the variants/i.test(text)) {
    return text;
  }

  // Already conversational, or unknown — keep as a reply without the alert tone.
  if (/^i\b/i.test(text)) return text;
  return text.replace(/\.\s*$/, '') + '.';
}
