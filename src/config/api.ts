/**
 * Centralized API Configuration
 * 
 * All public/frontend API URLs and keys are managed here.
 * SECRET keys are NEVER included — they live server-side only (Edge Function env vars).
 * 
 * For cPanel deployment: update SUPABASE_URL and SUPABASE_ANON_KEY below
 * to match your production Supabase project. These are PUBLIC (anon) keys,
 * safe to include in the frontend bundle.
 */

// ── Public Supabase Config (safe for frontend) ──────────────────────────
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
export const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";

if (import.meta.env.DEV && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.warn("[config] VITE_SUPABASE_URL ve VITE_SUPABASE_PUBLISHABLE_KEY .env dosyasında tanımlı olmalı.");
}

// ── Edge Function Names ─────────────────────────────────────────────────
export const EDGE_FUNCTIONS = {
  ZOOM_IMPORT: "zoom-import",
  ANALYZE_INTERVIEW: "analyze-interview",
  BIVEYOS_PRE_EVALUATION: "biveyos-pre-evaluation",
  ANALYZE_PRACTICE: "analyze-practice-interview",
  ANALYZE_FACIAL: "analyze-facial-expressions",
  ANALYZE_CHARACTER: "analyze-character-overall",
  ANALYZE_CAREER: "analyze-career-profile",
  ANALYZE_COMPANY: "analyze-company",
  ANALYZE_MEMBER: "analyze-member-profile",
  ANALYZE_MICRO_TEST: "analyze-micro-test",
  GENERATE_QUESTIONS: "generate-practice-questions",
  GENERATE_TRAINING: "generate-daily-training",
  CAREER_COACH_INSIGHTS: "career-coach-insights",
  CAREER_COACH_CHAT: "career-coach-chat",
  MEETING_ASSISTANT: "meeting-assistant",
  PARSE_LINKEDIN: "parse-linkedin",
  SAVE_MEMBER_INSIGHTS: "save-member-insights",
  TRANSCRIBE_RECORDING: "transcribe-recording",
  PROCESS_RECORDING: "process-recording",
  COMPANY_ADVISOR: "company-advisor",
} as const;

// ── API Request Defaults ────────────────────────────────────────────────
export const API_DEFAULTS = {
  /** Max retries for transient failures (5xx, network) */
  MAX_RETRIES: 2,
  /** Retry delay in ms (doubles each attempt) */
  RETRY_DELAY_MS: 1500,
  /** Request timeout in ms */
  TIMEOUT_MS: 120_000,
} as const;
