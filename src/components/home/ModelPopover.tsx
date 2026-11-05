import * as Popover from '@radix-ui/react-popover';
import { CaretDown, Check } from '../../lib/home-icons';
import { providerMeta, type AiProviderKind, type AiThinkingEffort } from '../../../shared/ai';
import { ModelLogo } from './ModelLogo';
import { EFFORTS, ReasoningEffort } from './ReasoningEffort';
import { cn } from '@/lib/utils';

export type PickerModel = { id: string; label: string; hint?: string; provider: AiProviderKind };

/** The thinking effort slider, on its own. */
function ThinkingSlider({ value, onChange, modelLabel }: { value: AiThinkingEffort; onChange: (v: AiThinkingEffort) => void; modelLabel: string }) {
  return (
    <div className="px-2.5 pb-1 pt-1">
      <ReasoningEffort value={value} onChange={onChange} modelLabel={modelLabel} />
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
}) {
  const effortMeta = EFFORTS.find((e) => e.id === effort) ?? EFFORTS[1];
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Model: ${modelLabel}. Thinking: ${effortMeta.label}`}
          className="flex h-7 max-w-[300px] items-center border-0 bg-transparent outline-none gap-1.5 rounded-[var(--pill)] px-2 text-xs text-muted-foreground transition-colors hover:text-foreground data-[state=open]:text-foreground"
        >
          <ModelLogo provider={provider} />
          <span className="truncate">{modelLabel}</span>
          <span className="opacity-40">·</span>
          <span className="shrink-0">{effortMeta.label}</span>
          <CaretDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="model-pop z-[120] w-[300px] rounded-3xl border border-[color:var(--line)] bg-popover p-1.5 text-popover-foreground shadow-[var(--shadow-md)] outline-none"
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
