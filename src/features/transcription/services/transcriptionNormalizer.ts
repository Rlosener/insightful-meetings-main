import type { NormalizedTranscriptSegment, TranscriptNormalizationResult, TranscriptProvider, TranscriptResult } from "../types";

const SPEAKER_BLOCK_PATTERN = /^\[([^\]]+)\]\s*$/;
const TIMESTAMPED_SPEAKER_PATTERN = /^\[([^•\]]+)•\s*([^\]]+)\]\s*$/;
const MIN_ANALYSIS_TRANSCRIPT_CHARS = 50;

const normalizeWhitespace = (value: string) =>
  value.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

const splitBlocks = (transcript: string) =>
  normalizeWhitespace(transcript)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

const normalizeProvider = (value: unknown): TranscriptProvider => {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("openai") || normalized.includes("whisper")) return "openai";
  if (normalized.includes("google")) return "google";
  if (normalized.includes("gemini")) return "gemini";
  if (normalized.includes("web")) return "web_speech";
  if (normalized.includes("manual")) return "manual";
  return "unknown";
};

const detectLanguage = (text: string): TranscriptNormalizationResult["language"] => {
  if (!text.trim()) return "unknown";
  const trSignals = text.match(/[çğıöşüÇĞİÖŞÜ]/g)?.length || 0;
  const enSignals = text.match(/\b(the|and|with|for|this|that|you|we|is|are)\b/gi)?.length || 0;
  const trWords = text.match(/\b(ve|bir|için|olarak|ben|biz|bu|şu|ile|de|da)\b/gi)?.length || 0;
  if (trSignals > 0 || trWords >= enSignals) return "tr";
  if (enSignals > 2) return "en";
  return "unknown";
};

const toConfidence = (value: unknown): number | undefined => {
  if (typeof value === "number") return Math.max(0, Math.min(1, value));
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("high") || normalized.includes("yüksek")) return 0.82;
  if (normalized.includes("medium") || normalized.includes("orta")) return 0.58;
  if (normalized.includes("low") || normalized.includes("düşük")) return 0.32;
  return undefined;
};

const isPlaceholderTranscript = (text: string) =>
  [
    /\[isim soyisim\]/i,
    /\[şirket adı\]/i,
    /\[üniversite adı\]/i,
    /\[pozisyon adı\]/i,
    /lorem ipsum/i,
  ].some((pattern) => pattern.test(text));

export const normalizeTranscript = (
  rawTranscript: string | null | undefined,
  options: {
    provider?: unknown;
    confidence?: unknown;
    warnings?: string[];
    error?: string;
  } = {},
): TranscriptNormalizationResult => {
  const normalized = normalizeWhitespace(rawTranscript || "");
  if (!normalized) {
    return {
      text: "",
      transcript: "",
      segments: [],
      wordCount: 0,
      hasSpeech: false,
      language: "unknown",
      provider: normalizeProvider(options.provider),
      confidence: toConfidence(options.confidence),
      warnings: Array.from(new Set([...(options.warnings || []), "Transkript boş."])),
      error: options.error,
    };
  }

  const segments: NormalizedTranscriptSegment[] = [];
  let currentSpeaker = "";

  for (const block of splitBlocks(normalized)) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const speakerOnly = lines.length === 1 ? lines[0].match(SPEAKER_BLOCK_PATTERN) : null;
    if (speakerOnly) {
      currentSpeaker = speakerOnly[1].trim();
      continue;
    }

    const firstLine = lines[0];
    const timestamped = firstLine.match(TIMESTAMPED_SPEAKER_PATTERN);
    const speakerMatch = firstLine.match(SPEAKER_BLOCK_PATTERN);
    const speaker = timestamped?.[1]?.trim() || speakerMatch?.[1]?.trim() || currentSpeaker || undefined;
    const timestamp = timestamped?.[2]?.trim();
    const textLines = timestamped || speakerMatch ? lines.slice(1) : lines;
    const text = normalizeWhitespace(textLines.join(" "));

    if (text) {
      segments.push({ speaker, timestamp, text });
    }
  }

  const transcript = segments.length > 0
    ? segments
        .map((segment) => [
          segment.speaker ? `[${segment.speaker}${segment.timestamp ? ` • ${segment.timestamp}` : ""}]` : "",
          segment.text,
        ].filter(Boolean).join("\n"))
        .join("\n\n")
    : normalized;
  const wordCount = (transcript.match(/\p{L}+/gu) || []).length;
  const warnings = new Set(options.warnings || []);
  if (transcript.length < MIN_ANALYSIS_TRANSCRIPT_CHARS) {
    warnings.add(`Transkript analiz için kısa (${transcript.length} karakter).`);
  }
  if (isPlaceholderTranscript(transcript)) {
    warnings.add("Transkript placeholder/örnek içerik sinyali içeriyor.");
  }

  return {
    text: transcript,
    transcript,
    segments,
    wordCount,
    hasSpeech: wordCount >= 3,
    language: detectLanguage(transcript),
    provider: normalizeProvider(options.provider),
    confidence: toConfidence(options.confidence),
    warnings: Array.from(warnings),
    error: options.error,
  };
};

export const normalizeTranscriptResult = (
  payload: unknown,
  fallback: {
    provider?: unknown;
    warnings?: string[];
    error?: string;
  } = {},
): TranscriptNormalizationResult => {
  if (typeof payload === "string") {
    return normalizeTranscript(payload, fallback);
  }
  if (!payload || typeof payload !== "object") {
    return normalizeTranscript("", fallback);
  }

  const record = payload as Record<string, unknown>;
  const nested = record.transcriptResult && typeof record.transcriptResult === "object"
    ? record.transcriptResult as Record<string, unknown>
    : record;
  const text = typeof nested.text === "string"
    ? nested.text
    : typeof nested.transcript === "string"
      ? nested.transcript
      : typeof record.transcript === "string"
        ? record.transcript
        : "";
  const warnings = [
    ...(fallback.warnings || []),
    ...(Array.isArray(nested.warnings) ? nested.warnings.map(String) : []),
    ...(typeof record.providerError === "string" ? [`Provider uyarısı: ${record.providerError}`] : []),
  ];

  return normalizeTranscript(text, {
    provider: nested.provider ?? record.provider ?? fallback.provider,
    confidence: nested.confidence ?? record.confidence,
    warnings,
    error: typeof nested.error === "string" ? nested.error : fallback.error,
  });
};

export const isTranscriptUsableForAnalysis = (
  transcript: string | TranscriptResult | TranscriptNormalizationResult,
  minChars = MIN_ANALYSIS_TRANSCRIPT_CHARS,
) => {
  const text = typeof transcript === "string" ? transcript : transcript.text;
  return Boolean(text && text.replace(/\s+/g, "").length >= minChars && !isPlaceholderTranscript(text));
};
