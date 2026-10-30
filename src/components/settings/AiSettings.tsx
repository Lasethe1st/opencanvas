import { Check, CircleAlert, KeyRound, Loader2, RefreshCw, Trash2, Volume2 } from '../../lib/hugeicons';
import { useEffect, useRef, useState } from 'react';
import {
  AI_PROVIDERS,
  DEFAULT_OPENAI_TTS_VOICE,
  DEFAULT_TTS_BACKEND,
  DEFAULT_XAI_TTS_VOICE,
  OPENAI_TTS_VOICES,
  XAI_TTS_VOICES,
  normalizeTtsBackend,
  providerMeta,
  resolveOpenAiTtsVoice,
  resolveTtsBackend,
  resolveXaiTtsVoice,
  type AiModel,
  type AiSettings,
  type AiStatus,
  type AiTtsBackend,
} from '../../../shared/ai';
import { VOICE_SAMPLE_PHRASE } from '../../../shared/voice';
import { api } from '../../lib/api';
import { plural } from '../../lib/plural';
import { setState, toast, useStore } from '../../lib/store';
import { speakText } from '../../lib/voice';
import { setReadAloud, useReadAloud } from '../../lib/read-aloud';
import { Button, InputShell, Notice, cx } from '../../ui/primitives.jsx';
import { ModelLogo } from '../home/ModelLogo';
import { SettingRow, SettingsGroup, Switch } from './parts';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

type Test = { state: 'idle' } | { state: 'running' } | { state: 'ok'; reply: string } | { state: 'failed'; message: string };

/** Settings › AI: provider, server, key and model for the in-app AI. The key is write-only from here. */
export function AiSettingsPanel() {
  const status = useStore((s) => s.aiStatus);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [test, setTest] = useState<Test>({ state: 'idle' });
  const [sampling, setSampling] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const loadSeq = useRef(0);
  const sampleAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!status) void api.ai.status().then((next) => setState({ aiStatus: next }));
  }, [status]);

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const load = () => {
      const all = speechSynthesis.getVoices();
      const en = all.filter((v) => v.lang.toLowerCase().startsWith('en'));
      setBrowserVoices(en.length ? en : all);
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  useEffect(
    () => () => {
      sampleAbort.current?.abort();
      sampleAbort.current = null;
    },
    [],
  );

  const settings = status?.settings;
  useEffect(() => {
    if (!settings) return;
    setBaseUrl(settings.baseUrl);
    setModel(settings.model);
  }, [settings?.provider, settings?.baseUrl, settings?.model]);

  const meta = settings ? providerMeta(settings.provider) : null;
  const canList = !!settings && !!settings.baseUrl && (!meta?.needsKey || !!status?.hasKey);
  const voiceKeys = status?.voiceKeys ?? { openai: false, xai: false };
  const ttsBackendPref = settings ? normalizeTtsBackend(settings.ttsBackend) : DEFAULT_TTS_BACKEND;
  const readAloud = useReadAloud();
  const effectiveTts = settings ? resolveTtsBackend(settings, voiceKeys) : 'browser';

  const loadModels = async () => {
    const seq = ++loadSeq.current;
    setLoadingModels(true);
    setModelsError(null);
    try {
      const list = await api.ai.listModels();
      if (seq === loadSeq.current) setModels(list);
    } catch (err) {
      if (seq === loadSeq.current) {
        setModels(null);
        setModelsError(errorText(err));
      }
    } finally {
      if (seq === loadSeq.current) setLoadingModels(false);
    }
  };

  useEffect(() => {
    setModels(null);
    setModelsError(null);
    setTest({ state: 'idle' });
    if (canList) void loadModels();
  }, [settings?.provider, settings?.baseUrl, status?.hasKey]);

  const apply = async (fn: () => Promise<AiStatus>): Promise<boolean> => {
    try {
      setState({ aiStatus: await fn() });
      return true;
    } catch (err) {
      toast(errorText(err), 'error');
      return false;
    }
  };

  const save = (patch: Partial<AiSettings>) => settings && apply(() => api.ai.setSettings({ ...settings, ...patch }));

  if (!status || !settings || !meta) return <Notice>Loading…</Notice>;

  const encrypted = status.keyStorage === 'encrypted';
  const showKey = meta.needsKey || settings.provider === 'custom';

  const keyPlaceholder = settings.provider === 'anthropic' ? 'sk-ant-…' : settings.provider === 'gemini' ? 'AIza…' : 'sk-…';
  const engineLabel = effectiveTts === 'openai' ? 'OpenAI' : effectiveTts === 'xai' ? 'Grok' : 'This device';

  return (
    <>
      <SettingsGroup
        title="Provider"
        hint={meta.local ? `Start ${meta.label} and download a model first. Pick one that supports tool calling (for example Qwen or Llama 3.1 and later); small models may struggle with bigger changes.` : undefined}
      >
        <div className="sx-row is-stack">
          <div className="ai-providers" role="radiogroup" aria-label="Provider">
            {AI_PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={settings.provider === p.id}
                className={cx('ai-provider', settings.provider === p.id && 'is-active')}
                onClick={() => settings.provider !== p.id && void save({ provider: p.id, baseUrl: p.defaultBaseUrl, model: '' })}
              >
                <span className="ai-provider__logo" aria-hidden>
                  <ModelLogo provider={p.id} className="size-9" />
                </span>
                <span className="ai-provider__name">{p.label}</span>
                <span className="ai-provider__hint">{p.local ? 'Runs locally' : p.needsKey ? 'API key' : 'Your server'}</span>
              </button>
            ))}
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Connection" hint={encrypted && showKey ? `Your key is encrypted with your operating system’s keychain and only used to talk to ${meta.label}. It can’t be shown again; replace it to change it.` : undefined}>
        <SettingRow label="Server" hint="Where requests are sent.">
          <form
            className="sx-inline"
            onSubmit={(e) => {
              e.preventDefault();
              if (baseUrl.trim() !== settings.baseUrl) void save({ baseUrl: baseUrl.trim() });
            }}
          >
            <InputShell>
              <input aria-label="Server URL" placeholder={meta.defaultBaseUrl || 'https://api.example.com/v1'} value={baseUrl} spellCheck={false} onChange={(e) => setBaseUrl(e.target.value)} />
            </InputShell>
            <Button size="sm" type="submit" disabled={baseUrl.trim() === settings.baseUrl}>
              Apply
            </Button>
            {meta.defaultBaseUrl && settings.baseUrl !== meta.defaultBaseUrl && (
              <Button size="sm" variant="ghost" onClick={() => void save({ baseUrl: meta.defaultBaseUrl })}>
                Reset
              </Button>
            )}
          </form>
        </SettingRow>

        {showKey && (
          <SettingRow label={`API key${!meta.needsKey ? ' (optional)' : ''}`} hint={status.hasKey && !replacing && encrypted ? 'Saved and encrypted on this computer.' : 'Stored encrypted on this computer.'}>
            {!encrypted ? (
              <Notice>
                This computer has no secure storage for keys, so OpenCanvas won’t save one. On Linux, install and unlock a keyring such as GNOME Keyring or KWallet. Local models with Ollama or LM Studio work without a key.
              </Notice>
            ) : status.hasKey && !replacing ? (
              <div className="sx-inline">
                <span className="sx-saved">
                  <KeyRound size={14} aria-hidden /> ••••••••
                </span>
                <Button size="sm" onClick={() => setReplacing(true)}>
                  Replace
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} aria-hidden />} onClick={() => void apply(() => api.ai.clearKey())}>
                  Remove
                </Button>
              </div>
            ) : (
              <form
                className="sx-inline"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!key.trim()) return;
                  if (await apply(() => api.ai.setKey(key))) {
                    setKey('');
                    setReplacing(false);
                  }
                }}
              >
                <InputShell>
                  <input type="password" aria-label="API key" placeholder={keyPlaceholder} value={key} autoComplete="off" spellCheck={false} onChange={(e) => setKey(e.target.value)} />
                </InputShell>
                <Button size="sm" variant="primary" type="submit" disabled={!key.trim()}>
                  Save key
                </Button>
                {replacing && (
                  <Button size="sm" variant="ghost" onClick={() => (setReplacing(false), setKey(''))}>
                    Cancel
                  </Button>
                )}
              </form>
            )}
          </SettingRow>
        )}

        <SettingRow
          label="Model"
          hint={
            modelsError ? (
              <span className="sx-warn">{modelsError} You can still type a model name.</span>
            ) : models ? (
              models.length ? `${plural(models.length, 'model', 'models')} available.` : 'The server didn’t list any models. Type a name instead.'
            ) : (
              'Choose from the list or type a name.'
            )
          }
        >
          <form
            className="sx-inline"
            onSubmit={(e) => {
              e.preventDefault();
              if (model.trim() !== settings.model) void save({ model: model.trim() });
            }}
          >
            <InputShell>
              <input
                aria-label="Model"
                list="oc-ai-models"
                placeholder={loadingModels ? 'Loading models…' : 'Model name'}
                value={model}
                spellCheck={false}
                onChange={(e) => {
                  const next = e.target.value;
                  setModel(next);
                  // Picking from the list saves straight away; typed names save with Apply.
                  if (models?.some((m) => m.id === next) && next !== settings.model) void save({ model: next });
                }}
              />
            </InputShell>
            <datalist id="oc-ai-models">
              {models?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label !== m.id ? m.label : undefined}
                </option>
              ))}
            </datalist>
            {canList && (
              <Button size="sm" variant="ghost" aria-label="Reload the model list" title="Reload the model list" disabled={loadingModels} icon={loadingModels ? <Loader2 size={13} className="ai-spin" aria-hidden /> : <RefreshCw size={13} aria-hidden />} onClick={() => void loadModels()} />
            )}
            <Button size="sm" type="submit" disabled={model.trim() === settings.model}>
              Apply
            </Button>
          </form>
        </SettingRow>

        <SettingRow
          label="Connection test"
          hint={
            test.state === 'ok' ? (
              <span className="ai-test is-ok"><Check size={13} aria-hidden /> Connected. The model replied “{test.reply.slice(0, 60)}”.</span>
            ) : test.state === 'failed' ? (
              <span className="ai-test is-failed"><CircleAlert size={13} aria-hidden /> {test.message}</span>
            ) : status.ready ? (
              'Ready. Requests to cloud providers are billed to your account with them.'
            ) : (
              <span className="sx-warn">{status.reason}</span>
            )
          }
        >
          <Button
            size="sm"
            disabled={!status.ready || test.state === 'running'}
            icon={test.state === 'running' ? <Loader2 size={13} className="ai-spin" /> : undefined}
            onClick={async () => {
              setTest({ state: 'running' });
              try {
                setTest({ state: 'ok', reply: await api.ai.test() });
              } catch (err) {
                setTest({ state: 'failed', message: errorText(err) });
              }
            }}
          >
            Test connection
          </Button>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title="Voice"
        hint={
          effectiveTts === 'browser'
            ? voiceKeys.openai || voiceKeys.xai
              ? 'Using this device’s speech. Switch the engine to OpenAI or Grok to hear a cloud voice.'
              : 'Add an OpenAI or Grok API key (switch provider above, save the key, then switch back) to unlock cloud voices.'
            : `Spoken replies use ${engineLabel} (works even when chat is another model).`
        }
      >
        <SettingRow label="Speech engine" hint="Who speaks the replies.">
          <InputShell>
            <select aria-label="Speech engine" value={ttsBackendPref} onChange={(e) => void save({ ttsBackend: e.target.value as AiTtsBackend })}>
              <option value="auto">Auto (recommended)</option>
              <option value="openai" disabled={!voiceKeys.openai}>
                OpenAI{voiceKeys.openai ? '' : ' — add key'}
              </option>
              <option value="xai" disabled={!voiceKeys.xai}>
                Grok{voiceKeys.xai ? '' : ' — add key'}
              </option>
              <option value="browser">This device</option>
            </select>
          </InputShell>
        </SettingRow>
        <SettingRow label="Voice" hint={`Currently ${engineLabel}.`}>
          <div className="sx-inline">
            <InputShell>
              {effectiveTts === 'openai' ? (
                <select
                  aria-label="OpenAI voice"
                  value={resolveOpenAiTtsVoice(settings)}
                  onChange={(e) => void save({ ttsBackend: ttsBackendPref === 'auto' ? 'openai' : ttsBackendPref, ttsVoices: { ...settings.ttsVoices, openai: e.target.value || DEFAULT_OPENAI_TTS_VOICE } })}
                >
                  {OPENAI_TTS_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              ) : effectiveTts === 'xai' ? (
                <select
                  aria-label="Grok voice"
                  value={resolveXaiTtsVoice(settings)}
                  onChange={(e) => void save({ ttsBackend: ttsBackendPref === 'auto' ? 'xai' : ttsBackendPref, ttsVoices: { ...settings.ttsVoices, xai: e.target.value || DEFAULT_XAI_TTS_VOICE } })}
                >
                  {XAI_TTS_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {`${v.label} — ${v.hint}`}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  aria-label="Device voice"
                  value={settings.ttsVoices?.browser ?? ''}
                  onChange={(e) => {
                    const browser = e.target.value;
                    const next = { ...settings.ttsVoices };
                    if (browser) next.browser = browser;
                    else delete next.browser;
                    void save({ ttsBackend: 'browser', ttsVoices: Object.keys(next).length ? next : undefined });
                  }}
                >
                  <option value="">Auto (recommended)</option>
                  {browserVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}
                      {v.lang ? ` (${v.lang})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </InputShell>
            <Button
              size="sm"
              disabled={sampling}
              icon={sampling ? <Loader2 size={13} className="ai-spin" /> : <Volume2 size={13} />}
              onClick={async () => {
                sampleAbort.current?.abort();
                const ac = new AbortController();
                sampleAbort.current = ac;
                setSampling(true);
                try {
                  await speakText(VOICE_SAMPLE_PHRASE, ac.signal);
                } catch (err) {
                  if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
                  toast(errorText(err), 'error');
                } finally {
                  if (sampleAbort.current === ac) {
                    sampleAbort.current = null;
                    setSampling(false);
                  }
                }
              }}
            >
              Play sample
            </Button>
          </div>
        </SettingRow>
        <SettingRow label="Read replies aloud" hint="Speak each reply as soon as it finishes. You can also use the speaker button on any reply.">
          <Switch label="Read replies aloud" checked={readAloud} onChange={setReadAloud} />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
