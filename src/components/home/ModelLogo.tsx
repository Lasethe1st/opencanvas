import { Cpu } from "lucide-react";
import claudeUrl from "@lobehub/icons-static-svg/icons/claude-color.svg";
import ollamaUrl from "@lobehub/icons-static-svg/icons/ollama.svg";
import openaiUrl from "@lobehub/icons-static-svg/icons/openai.svg";
import xaiUrl from "@lobehub/icons-static-svg/icons/xai.svg";
import type { AiProviderKind } from "../../../shared/ai";
import { cn } from "@/lib/utils";

/** Single-colour marks follow the text colour (so they work in dark mode); Claude keeps its own colour. */
const MONO: Partial<Record<AiProviderKind, string>> = { openai: openaiUrl, xai: xaiUrl, ollama: ollamaUrl, lmstudio: ollamaUrl };

/** The provider's logo, shown beside a model's name. */
export function ModelLogo({ provider, className }: { provider: AiProviderKind; className?: string }) {
  if (provider === "anthropic") return <img src={claudeUrl} alt="" aria-hidden draggable={false} className={cn("size-3.5 shrink-0", className)} />;
  const mask = MONO[provider];
  if (!mask) return <Cpu aria-hidden className={cn("size-3.5 shrink-0", className)} />;
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3.5 shrink-0 bg-current", className)}
      style={{ maskImage: `url(${mask})`, WebkitMaskImage: `url(${mask})`, maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskSize: "contain", WebkitMaskSize: "contain", maskPosition: "center", WebkitMaskPosition: "center" }}
    />
  );
}
