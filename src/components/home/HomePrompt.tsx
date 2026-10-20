import { ArrowUp } from "lucide-react";
import { useId, type KeyboardEvent } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";

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
  const hintId = useId();

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (value.trim() && !disabled) onSubmit();
  };

  return (
    <div className="w-full">
      <InputGroup className="rounded-[8px] shadow-[var(--shadow-sm)]">
        <InputGroupTextarea
          autoFocus
          rows={1}
          data-home-prompt=""
          aria-label="What do you want to build?"
          aria-describedby={hintId}
          placeholder="Describe your project"
          className="field-sizing-content max-h-60 min-h-11 px-3.5 py-2.5 leading-6"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <InputGroupAddon align="inline-end" className="self-end pb-1.5 pe-1.5">
          <InputGroupButton variant="default" size="icon" className="rounded-[4px]" aria-label="Continue" disabled={!value.trim() || disabled} onClick={onSubmit}>
            <ArrowUp strokeWidth={2} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p id={hintId} className="mt-2 ps-1 text-sm text-muted-foreground text-pretty">
        Next, you’ll choose a visual direction.
      </p>
    </div>
  );
}
