import { Cpu } from "lucide-react";
import claudeUrl from "@lobehub/icons-static-svg/icons/claude-color.svg";
import geminiUrl from "@lobehub/icons-static-svg/icons/gemini-color.svg";
import lmstudioUrl from "@lobehub/icons-static-svg/icons/lmstudio.svg";
import ollamaUrl from "@lobehub/icons-static-svg/icons/ollama.svg";
import openaiUrl from "@lobehub/icons-static-svg/icons/openai.svg";
import xaiUrl from "@lobehub/icons-static-svg/icons/xai.svg";
import type { AiProviderKind } from "../../../shared/ai";
import { cn } from "@/lib/utils";

const MONO_LOGOS: Partial<Record<AiProviderKind, string>> = {
  openai: openaiUrl,
  xai: xaiUrl,
  ollama: ollamaUrl,
  lmstudio: lmstudioUrl,
};

/** The provider's logo, shown beside a model's name. */
export function ModelLogo({ provider, className }: { provider: AiProviderKind; className?: string }) {
  if (provider === "anthropic") return <img src={claudeUrl} alt="" aria-hidden draggable={false} className={cn("size-3.5 shrink-0", className)} />;
  if (provider === "gemini") return <img src={geminiUrl} alt="" aria-hidden draggable={false} className={cn("size-3.5 shrink-0", className)} />;
  const logo = MONO_LOGOS[provider];
  if (!logo) return <Cpu aria-hidden className={cn("size-3.5 shrink-0", className)} />;
  return <img src={logo} alt="" aria-hidden draggable={false} className={cn("model-logo--monochrome size-3.5 shrink-0", className)} />;
}
