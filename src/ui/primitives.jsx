import { ChevronDown, Icon, Renew } from '@/components/lime/icon';
import { Button as LimeButton, Spinner as LimeSpinner } from '@/components/lime/ui/button';
import { Field as LimeField, FieldLabel } from '@/components/lime/ui/field';
import { Segmented as LimeSegmented, SegmentedItem } from '@/components/lime/ui/segmented';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/lime/ui/tooltip';
import { cn } from '@/lib/lime/utils';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const VARIANT = {
  default: 'secondary',
  primary: 'primary',
  ghost: 'ghost',
  outline: 'outline',
  destructive: 'destructive',
  solid: 'solid',
  secondary: 'secondary',
  link: 'link',
};

/** Lime Button with the old variant names mapped across. */
export function Button({ variant = 'default', size, icon, children, className, pending, ...rest }) {
  const limeVariant = VARIANT[variant] ?? 'secondary';
  const limeSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : size === 'icon' ? 'icon' : 'md';
  return (
    <LimeButton variant={limeVariant} size={limeSize} icon={icon} className={className} pending={pending} {...rest}>
      {children}
    </LimeButton>
  );
}

export function IconButton({ label, tipSide = 'top', active, size, children, className, ...rest }) {
  return (
    <span className={cn('inline-flex rounded-control', active && 'bg-accent-wash')}>
      <Tooltip>
        <TooltipTrigger
          render={
            <LimeButton
              variant="ghost"
              size={size === 'sm' ? 'icon-sm' : 'icon'}
              aria-label={label}
              aria-pressed={active}
              className={className}
              {...rest}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent side={tipSide}>{label}</TooltipContent>
      </Tooltip>
    </span>
  );
}

export function Segmented({ label, options, value, onChange }) {
  return (
    <LimeSegmented aria-label={label} value={value} onValueChange={(v) => onChange?.(v)} size="sm">
      {options.map((o) => (
        <SegmentedItem key={o.id} value={o.id} aria-label={o.label}>
          {o.icon}
          {o.text}
        </SegmentedItem>
      ))}
    </LimeSegmented>
  );
}

export function Badge({ tone, children }) {
  const variant = tone === 'warning' || tone === 'warn' ? 'warn' : tone === 'busy' ? 'neutral' : tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : 'neutral';
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-control px-2.5 text-xs font-medium whitespace-nowrap',
        variant === 'warn' && 'bg-warn-tint text-warn-text',
        variant === 'neutral' && 'bg-surface-2 text-fg-2',
        variant === 'danger' && 'bg-danger-tint text-danger-text',
        variant === 'success' && 'bg-success-tint text-success-text',
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {children}
    </span>
  );
}

export function Section({ title, open = true, onToggle, children }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-3">
      <LimeButton type="button" variant="ghost" className="w-full justify-start" onClick={onToggle} aria-expanded={open}>
        <Icon icon={ChevronDown} size={16} className={cn('text-fg-3 transition-transform', !open && '-rotate-90')} />
        {title}
      </LimeButton>
      {open && <div className="flex flex-col gap-3 px-1">{children}</div>}
    </div>
  );
}

export function Field({ label, state, children, name }) {
  return (
    <LimeField name={name ?? (typeof label === 'string' ? label : 'field')} className="gap-1">
      <FieldLabel className="inline-flex items-center gap-1.5">
        {state === 'set' && <span className="size-1.5 rounded-full bg-accent-wash ring-1 ring-accent-line" aria-hidden />}
        {state === 'inherited' && <span className="size-1.5 rounded-full bg-fg-3" aria-hidden />}
        {label}
      </FieldLabel>
      {children}
    </LimeField>
  );
}

export function InputShell({ inherited, prefix, onReset, children }) {
  return (
    <span className={cn('relative flex min-w-0 items-center gap-1 rounded-field border border-line-strong bg-field px-2', inherited && 'opacity-80')}>
      {prefix && <span className="shrink-0 text-xs text-fg-3">{prefix}</span>}
      <span className="min-w-0 flex-1 [&_input]:w-full [&_input]:border-0 [&_input]:bg-transparent [&_input]:py-2 [&_input]:text-sm [&_input]:text-fg [&_select]:w-full [&_select]:border-0 [&_select]:bg-transparent [&_select]:py-2 [&_select]:text-sm [&_select]:text-fg">
        {children}
      </span>
      {onReset && (
        <LimeButton type="button" variant="ghost" size="icon-sm" aria-label="Remove override" onClick={onReset}>
          <Icon icon={Renew} size={12} />
        </LimeButton>
      )}
    </span>
  );
}

export function SelectShell({ inherited, onReset, children }) {
  return (
    <span className={cn('relative flex min-w-0 items-center gap-1 rounded-field border border-line-strong bg-field px-2', inherited && 'opacity-80')}>
      <span className="min-w-0 flex-1 [&_select]:w-full [&_select]:appearance-none [&_select]:border-0 [&_select]:bg-transparent [&_select]:py-2 [&_select]:pe-6 [&_select]:text-sm [&_select]:text-fg">
        {children}
      </span>
      {!onReset && <Icon icon={ChevronDown} size={12} className="pointer-events-none absolute end-2 text-fg-3" />}
      {onReset && (
        <LimeButton type="button" variant="ghost" size="icon-sm" aria-label="Remove override" onClick={onReset}>
          <Icon icon={Renew} size={12} />
        </LimeButton>
      )}
    </span>
  );
}

export function Swatch({ color, children }) {
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-sm border border-line bg-(--swatch)" style={{ '--swatch': color || 'transparent' }}>
      {children}
    </span>
  );
}

export function ToggleRow({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-0.5 rounded-control bg-surface p-1">
      {options.map((o) => (
        <span key={o.value} className={cn('rounded-control', value === o.value && 'bg-accent-wash')}>
          <LimeButton type="button" variant="ghost" size="icon-sm" aria-label={o.title} title={o.title} onClick={() => onChange?.(o.value)}>
            {o.icon}
          </LimeButton>
        </span>
      ))}
    </div>
  );
}

export function SectionLabel({ children, actions }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm font-semibold text-fg">
      <span>{children}</span>
      {actions && <span className="flex gap-0.5">{actions}</span>}
    </div>
  );
}

export function Notice({ tone, icon, children, action }) {
  return (
    <div
      className={cn(
        'flex gap-2 rounded-panel px-3 py-2 text-sm',
        tone === 'info' && 'bg-accent-wash text-fg',
        tone === 'warning' && 'bg-warn-tint text-warn-text',
        !tone && 'bg-surface text-fg-2',
      )}
      role="status"
    >
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Menu({ style, children, className, ...rest }) {
  return (
    <div className={cn('z-(--z-popover) min-w-44 rounded-panel border border-line bg-raised p-1 text-fg shadow-menu', className)} role="menu" style={style} {...rest}>
      {children}
    </div>
  );
}

export function MenuItem({ icon, hint, children, className, ...rest }) {
  return (
    <LimeButton type="button" variant="ghost" className={cn('w-full justify-start', className)} role="menuitem" {...rest}>
      {icon}
      <span className="min-w-0 flex-1 truncate text-start">{children}</span>
      {hint && <span className="shrink-0 text-xs font-normal text-fg-3">{hint}</span>}
    </LimeButton>
  );
}

export function Spinner() {
  return <LimeSpinner />;
}

export { cx };
