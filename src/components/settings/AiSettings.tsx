import { Check, CircleAlert, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AI_PROVIDERS, providerMeta, type AiModel, type AiSettings, type AiStatus } from '../../../shared/ai';
import { api } from '../../lib/api';
import { plural } from '../../lib/plural';
import { setState, toast, useStore } from '../../lib/store';
import { Button, InputShell, Notice, cx } from '../../ui/primitives.jsx';

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
  const loadSeq = useRef(0);

  useEffect(() => {
    if (!status) void api.ai.status().then((next) => setState({ aiStatus: next }));
  }, [status]);

  const settings = status?.settings;
  useEffect(() => {
    if (!settings) return;
    setBaseUrl(settings.baseUrl);
    setModel(settings.model);
  }, [settings?.provider, settings?.baseUrl, settings?.model]);

  const meta = settings ? providerMeta(settings.provider) : null;
  const canList = !!settings && !!settings.baseUrl && (!meta?.needsKey || !!status?.hasKey);

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

  return (
    <div className="mcp-panel ai-settings">
      <div className="git-section">Provider</div>
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
            <span className="ai-provider__name">{p.label}</span>
            <span className="ai-provider__hint">{p.local ? 'Runs on this computer' : p.needsKey ? 'Needs an API key' : 'Your own server'}</span>
          </button>
        ))}
      </div>
      {meta.local && (
        <p className="git-note">
          Start {meta.label} and download a model first. Pick a model that supports tool calling (for example Qwen or Llama 3.1 and later); small models may struggle with bigger changes.
        </p>
      )}

      <div className="git-section">Server</div>
      <form
        className="ai-row"
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

      {showKey && (
        <>
          <div className="git-section">API key{!meta.needsKey && ' (optional)'}</div>
          {!encrypted ? (
            <Notice>
              This computer has no secure storage for keys, so OpenCanvas won’t save one. On Linux, install and unlock a keyring such as GNOME Keyring or KWallet. Local models with Ollama or LM Studio work without a key.
            </Notice>
          ) : status.hasKey && !replacing ? (
            <div className="git-row ai-key-saved">
              <KeyRound size={13} />
              <span className="git-row__main">Key saved, encrypted on this computer</span>
              <button type="button" className="git-link" onClick={() => setReplacing(true)}>
                Replace
              </button>
              <button type="button" className="git-link" onClick={() => void apply(() => api.ai.clearKey())}>
                <Trash2 size={11} aria-hidden />
                Remove
              </button>
            </div>
          ) : (
            <form
              className="ai-row"
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
                <input type="password" aria-label="API key" placeholder={settings.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'} value={key} autoComplete="off" spellCheck={false} onChange={(e) => setKey(e.target.value)} />
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
          {encrypted && <p className="git-note">The key is encrypted with your operating system’s keychain and only used by OpenCanvas to talk to {meta.label}. It can’t be shown again; replace it to change it.</p>}
        </>
      )}

      <div className="git-section">
        Model
        {canList && (
          <button type="button" className="git-link ai-refresh" onClick={() => void loadModels()} disabled={loadingModels} title="Reload the model list">
            {loadingModels ? <Loader2 size={11} className="ai-spin" aria-hidden /> : <RefreshCw size={11} aria-hidden />}
            Reload
          </button>
        )}
      </div>
      <form
        className="ai-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (model.trim() !== settings.model) void save({ model: model.trim() });
        }}
      >
        <InputShell>
          <input
            aria-label="Model"
            list="oc-ai-models"
            placeholder={loadingModels ? 'Loading models…' : 'Choose or type a model name'}
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
        <Button size="sm" type="submit" disabled={model.trim() === settings.model}>
          Apply
        </Button>
      </form>
      {modelsError ? (
        <p className="git-note git-note--warn">{modelsError} You can still type a model name.</p>
      ) : models ? (
        <p className="git-note">{models.length ? `${plural(models.length, 'model', 'models')} available.` : 'The server didn’t list any models. Type a model name instead.'}</p>
      ) : null}

      <div className="git-section">Check</div>
      <div className="ai-row">
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
        <span className={cx('ai-test', test.state === 'ok' && 'is-ok', test.state === 'failed' && 'is-failed')} role="status">
          {test.state === 'ok' && (
            <>
              <Check size={13} aria-hidden /> Connected. The model replied “{test.reply.slice(0, 60)}”.
            </>
          )}
          {test.state === 'failed' && (
            <>
              <CircleAlert size={13} aria-hidden /> {test.message}
            </>
          )}
        </span>
      </div>
      {status.ready ? (
        <p className="git-note">Ready. Open Ask AI in the dock to use it. Requests to cloud providers are billed to your account with them.</p>
      ) : (
        <p className="git-note git-note--warn">{status.reason}</p>
      )}
    </div>
  );
}
