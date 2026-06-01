import type { EmotionAnalysisResult, EmotionProvider } from "@/features/emotion/types";

export type MorphCastProviderState = "not_configured" | "ready" | "running" | "error";

export interface MorphCastConfig {
  licenseKey?: string;
  scriptUrl?: string;
}

export interface MorphCastProvider extends EmotionProvider {
  state: MorphCastProviderState;
  lastResult: EmotionAnalysisResult | null;
}
