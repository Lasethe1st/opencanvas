import type { KeyboardEvent } from 'react';
import { ArrowUp, Icon } from '@/components/lime/icon';
import { Button } from '@/components/lime/ui/button';
import { Textarea } from '@/components/lime/ui/textarea';

/** The large "what are we building?" box. Enter continues, Shift+Enter adds a line. */
export function HomePrompt({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const canSubmit = !!value.trim() && !disabled;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (canSubmit) onSubmit();
  };

  return (
    <div className="flex w-full items-end gap-2">
      <Textarea
        autoFocus
        autoGrow
        data-home-prompt=""
        aria-label="What do you want to build?"
        placeholder="A landing page for a coffee roaster"
        className="min-w-0 flex-1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <Button type="button" size="icon" variant="primary" aria-label="Continue" disabled={!canSubmit} onClick={onSubmit}>
        <Icon icon={ArrowUp} size={20} />
      </Button>
    </div>
  );
}
