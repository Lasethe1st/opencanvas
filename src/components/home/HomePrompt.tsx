import { ArrowUp } from "lucide-react";
import { useId, type KeyboardEvent } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
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
    <InputGroup className="rounded-xl shadow-[var(--shadow-md)]">
      <InputGroupTextarea
        autoFocus
        rows={2}
        aria-label="What do you want to build?"
        aria-describedby={hintId}
        placeholder="A landing page for a coffee roaster, with a shop and a story section"
        className="field-sizing-content min-h-[72px] max-h-60 leading-relaxed"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <InputGroupAddon align="block-end" className="justify-between">
        <InputGroupText id={hintId} className="text-pretty">
          Next, you’ll choose a visual direction.
        </InputGroupText>
        <InputGroupButton
          variant="default"
          size="icon"
          className="rounded-full"
          aria-label="Continue"
          disabled={!value.trim() || disabled}
          onClick={onSubmit}
        >
          <ArrowUp strokeWidth={2} />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
