import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(44);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const observer = new ResizeObserver(([entry]) => {
      setTextareaHeight(entry.contentRect.height);
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  const radius = Math.max(14, 24 - Math.max(0, textareaHeight - 44) * 0.2);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (value.trim() && !disabled) onSubmit();
  };

  return (
    <div className="w-full">
      <InputGroup
        className="border-transparent pe-2 py-1 shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0"
        style={{ borderRadius: radius }}
      >
        <InputGroupTextarea
          ref={textareaRef}
          autoFocus
          rows={1}
          data-home-prompt=""
          aria-label="What do you want to build?"
          placeholder="Describe your project"
          className="field-sizing-content max-h-60 min-h-11 px-3.5 py-2.5 leading-6"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <InputGroupAddon
          align="inline-end"
          className={`${textareaHeight <= 44 ? "self-center" : "self-end"} pe-0 pb-0 has-[>button]:me-0`}
        >
          <InputGroupButton variant="default" size="icon" className="rounded-xl" aria-label="Continue" disabled={!value.trim() || disabled} onClick={onSubmit}>
            <ArrowUp strokeWidth={2} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
