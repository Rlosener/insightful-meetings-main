import { normalizeTranscriptResult } from "./transcriptionNormalizer";
import type { TranscriptPipelineStatus, TranscriptProvider, TranscriptResult } from "../types";

export interface ChannelTranscriptInput {
  speaker: string;
  payload: unknown;
  error?: string;
}

export interface ChannelTranscriptStatusInput {
  speaker: string;
  transcript?: string;
  error?: string;
  provider?: TranscriptProvider;
}

const providerLabels: Partial<Record<TranscriptProvider, string>> = {
  openai: "OpenAI",
  google: "Google Speech",
  gemini: "Gemini",
  web_speech: "Web Speech",
  manual: "Manuel",
};

const hasReadableTranscript = (value?: string) => Boolean(value?.trim());

export const buildTranscriptResult = (payload: unknown, fallback?: { provider?: unknown; error?: string; warnings?: string[] }) =>
  normalizeTranscriptResult(payload, fallback);

export const resolveChannelTranscriptStatus = (
  channels: ChannelTranscriptStatusInput[],
): Extract<TranscriptPipelineStatus, "completed" | "partial" | "failed"> => {
  const successCount = channels.filter((channel) => hasReadableTranscript(channel.transcript)).length;
  if (successCount === 0) return "failed";
  if (successCount < channels.length) return "partial";
  return "completed";
};

export const formatTranscriptProviderLabel = (
  channels: ChannelTranscriptStatusInput[],
  status: Extract<TranscriptPipelineStatus, "completed" | "partial" | "failed">,
) => {
  if (status === "failed") return "Transkript sağlayıcısı başarısız oldu.";

  const providers = Array.from(new Set(
    channels
      .filter((channel) => hasReadableTranscript(channel.transcript))
      .map((channel) => channel.provider)
      .filter((provider): provider is TranscriptProvider => Boolean(provider) && provider !== "unknown"),
  ));

  if (providers.length === 0) return "Provider: Belirlenemedi";
  return `Provider: ${providers.map((provider) => providerLabels[provider] || "Belirlenemedi").join(", ")}`;
};

export const formatChannelTranscriptFailure = (speaker: string, error?: string) => {
  const normalized = (error || "").toLocaleLowerCase("tr-TR");
  if (/0 byte|çok küçük|ses kaydı alınamadı|boş/.test(normalized)) {
    return `${speaker} kanalı: Ses kaydı alınamadı.`;
  }
  if (/sunucu|server|provider|sağlayıcı|edge|500|transkript/.test(normalized)) {
    return `${speaker} kanalı: Sunucu tarafında transkript üretilemedi.`;
  }
  return `${speaker} kanalı: Transkript üretilemedi.`;
};

export const buildChannelTranscriptDisplay = (channels: ChannelTranscriptStatusInput[]) =>
  channels
    .map((channel) => {
      if (hasReadableTranscript(channel.transcript)) {
        return `[${channel.speaker}]\n${channel.transcript?.trim()}`;
      }
      return `[${channel.speaker}]\n${formatChannelTranscriptFailure(channel.speaker, channel.error)}`;
    })
    .join("\n\n");

export const buildAnalysisTranscriptFromChannels = (channels: ChannelTranscriptStatusInput[]) =>
  channels
    .filter((channel) => hasReadableTranscript(channel.transcript))
    .map((channel) => `[${channel.speaker}]\n${channel.transcript?.trim()}`)
    .join("\n\n");

export const mergeChannelTranscriptResults = (channels: ChannelTranscriptInput[]): TranscriptResult => {
  const warnings: string[] = [];
  const segments: NonNullable<TranscriptResult["segments"]> = [];
  const textBlocks = channels.map((channel) => {
    const normalized = normalizeTranscriptResult(channel.payload, {
      error: channel.error,
      warnings: channel.error ? [`${channel.speaker}: ${channel.error}`] : [],
    });

    warnings.push(...normalized.warnings);
    if (normalized.error) warnings.push(`${channel.speaker}: ${normalized.error}`);
    normalized.segments.forEach((segment) => {
      segments.push({ ...segment, speaker: segment.speaker || channel.speaker });
    });

    return normalized.text
      ? `[${channel.speaker}]\n${normalized.text.replace(/^\[[^\]]+\]\n/, "")}`
      : `[${channel.speaker}]\nTranskript üretilemedi${channel.error ? `: ${channel.error}` : "."}`;
  });

  const merged = normalizeTranscriptResult(textBlocks.join("\n\n"), {
    provider: channels.length > 1 ? "unknown" : undefined,
    warnings,
  });

  return {
    text: merged.text,
    language: merged.language,
    provider: merged.provider,
    confidence: merged.confidence,
    segments: segments.length > 0 ? segments : merged.segments,
    warnings: Array.from(new Set(merged.warnings)),
    error: merged.error,
  };
};
