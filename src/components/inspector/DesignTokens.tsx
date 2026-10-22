import { useEffect, useMemo, useState } from 'react';
import type { Token } from '../../../shared/design-system';
import { cssVarName, guessTokenType } from '../../../shared/design-system';
import { setStyles } from '../../lib/actions';
import { api } from '../../lib/api';
import { toast, useStore } from '../../lib/store';
import { Button, Field, SelectShell } from '../../ui/primitives.jsx';
import { Section } from './fields';
import { useStyleValue } from './useStyleValue';

const COLOR_PROPS = [
  { prop: 'color', label: 'Color' },
  { prop: 'background-color', label: 'Fill' },
  { prop: 'border-color', label: 'Border' },
] as const;

function classify(value: string | null | undefined): 'token' | 'literal' | 'empty' {
  if (!value?.trim()) return 'empty';
  if (/var\(\s*--[\w-]+\s*\)/.test(value)) return 'token';
  return 'literal';
}

function TokenRow({ prop, label, tokens }: { prop: string; label: string; tokens: Token[] }) {
  const { value } = useStyleValue(prop);
  const info = useStore((s) => s.sourceInfo);
  const disabled = !info;
  const kind = classify(value);
  const colorTokens = useMemo(
    () => tokens.filter((t) => t.type === 'color' || /color|bg|fg|accent|brand/.test(t.path)),
    [tokens],
  );
  const currentVar = value?.match(/--[\w-]+/)?.[0] ?? '';

  const apply = (tokenPath: string) => {
    void setStyles({ [prop]: `var(${cssVarName(tokenPath)})` }, `Apply token ${tokenPath}`);
  };

  const createFromValue = async () => {
    if (!value || kind !== 'literal') return;
    const slug = prop.replace(/-color$/, '').replace(/[^a-z0-9]+/gi, '-');
    const path = `color.from-${slug}-${Date.now().toString(36).slice(-4)}`;
    const token: Token = {
      id: path.replace(/\./g, '-'),
      path,
      type: guessTokenType(path, value),
      value: { kind: 'raw', value },
      role: 'semantic',
    };
    try {
      await api.designSystem.upsertToken(token, `Created ${path} from selection`);
      await setStyles({ [prop]: `var(${cssVarName(path)})` }, `Bind ${path}`);
      toast(`Created ${path}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="ds-inspector-row">
      <Field label={label}>
        <SelectShell>
          <select
            disabled={disabled || !colorTokens.length}
            value={kind === 'token' ? currentVar : ''}
            onChange={(e) => {
              const cssVar = e.target.value;
              const token = colorTokens.find((t) => cssVarName(t.path) === cssVar);
              if (token) apply(token.path);
            }}
          >
            <option value="">{kind === 'literal' ? `Local: ${value}` : kind === 'token' ? value : '—'}</option>
            {colorTokens.map((t) => (
              <option key={t.id} value={cssVarName(t.path)}>
                {t.path}
              </option>
            ))}
          </select>
        </SelectShell>
      </Field>
      <p className="dock-note ds-inspector-kind">
        {kind === 'token' ? 'Token-driven' : kind === 'literal' ? 'Local override' : 'Unset / inherited'}
      </p>
      {kind === 'literal' && (
        <Button type="button" variant="ghost" disabled={disabled} onClick={() => void createFromValue()}>
          Create token from value
        </Button>
      )}
    </div>
  );
}

/** Inspector section: apply design tokens or create one from a local value. */
export function DesignTokenBindings() {
  const project = useStore((s) => s.project);
  const [tokens, setTokens] = useState<Token[]>([]);

  useEffect(() => {
    if (!project) {
      setTokens([]);
      return;
    }
    void api.designSystem
      .get()
      .then((r) => setTokens(r.document.tokens))
      .catch(() => setTokens([]));
  }, [project?.root]);

  if (!project) return null;

  return (
    <Section title="Design tokens" defaultOpen={!!tokens.length}>
      {!tokens.length ? (
        <p className="dock-note">Import or define tokens in the Design system dock.</p>
      ) : (
        COLOR_PROPS.map(({ prop, label }) => <TokenRow key={prop} prop={prop} label={label} tokens={tokens} />)
      )}
    </Section>
  );
}
