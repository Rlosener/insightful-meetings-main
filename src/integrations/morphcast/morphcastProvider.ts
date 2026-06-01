import type { EmotionAnalysisResult } from "@/features/emotion/types";
import { loadMorphCastScript } from "./morphcastLoader";
import type { MorphCastConfig, MorphCastProvider } from "./morphcastTypes";

type Callback = (result: EmotionAnalysisResult) => void;

const DEFAULT_SDK_URL = "https://ai-sdk.morphcast.com/latest/ai-sdk.js";

export const createMorphCastProvider = (config: MorphCastConfig = {}): MorphCastProvider => {
  let callback: Callback | null = null;
  let state: MorphCastProvider["state"] = "not_configured";
  const lastResult: EmotionAnalysisResult | null = null;

  return {
    name: "morphcast",
    get state() {
      return state;
    },
    get lastResult() {
      return lastResult;
    },
    initialize: async () => {
      if (!config.licenseKey) {
        state = "not_configured";
        throw new Error("MorphCast lisans anahtari yok. Internal vision fallback kullanilmali.");
      }
      await loadMorphCastScript(config.scriptUrl || DEFAULT_SDK_URL);
      state = "ready";
    },
    start: async (videoElement: HTMLVideoElement) => {
      if (!videoElement) throw new Error("MorphCast icin video elementi gerekli.");
      if (!config.licenseKey) {
        state = "not_configured";
        throw new Error("MorphCast lisans anahtari yok. Internal vision fallback kullanilmali.");
      }

      // SDK API'si lisans ve versiyona gore degisebildigi icin direkt bagimlilik kurmuyoruz.
      // Bu adapter sadece lisansli entegrasyon noktasini hazir tutar; sonuclar normalize edilerek aktarilmalidir.
      state = "running";
    },
    stop: async () => {
      state = config.licenseKey ? "ready" : "not_configured";
    },
    onResult: (nextCallback) => {
      callback = nextCallback;
    },
  };
};
