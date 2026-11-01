import { Menu } from 'bloom-menu';
import { useState } from 'react';
import { AI_PROVIDERS, type AiProviderKind, type AiProviderMeta } from '../../../shared/ai';
import { Check, ChevronDown } from '../../lib/hugeicons';
import { ModelLogo } from '../home/ModelLogo';

const TRIGGER_H = 40;
const MENU_W = 340;

/** What sits on the far right of a provider row. */
function tagOf(p: AiProviderMeta): string {
  return p.local ? 'Local' : p.needsKey ? 'API key' : 'Your server';
}

/** Settings › AI provider picker: a dropdown that blooms open into the full list.
 *  Each row is logo, name, and on the far right either a "Connected" dot (the active, working provider)
 *  or what the provider needs (API key, Local, Your server). */
export function ProviderSelect({ value, connected, onChange }: { value: AiProviderKind; connected: boolean; onChange: (id: AiProviderKind) => void }) {
  const [open, setOpen] = useState(false);
  const current = AI_PROVIDERS.find((p) => p.id === value) ?? AI_PROVIDERS[0];

  const right = (p: AiProviderMeta) =>
    p.id === value && connected ? (
      <span className="provider-select__status">
        <span className="provider-select__dot" aria-hidden />
        Connected
      </span>
    ) : (
      <span className="provider-select__tag">{tagOf(p)}</span>
    );

  return (
    <div className="provider-select" style={{ width: MENU_W, height: TRIGGER_H }}>
      <Menu.Root open={open} onOpenChange={setOpen} direction="bottom" anchor="start" bounce={0.12} visualDuration={0.26}>
        <Menu.Container
          buttonSize={{ width: MENU_W, height: TRIGGER_H }}
          menuWidth={MENU_W}
          menuRadius={12}
          buttonRadius={10}
          className="provider-select__shell"
          style={{ boxShadow: open ? 'var(--shadow-md)' : 'none' }}
        >
          <Menu.Trigger className="provider-select__trigger">
            <ModelLogo provider={current.id} className="size-5" />
            <span className="provider-select__name">{current.label}</span>
            {right(current)}
            <ChevronDown size={14} className="provider-select__caret" aria-hidden />
          </Menu.Trigger>
          <Menu.Content className="provider-select__list" style={{ width: MENU_W - 2, boxSizing: 'border-box' }}>
            {AI_PROVIDERS.map((p) => (
              <Menu.Item key={p.id} className={`provider-select__item${p.id === value ? ' is-current' : ''}`} onSelect={() => p.id !== value && onChange(p.id)}>
                <ModelLogo provider={p.id} className="size-5" />
                <span className="provider-select__name">{p.label}</span>
                {right(p)}
                <span className="provider-select__tick" aria-hidden>{p.id === value && <Check size={14} />}</span>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Container>
      </Menu.Root>
    </div>
  );
}
