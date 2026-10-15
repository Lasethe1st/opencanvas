/** Encrypted secrets (AI keys, Savee tokens) and AI settings, kept in the app's user data folder. Secrets never reach the renderer. */
import fs from 'node:fs';
import path from 'node:path';
import { AI_PROVIDERS, defaultAiSettings, providerMeta, validateBaseUrl, type AiProviderKind, type AiSettings } from '../../shared/ai';

/** Electron's safeStorage in the app; a fake in tests. */
export interface Cipher {
  available(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

export class SecretStoreError extends Error {}

export const ENCRYPTION_UNAVAILABLE =
  'This computer has no secure key storage available to OpenCanvas, so keys can’t be saved. On Linux, install and unlock a keyring (GNOME Keyring or KWallet). Local models through Ollama or LM Studio work without a key.';

export class SecretStore {
  /** Values saved during this session, so redaction also covers secrets that were just replaced. */
  private seen = new Set<string>();

  constructor(
    private file: string,
    private cipher: Cipher,
  ) {}

  available(): boolean {
    return this.cipher.available();
  }

  private read(): Record<string, string> {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  private write(data: Record<string, string>) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  has(name: string): boolean {
    return typeof this.read()[name] === 'string';
  }

  get(name: string): string | null {
    const value = this.read()[name];
    if (typeof value !== 'string' || !this.cipher.available()) return null;
    try {
      const plain = this.cipher.decrypt(Buffer.from(value, 'base64'));
      this.seen.add(plain);
      return plain;
    } catch {
      return null;
    }
  }

  set(name: string, plain: string) {
    if (!this.cipher.available()) throw new SecretStoreError(ENCRYPTION_UNAVAILABLE);
    this.seen.add(plain);
    this.write({ ...this.read(), [name]: this.cipher.encrypt(plain).toString('base64') });
  }

  delete(name: string) {
    const data = this.read();
    if (!(name in data)) return;
    delete data[name];
    this.write(data);
  }

  /** Every secret this store knows about, for scrubbing text that leaves the main process. */
  secrets(): string[] {
    for (const name of Object.keys(this.read())) this.get(name);
    return [...this.seen];
  }
}

const SECRET_PATTERNS = [/\bsk-[A-Za-z0-9_-]{12,}/g, /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, /\b(api[_-]?key|access_token|refresh_token)(["'=:\s]+)[A-Za-z0-9._~+/=-]{8,}/gi];

/** Removes known secrets and anything shaped like a key or bearer token. */
export function redact(text: string, secrets: string[] = []): string {
  let out = text;
  for (const secret of secrets) if (secret && secret.length >= 6) out = out.split(secret).join('[redacted]');
  out = out.replace(SECRET_PATTERNS[0], '[redacted]');
  out = out.replace(SECRET_PATTERNS[1], 'Bearer [redacted]');
  out = out.replace(SECRET_PATTERNS[2], (_m, name, sep) => `${name}${sep}[redacted]`);
  return out;
}

export const aiKeyName = (provider: AiProviderKind) => `ai:${provider}`;

export function normalizeAiSettings(raw: unknown): AiSettings {
  const r = (raw ?? {}) as Partial<AiSettings>;
  const provider = AI_PROVIDERS.some((p) => p.id === r.provider) ? (r.provider as AiProviderKind) : defaultAiSettings().provider;
  const model = typeof r.model === 'string' ? r.model.trim().slice(0, 200) : '';
  let baseUrl = typeof r.baseUrl === 'string' ? r.baseUrl.trim() : providerMeta(provider).defaultBaseUrl;
  if (baseUrl) {
    try {
      baseUrl = validateBaseUrl(baseUrl);
    } catch {
      baseUrl = providerMeta(provider).defaultBaseUrl;
    }
  }
  return { provider, model, baseUrl };
}

export function readAiSettings(file: string): AiSettings {
  try {
    return normalizeAiSettings(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return defaultAiSettings();
  }
}

export function writeAiSettings(file: string, settings: AiSettings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

/** Why the settings can't be used yet, or null when they can. */
export function aiNotReadyReason(settings: AiSettings, hasKey: boolean): string | null {
  const meta = providerMeta(settings.provider);
  if (!settings.baseUrl) return 'Enter the server URL in Settings › AI.';
  if (meta.needsKey && !hasKey) return `Add your ${meta.label} API key in Settings › AI.`;
  if (!settings.model) return 'Choose a model in Settings › AI.';
  return null;
}
