import { ArrowUp, AudioLines, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { stopAi } from "../../lib/ai";
import { dynamicPillRadius } from "../../lib/pill-radius";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
/** The large home composer. Enter sends to AI, Shift+Enter adds a line. */
export function HomePrompt({
  value,
  onChange,
  onSubmit,
  onVoice,
  disabled,
  sending,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Empty-state control — opens the voice orb session. */
  onVoice?: () => void;
  disabled?: boolean;
  sending?: boolean;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(44);
  const [radius, setRadius] = useState("var(--r-pill)");
  const hasText = !!value.trim();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const observer = new ResizeObserver(([entry]) => {
      setTextareaHeight(entry.contentRect.height);
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => setRadius(dynamicPillRadius(el.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, textareaHeight]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (hasText && !disabled && !sending) onSubmit();
  };

  return (
    <div
      ref={shellRef}
      className="w-full overflow-hidden bg-muted/70 backdrop-blur-[30px] backdrop-saturate-150 transition-[background-color] duration-150 focus-within:bg-secondary/70"
      style={{ borderRadius: radius }}
    >
      <InputGroup className="border-0 bg-transparent pe-2 py-1 shadow-none has-[[data-slot=input-group-control]:focus-visible]:bg-transparent">
        <InputGroupTextarea
          ref={textareaRef}
          autoFocus
          rows={1}
          data-home-prompt=""
          aria-label="Message the AI"
          placeholder="Message…"
          className="field-sizing-content max-h-60 min-h-11 bg-transparent px-4 py-2.5 leading-6 focus-visible:bg-transparent"
          value={value}
          disabled={disabled && !sending}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <InputGroupAddon
          align="inline-end"
          className={`${textareaHeight <= 44 ? "self-center" : "self-end"} pe-0 pb-0 has-[>button]:me-0`}
        >
          {sending ? (
            <InputGroupButton variant="default" size="icon" className="rounded-[var(--pill)]" aria-label="Stop" onClick={stopAi}>
              <Square className="size-3.5 fill-current" strokeWidth={2} />
            </InputGroupButton>
          ) : hasText ? (
            <InputGroupButton
              variant="default"
              size="icon"
              className="rounded-[var(--pill)]"
              aria-label="Send"
              disabled={disabled}
              onClick={onSubmit}
            >
              <ArrowUp strokeWidth={2} />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              variant="default"
              size="icon"
              className="rounded-[var(--pill)]"
              aria-label="Voice input"
              disabled={disabled || !onVoice}
              onClick={onVoice}
            >
              <AudioLines strokeWidth={2} />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
