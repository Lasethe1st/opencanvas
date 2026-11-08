import { useEffect, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check } from '../../lib/home-icons';
import { providerMeta, type AiProviderKind, type AiThinkingEffort } from '../../../shared/ai';
import { ModelLogo } from './ModelLogo';
import { EFFORTS, ReasoningEffort } from './ReasoningEffort';
import { cn } from '@/lib/utils';

export type PickerModel = { id: string; label: string; hint?: string; provider: AiProviderKind };

/** The thinking effort slider, with the current stop named beside the track. */
function ThinkingSlider({ value, onChange, modelLabel }: { value: AiThinkingEffort; onChange: (v: AiThinkingEffort) => void; modelLabel: string }) {
  const effortMeta = EFFORTS.find((e) => e.id === value) ?? EFFORTS[1];
  const [live, setLive] = useState(effortMeta.label);
  useEffect(() => setLive(effortMeta.label), [effortMeta.label]);
  return (
    <div className="flex items-end gap-3 px-2.5 pb-1 pt-1">
      <ReasoningEffort value={value} onChange={onChange} modelLabel={modelLabel} onStopChange={setLive} />
      <span data-effort-label="" className="flex h-[32px] w-[72px] shrink-0 items-center justify-end whitespace-nowrap text-xs font-medium text-foreground">
        {live}
      </span>
    </div>
  );
}

/** One popup for model and thinking: models grouped by provider, then the thinking slider. */
export function ModelPopover({
  provider,
  modelLabel,
  modelId,
  effort,
  models,
  providers,
  loading,
  onPickModel,
  onEffort,
  onOpenSettings,
  side = 'top',
  align = 'start',
  avoidCollisions = true,
  triggerClassName,
  logoOnly = false,
}: {
  provider: AiProviderKind;
  modelLabel: string;
  modelId: string;
  effort: AiThinkingEffort;
  models: PickerModel[];
  providers: AiProviderKind[];
  loading: boolean;
  onPickModel: (m: PickerModel) => void;
  onEffort: (e: AiThinkingEffort) => void;
  onOpenSettings: () => void;
  /** Up when the picker sits under the field; down once it lives in the shadow above the greeting. */
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
  avoidCollisions?: boolean;
  triggerClassName?: string;
  /** Shadow strip: logo only; label stays in aria-label. */
  logoOnly?: boolean;
}) {
  const effortMeta = EFFORTS.find((e) => e.id === effort) ?? EFFORTS[1];
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Model: ${modelLabel}. Thinking: ${effortMeta.label}`}
          title={`${modelLabel} · ${effortMeta.label}`}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-[var(--pill)] border-0 bg-transparent text-xs text-muted-foreground outline-none transition-colors hover:text-foreground data-[state=open]:text-foreground',
            logoOnly ? 'size-7 justify-center px-0' : 'max-w-[300px] px-2',
            triggerClassName,
          )}
        >
          <ModelLogo provider={provider} />
          {!logoOnly && (
            <>
              <span className="min-w-0 truncate text-foreground">
                {modelLabel.replace(/^claude\s+/i, '')} <span className="opacity-50">-</span> {effortMeta.label}
              </span>
            </>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          avoidCollisions={avoidCollisions}
          className="model-pop z-[120] w-max min-w-[300px] max-w-[calc(100vw-24px)] rounded-3xl border border-[color:var(--line)] bg-popover p-1.5 text-popover-foreground shadow-[var(--shadow-md)] outline-none"
        >
          <div className="flex max-h-[240px] flex-col gap-1.5 overflow-y-auto">
            {models.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">{loading ? 'Loading models…' : 'No models listed — set one in Settings › AI.'}</div>
            ) : (
              providers.map((p) => (
                <div key={p} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 pt-1 text-xs font-medium text-muted-foreground">
                    <ModelLogo provider={p} />
                    {providerMeta(p).product}
                  </div>
                  {models.filter((m) => m.provider === p).map((m) => {
                    const on = m.id === modelId && m.provider === provider;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onPickModel(m)}
                        className={cn('flex w-full items-start gap-2 border-0 bg-transparent outline-none rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-foreground/[0.06]', on && 'bg-foreground/[0.06]')}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-xs text-foreground">{m.label}</span>
                          {m.hint && <span className="text-[11px] leading-4 text-muted-foreground">{m.hint}</span>}
                        </span>
                        {on && <Check className="mt-0.5 size-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="mx-2.5 my-2 h-px bg-border/70" />
          <ThinkingSlider value={effort} onChange={onEffort} modelLabel={modelLabel} />
          <div className="mx-2.5 my-2 h-px bg-border/70" />
          <button type="button" onClick={onOpenSettings} className="w-full border-0 bg-transparent rounded-xl px-2.5 py-1.5 outline-none text-left text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
            Open Settings › AI
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
