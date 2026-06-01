import type { TranscriptLanguage, TranscriptProvider, TranscriptResult, TranscriptSegment } from "./types/transcription";

export type NormalizedTranscriptSegment = TranscriptSegment & {
  timestamp?: string;
};

export interface TranscriptNormalizationResult extends TranscriptResult {
  transcript: string;
  segments: NormalizedTranscriptSegment[];
  wordCount: number;
  hasSpeech: boolean;
  language: TranscriptLanguage;
  provider: TranscriptProvider;
}

export type {
  TranscriptLanguage,
  TranscriptProvider,
  TranscriptPipelineStatus,
  TranscriptResult,
  TranscriptSegment,
} from "./types/transcription";
