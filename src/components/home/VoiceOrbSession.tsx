import { PhoneOff } from "lucide-react";
import { Component, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { AiChatItem } from "../../../shared/ai";
import type { VoiceCapabilities, VoiceChatMessage } from "../../../shared/voice";
import { api } from "../../lib/api";
import { setState, useStore } from "../../lib/store";
import { listenForUtterance, micCaptureAvailable, speakText } from "../../lib/voice";
import { Orb, type AgentState } from "@/components/ui/orb";
import { Button } from "@/components/ui/button";
import { useOrbColors } from "@/lib/orb-colors";
import { cn } from "@/lib/utils";

class OrbBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <div className="size-full rounded-full bg-muted/60" aria-hidden />;
    }
    return this.props.children;
  }
}

type VoiceTurn = VoiceChatMessage;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function commitTurns(turns: VoiceTurn[]) {
  const chat = useStore.getState().aiChat;
  const next: AiChatItem[] = [...chat];
  for (const turn of turns) {
    if (turn.role === "user") {
      next.push({ id: uid("vu"), kind: "user", text: turn.text });
    } else {
      next.push({ id: uid("va"), kind: "assistant", text: turn.text });
    }
  }
  if (turns.length === 0) {
    next.push({
      id: uid("va"),
      kind: "assistant",
      text: "Voice session ended — say something next time and I’ll capture it here.",
    });
  }
  setState({ aiChat: next, dockDraft: "" });
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === "AbortError"
    : err instanceof Error && (/abort|stopp/i.test(err.message) || err.name === "AbortError");
}

/**
 * Morphs the home composer into an Orb, then runs listen → AI reply → speak
 * using the selected provider (OpenAI/xAI TTS when available; browser otherwise).
 */
export function VoiceOrbSession({ onClose }: { onClose: () => void }) {
  const labelId = useId();
  const orbColors = useOrbColors();
  const [shell, setShell] = useState<"composer" | "orb">("composer");
  const [agentState, setAgentState] = useState<AgentState>("listening");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [caps, setCaps] = useState<VoiceCapabilities | null>(null);
  const turnsRef = useRef(turns);
  const closedRef = useRef(false);
  const loopAbort = useRef<AbortController | null>(null);

  turnsRef.current = turns;

  const endSession = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    loopAbort.current?.abort();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    commitTurns(turnsRef.current);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setShell("orb"));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (shell !== "orb") return;
    if (!micCaptureAvailable()) {
      setStatus("Microphone isn’t available.");
      setAgentState(null);
      return;
    }

    const ac = new AbortController();
    loopAbort.current = ac;
    let cancelled = false;

    const loop = async () => {
      let activeCaps: VoiceCapabilities | null = null;
      try {
        activeCaps = await api.ai.voiceCapabilities();
        if (cancelled) return;
        setCaps(activeCaps);
      } catch {
        /* status copy falls back without a label */
      }

      while (!cancelled && !ac.signal.aborted) {
        try {
          setAgentState("listening");
          setStatus(
            activeCaps?.stt === "provider"
              ? `Listening · ${activeCaps.label} — speak, then pause`
              : capsLabel(activeCaps, "Listening"),
          );
          const heard = await listenForUtterance(activeCaps, ac.signal);
          if (cancelled || ac.signal.aborted) return;

          const userTurn: VoiceTurn = { role: "user", text: heard };
          setTurns((prev) => [...prev, userTurn]);
          setAgentState("thinking");
          setStatus(activeCaps ? `Thinking · ${activeCaps.label}` : "Thinking…");

          const history = [...turnsRef.current];
          if (history[history.length - 1]?.text !== heard) history.push(userTurn);
          const reply = await api.ai.voiceReply(history);
          if (cancelled || ac.signal.aborted) return;

          setTurns((prev) => [...prev, { role: "assistant", text: reply }]);
          setAgentState("talking");
          setStatus(capsLabel(activeCaps, "Talking"));
          await speakText(reply, ac.signal);
        } catch (err) {
          if (cancelled || ac.signal.aborted || isAbort(err)) return;
          setAgentState("listening");
          setStatus(err instanceof Error ? err.message : "Something went wrong.");
          await new Promise((r) => setTimeout(r, 1600));
        }
      }
    };

    void loop();
    return () => {
      cancelled = true;
      ac.abort();
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, [shell]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      endSession();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [endSession]);

  return (
    <div
      className="flex w-full flex-col items-center gap-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
    >
      <p id={labelId} className="sr-only">
        Voice conversation
      </p>

      <div
        className={cn(
          "relative overflow-hidden bg-muted/70 backdrop-blur-[30px] backdrop-saturate-150 transition-[width,height,border-radius,box-shadow,background-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
          shell === "composer"
            ? "h-[52px] w-full rounded-[var(--r-pill)]"
            : "size-[148px] rounded-full bg-muted/40 shadow-[var(--shadow-lg)] ring-1 ring-[color:var(--line)]",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-150 ease-out",
            shell === "orb" ? "opacity-100 delay-75" : "opacity-0",
          )}
        >
          <OrbBoundary>
            <Orb
              className="h-full w-full"
              colors={orbColors}
              seed={42}
              agentState={agentState}
            />
          </OrbBoundary>
        </div>
        <div
          className={cn(
            "pointer-events-none flex h-full items-center px-4 text-sm text-muted-foreground transition-opacity duration-100",
            shell === "composer" ? "opacity-100" : "opacity-0",
          )}
        >
          Starting voice…
        </div>
      </div>

      <p
        className={cn(
          "max-w-[280px] text-center text-xs text-muted-foreground transition-opacity duration-150",
          shell === "orb" ? "opacity-100" : "opacity-0",
        )}
        aria-live="polite"
      >
        {status}
        {caps?.tts === "provider" && agentState === "talking" ? ` · ${caps.label}` : null}
      </p>

      <Button
        type="button"
        variant="secondary"
        className={cn(
          "rounded-[var(--pill)] gap-2 transition-opacity duration-150",
          shell === "orb" ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={endSession}
      >
        <PhoneOff className="size-4" strokeWidth={1.75} />
        End voice
      </Button>
    </div>
  );
}

function capsLabel(caps: VoiceCapabilities | null, phase: "Listening" | "Talking"): string {
  if (!caps) return `${phase}…`;
  if (phase === "Talking" && caps.tts === "provider") return `Talking · ${caps.label}`;
  return `${phase} · ${caps.label}`;
}
