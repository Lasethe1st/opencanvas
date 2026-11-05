import * as Popover from '@radix-ui/react-popover';
import { Brain, CaretDown, Check } from '../../lib/home-icons';
import { providerMeta, type AiProviderKind, type AiThinkingEffort } from '../../../shared/ai';
import { ModelLogo } from './ModelLogo';
import { cn } from '@/lib/utils';

export type PickerModel = { id: string; label: string; hint?: string; provider: AiProviderKind };

export const EFFORTS: { id: AiThinkingEffort; label: string; hint: string }[] = [
  { id: 'low', label: 'Instant', hint: 'Faster, lighter replies' },
  { id: 'medium', label: 'Balanced', hint: 'A good mix of speed and depth' },
  { id: 'high', label: 'Harder', hint: 'Slower, deeper reasoning' },
];

/** The thinking slider: a track that comes alive as it climbs. Native range input on top keeps keyboard + a11y. */
function ThinkingSlider({ value, onChange }: { value: AiThinkingEffort; onChange: (v: AiThinkingEffort) => void }) {
  const level = Math.max(0, EFFORTS.findIndex((e) => e.id === value));
  const meta = EFFORTS[level];
  return (
    <div className="think" data-level={level}>
      <div className="mb-2 flex items-center gap-2">
        <span className="think__brain"><Brain className="size-4" /></span>
        <span className="text-[13px] font-medium text-foreground">Thinking</span>
        <span className="ms-auto text-xs font-medium text-foreground">{meta.label}</span>
      </div>
      <div className="think__rail" style={{ ['--lvl' as string]: level / (EFFORTS.length - 1) }}>
        <div className="think__track"><div className="think__fill" /></div>
        {EFFORTS.map((e, i) => (
          <span key={e.id} className="think__stop" data-on={i <= level} style={{ left: `${(i / (EFFORTS.length - 1)) * 100}%` }} />
        ))}
        <div className="think__thumb"><span className="think__spark" /><span className="think__spark think__spark--b" /><span className="think__spark think__spark--c" /></div>
        <input
          type="range"
          min={0}
          max={EFFORTS.length - 1}
          step={1}
          value={level}
          aria-label="Thinking effort"
          aria-valuetext={meta.label}
          className="think__input"
          onChange={(e) => onChange(EFFORTS[Number(e.target.value)].id)}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        {EFFORTS.map((e, i) => (
          <span key={e.id} className={cn('transition-colors', i === level && 'text-foreground')}>{e.label}</span>
        ))}
      </div>
      <p className="m-0 mt-2 text-[11px] leading-4 text-muted-foreground">{meta.hint}</p>
    </div>
  );
}

/** One popup for model and thinking: slider on top, models grouped by provider below. */
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
          className="model-pop z-[120] w-[320px] rounded-3xl border border-[color:var(--line)] bg-popover p-4 text-popover-foreground shadow-[var(--shadow-md)] outline-none"
        >
          <ThinkingSlider value={effort} onChange={onEffort} />
          <div className="my-3 h-px bg-border/70" />
          <div className="mb-1.5 px-0.5 text-[13px] font-medium text-foreground">Model</div>
          <div className="-mx-1.5 flex max-h-[240px] flex-col gap-2 overflow-y-auto px-1.5">
            {models.length === 0 ? (
              <div className="px-1 py-2 text-xs text-muted-foreground">{loading ? 'Loading models…' : 'No models listed — set one in Settings › AI.'}</div>
            ) : (
              providers.map((p) => (
                <div key={p} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 px-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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
                        className={cn('flex w-full items-start gap-2 border-0 bg-transparent outline-none rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-foreground/[0.06]', on && 'bg-foreground/[0.06]')}
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
          <div className="my-3 h-px bg-border/70" />
          <button type="button" onClick={onOpenSettings} className="w-full border-0 bg-transparent rounded-xl px-1.5 py-1 outline-none text-left text-xs text-muted-foreground transition-colors hover:text-foreground">
            Open Settings › AI
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
