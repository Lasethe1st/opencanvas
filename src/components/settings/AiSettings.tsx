import { useEffect, useRef, useState } from 'react';
import { AI_PROVIDERS, providerMeta, type AiModel, type AiSettings, type AiStatus } from '../../../shared/ai';
import { api } from '../../lib/api';
import { plural } from '../../lib/plural';
import { setState, toast, useStore } from '../../lib/store';
import { Checkmark, Icon, Password, Renew, TrashCan, WarningAlt } from '@/components/lime/icon';
import { Button } from '@/components/lime/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/lime/ui/field';
import { Input } from '@/components/lime/ui/input';
import { List, ListItem } from '@/components/lime/ui/list';
import { Radio, RadioGroup } from '@/components/lime/ui/radio';

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

  if (!status || !settings || !meta) return <p className="text-sm text-fg-2">Loading…</p>;

  const encrypted = status.keyStorage === 'encrypted';
  const showKey = meta.needsKey || settings.provider === 'custom';

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-fg">Provider</h3>
        <RadioGroup aria-label="Provider" value={settings.provider} onValueChange={(id) => {
          const p = AI_PROVIDERS.find((x) => x.id === id);
          if (p && settings.provider !== p.id) void save({ provider: p.id, baseUrl: p.defaultBaseUrl, model: '' });
        }} className="gap-2">
          {AI_PROVIDERS.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-start gap-3 rounded-panel border border-line bg-surface p-3 has-data-checked:border-accent-line has-data-checked:bg-accent-wash"
            >
              <Radio value={p.id} className="mt-0.5" />
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm font-medium text-fg">{p.label}</span>
                <span className="text-sm text-fg-2">{p.local ? 'Runs on this computer' : p.needsKey ? 'Needs an API key' : 'Your own server'}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {meta.local && (
          <p className="text-sm text-fg-2">
            Start {meta.label} and download a model first. Pick a model that supports tool calling (for example Qwen or Llama 3.1 and later); small models may struggle with bigger changes.
          </p>
        )}
      </section>

      <form
        className="flex max-w-md flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (baseUrl.trim() !== settings.baseUrl) void save({ baseUrl: baseUrl.trim() });
        }}
      >
        <h3 className="text-lg font-semibold text-fg">Server</h3>
        <Field name="baseUrl">
          <FieldLabel>Server URL</FieldLabel>
          <Input placeholder={meta.defaultBaseUrl || 'https://api.example.com/v1'} value={baseUrl} spellCheck={false} onChange={(e) => setBaseUrl(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" disabled={baseUrl.trim() === settings.baseUrl}>
            Apply URL
          </Button>
          {meta.defaultBaseUrl && settings.baseUrl !== meta.defaultBaseUrl && (
            <Button type="button" variant="ghost" onClick={() => void save({ baseUrl: meta.defaultBaseUrl })}>
              Reset URL
            </Button>
          )}
        </div>
      </form>

      {showKey && (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-fg">API key{!meta.needsKey && ' (optional)'}</h3>
          {!encrypted ? (
            <p className="text-sm text-fg-2" role="status">
              This computer has no secure storage for keys, so OpenCanvas won’t save one. On Linux, install and unlock a keyring such as GNOME Keyring or KWallet. Local models with Ollama or LM Studio work without a key.
            </p>
          ) : status.hasKey && !replacing ? (
            <div className="flex flex-col gap-2">
              <List variant="grouped">
                <ListItem
                  leading={<Icon icon={Password} size={20} />}
                  title="Key saved"
                  description="Encrypted on this computer"
                />
              </List>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setReplacing(true)}>
                  Replace key
                </Button>
                <Button type="button" variant="ghost" size="sm" icon={<Icon icon={TrashCan} size={16} />} onClick={() => void apply(() => api.ai.clearKey())}>
                  Remove key
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="flex max-w-md flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!key.trim()) return;
                if (await apply(() => api.ai.setKey(key))) {
                  setKey('');
                  setReplacing(false);
                }
              }}
            >
              <Field name="apiKey">
                <FieldLabel>API key</FieldLabel>
                <Input
                  type="password"
                  placeholder={settings.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                  value={key}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setKey(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={!key.trim()}>
                  Save key
                </Button>
                {replacing && (
                  <Button type="button" variant="ghost" onClick={() => (setReplacing(false), setKey(''))}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          )}
          {encrypted && (
            <p className="text-sm text-fg-2">
              The key is encrypted with your operating system’s keychain and only used by OpenCanvas to talk to {meta.label}. It can’t be shown again; replace it to change it.
            </p>
          )}
        </section>
      )}

      <form
        className="flex max-w-md flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (model.trim() !== settings.model) void save({ model: model.trim() });
        }}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-fg">Model</h3>
          {canList && (
            <Button type="button" variant="ghost" size="sm" icon={<Icon icon={Renew} size={16} />} pending={loadingModels || undefined} onClick={() => void loadModels()}>
              Reload
            </Button>
          )}
        </div>
        <Field name="model">
          <FieldLabel>Model name</FieldLabel>
          <Input
            list="oc-ai-models"
            placeholder={loadingModels ? 'Loading models…' : 'Choose or type a model name'}
            value={model}
            spellCheck={false}
            onChange={(e) => {
              const next = e.target.value;
              setModel(next);
              if (models?.some((m) => m.id === next) && next !== settings.model) void save({ model: next });
            }}
          />
          <FieldDescription>
            {modelsError
              ? `${modelsError} You can still type a model name.`
              : models
                ? models.length
                  ? `${plural(models.length, 'model', 'models')} available.`
                  : 'The server didn’t list any models. Type a model name instead.'
                : 'Pick from the list or type a name.'}
          </FieldDescription>
        </Field>
        <datalist id="oc-ai-models">
          {models?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label !== m.id ? m.label : undefined}
            </option>
          ))}
        </datalist>
        <Button type="submit" variant="secondary" disabled={model.trim() === settings.model}>
          Apply model
        </Button>
      </form>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-fg">Check</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            pending={test.state === 'running' || undefined}
            disabled={!status.ready || test.state === 'running'}
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
          <span className="text-sm text-fg-2" role="status">
            {test.state === 'ok' && (
              <span className="inline-flex items-center gap-1.5 text-success-text">
                <Icon icon={Checkmark} size={16} /> Connected. The model replied “{test.reply.slice(0, 60)}”.
              </span>
            )}
            {test.state === 'failed' && (
              <span className="inline-flex items-center gap-1.5 text-danger-text">
                <Icon icon={WarningAlt} size={16} /> {test.message}
              </span>
            )}
          </span>
        </div>
        {status.ready ? (
          <p className="text-sm text-fg-2">Ready. Open Ask AI in the dock to use it. Requests to cloud providers are billed to your account with them.</p>
        ) : (
          <p className="text-sm text-warn-text">{status.reason}</p>
        )}
      </section>
    </div>
  );
}
