export type TranscriptLanguage = "tr" | "en" | "unknown";

export type TranscriptProvider = "openai" | "google" | "gemini" | "web_speech" | "manual" | "unknown";

export type TranscriptPipelineStatus =
  | "idle"
  | "live_starting"
  | "live_active"
  | "live_unsupported"
  | "recording"
  | "final_preparing"
  | "completed"
  | "partial"
  | "failed"
  | "final_done"
  | "final_failed"
  | "insufficient";

export interface TranscriptSegment {
  speaker?: string;
  start?: number;
  end?: number;
  text: string;
}

export type TranscriptResult = {
  text: string;
  language: TranscriptLanguage;
  provider: TranscriptProvider;
  confidence?: number;
  segments?: TranscriptSegment[];
  warnings: string[];
  error?: string;
};
