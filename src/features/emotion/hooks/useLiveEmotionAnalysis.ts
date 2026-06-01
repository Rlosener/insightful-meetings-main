import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EDGE_FUNCTIONS } from "@/config/api";
import { getErrorToastMessage, invokeEdgeFunction } from "@/lib/edgeFunctionClient";
import { captureVideoFrameDataUrl, sampleLatestFrames } from "@/lib/frameSampling";
import {
  EMOTION_ANALYSIS_INTERVAL_MS,
  EMOTION_FRAME_BATCH_SIZE,
  EMOTION_FRAME_CAPTURE_INTERVAL_MS,
  EMOTION_FRAME_WIDTH,
  EMOTION_MAX_BUFFER_SIZE,
} from "../constants";
import { normalizeEmotionAnalysis } from "../services/emotionNormalizer";
import type { EmotionAnalysisResult, EmotionProviderName, EmotionProviderStatus, EmotionTrend } from "../types";

interface UseLiveEmotionAnalysisOptions {
  videoRef: RefObject<HTMLVideoElement>;
  enabled?: boolean;
  intervalMs?: number;
  providerPreference?: EmotionProviderName;
  participants?: string[];
}

export const useLiveEmotionAnalysis = ({
  videoRef,
  enabled = true,
  intervalMs = EMOTION_ANALYSIS_INTERVAL_MS,
  providerPreference = "internal_vision",
  participants = [],
}: UseLiveEmotionAnalysisOptions) => {
  const [status, setStatus] = useState<EmotionProviderStatus>(enabled ? "idle" : "disabled");
  const [provider, setProvider] = useState<EmotionProviderName>(
    providerPreference === "morphcast" ? "internal_vision" : providerPreference,
  );
  const [latestResult, setLatestResult] = useState<EmotionAnalysisResult | null>(null);
  const [history, setHistory] = useState<EmotionAnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const framesRef = useRef<string[]>([]);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);

  const stop = useCallback(() => {
    if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    captureIntervalRef.current = null;
    analysisIntervalRef.current = null;
    busyRef.current = false;
    setStatus(enabled ? "idle" : "disabled");
  }, [enabled]);

  const captureFrame = useCallback(() => {
    const frame = captureVideoFrameDataUrl(videoRef.current, { maxWidth: EMOTION_FRAME_WIDTH, quality: 0.62 });
    if (!frame) {
      setStatus("camera_waiting");
      return;
    }
    framesRef.current = [...framesRef.current, frame].slice(-EMOTION_MAX_BUFFER_SIZE);
  }, [videoRef]);

  const analyze = useCallback(async () => {
    if (!enabled || busyRef.current) return;
    const frames = sampleLatestFrames(framesRef.current, EMOTION_FRAME_BATCH_SIZE);
    if (frames.length === 0) {
      setStatus("camera_waiting");
      return;
    }

    busyRef.current = true;
    setStatus("analyzing");
    setError(null);
    try {
      const result = await invokeEdgeFunction<{ analysis: Record<string, unknown> }>(
        EDGE_FUNCTIONS.ANALYZE_FACIAL,
        { frames, participants },
        { maxRetries: 0, timeoutMs: 30000 },
      );

      if (result.error) {
        setError(getErrorToastMessage(result.error));
        setStatus("error");
        return;
      }

      const normalized = normalizeEmotionAnalysis(result.data?.analysis, history);
      setProvider(normalized.provider || "internal_vision");
      setLatestResult(normalized);
      setHistory((previous) => [...previous, normalized].slice(-30));
      setStatus(
        normalized.face_visibility === "low" || normalized.face_visibility === "none" || normalized.face_visibility === "unknown"
          ? "low_visibility"
          : "running",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duygu analizi calistirilamadi.");
      setStatus("error");
    } finally {
      busyRef.current = false;
    }
  }, [enabled, history, participants]);

  const start = useCallback(() => {
    if (!enabled) {
      setStatus("disabled");
      return;
    }
    stop();
    framesRef.current = [];
    setProvider(providerPreference === "morphcast" ? "internal_vision" : providerPreference);
    setStatus("initializing");
    captureFrame();
    captureIntervalRef.current = setInterval(captureFrame, EMOTION_FRAME_CAPTURE_INTERVAL_MS);
    analysisIntervalRef.current = setInterval(analyze, intervalMs);
  }, [analyze, captureFrame, enabled, intervalMs, providerPreference, stop]);

  useEffect(() => () => stop(), [stop]);

  const trend: EmotionTrend = useMemo(() => latestResult?.engagement.trend || "unknown", [latestResult]);
  const confidence = latestResult?.ekman_style_emotion?.confidence ?? 0;
  const limitations = latestResult?.limitations || [];

  return {
    status,
    provider,
    latestResult,
    history,
    trend,
    start,
    stop,
    error,
    confidence,
    limitations,
  };
};
