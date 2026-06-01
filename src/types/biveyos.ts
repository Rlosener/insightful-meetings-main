/**
 * BİVEYOS — Structured Behavioral Signal Types
 *
 * Separates RAW SIGNALS (measurable data points) from AI INTERPRETATION
 * (human-readable insights). This structure is designed for:
 *  - Consistent storage and retrieval
 *  - Future ML model training on raw signals
 *  - Independent evolution of signal collection vs interpretation
 */

/* ── Raw Voice Signals ── */

export interface VoiceSignals {
  tone: "confident" | "neutral" | "nervous";
  speech_speed: "slow" | "normal" | "fast";
  hesitation_level: "low" | "medium" | "high";
  filler_words_usage: "low" | "medium" | "high";
  energy_level: "low" | "medium" | "high";
  voice_score: number; // 0-100
}

/* ── Raw Visual Signals ── */

export interface VisualSignals {
  eye_contact: "low" | "medium" | "high" | "insufficient_evidence";
  eye_contact_confidence?: "low" | "medium" | "high";
  camera_facing?: "low" | "medium" | "high";
  gaze_evidence?: "insufficient_evidence" | "weak" | "moderate" | "strong";
  script_reading_suspicion?: "low" | "medium" | "high" | "insufficient_evidence";
  natural_delivery_score?: number;
  spontaneity_proxy?: number;
  delivery_authenticity_notes?: string;
  confidence?: "low" | "medium" | "high";
  engagement_level: "low" | "medium" | "high" | "insufficient_evidence";
  presence: "active" | "inactive";
  movement_level: "low" | "medium" | "high";
  attention_consistency: "low" | "medium" | "high" | "insufficient_evidence";
  visual_score: number; // 0-100
}

/* ── Raw Facial Signals (from frame analysis) ── */

export interface FacialSignals {
  dominant_mood: string;
  average_confidence: string;
  average_engagement: string;
  common_expressions: string[];
  total_frames_analyzed: number;
  face_visibility?: "low" | "medium" | "high";
  camera_facing?: "low" | "medium" | "high";
  gaze_evidence?: "insufficient_evidence" | "weak" | "moderate" | "strong";
  eye_contact_confidence?: "low" | "medium" | "high";
  visual_commentary_confidence?: "low" | "medium" | "high";
  observational_limits?: string[];
}

/* ── Behavioral Profile (extracted patterns) ── */

export interface BehavioralProfile {
  confidence_level: string;
  stress_management: string;
  communication_patterns: string[];
  emotional_indicators: string[];
  leadership_signals: string;
  adaptability: string;
  eye_contact_confidence?: "low" | "medium" | "high";
  script_reading_suspicion?: "low" | "medium" | "high" | "insufficient_evidence";
  natural_delivery_score?: number;
  spontaneity_proxy?: number;
  delivery_authenticity_notes?: string;
  confidence?: "low" | "medium" | "high";
}

/* ── AI Interpretation (human-readable insights) ── */

export interface AIInterpretation {
  behavioral_interpretation: string; // 2-4 sentence natural language insight
  behavior_score: number; // 0-100 combined score
  behavior_score_description: string;
  voice_descriptions: {
    tone_description: string;
    speech_speed_description: string;
    hesitation_description: string;
    filler_words_description: string;
    energy_description: string;
  };
  visual_descriptions: {
    eye_contact_description: string;
    engagement_description: string;
    presence_description: string;
    movement_description: string;
    attention_description: string;
  };
}

/* ── Combined BİVEYOS Signals Document ── */

export interface BiveyosSignals {
  version: string; // Schema version for forward compatibility, e.g. "1.0"
  recorded_at: string; // ISO timestamp
  recording_type: "mülakat" | "toplantı";

  // Raw signals — ML-trainable data points
  raw: {
    voice: VoiceSignals | null;
    visual: VisualSignals | null;
    facial: FacialSignals | null;
    behavioral_profile: BehavioralProfile | null;
  };

  // AI interpretation — human-readable insights derived from raw signals
  interpretation: AIInterpretation | null;

  // Metadata for future ML pipeline
  metadata: {
    model_version: string; // AI model used
    biveyos_enabled: boolean;
    analysis_duration_ms?: number;
    signal_quality: "low" | "medium" | "high"; // data confidence
  };
}

/* ── Helper to extract BiveyosSignals from analysis_data ── */

export function extractBiveyosSignals(analysisData: any, recordingType: "mülakat" | "toplantı"): BiveyosSignals | null {
  if (!analysisData?.biveyos_enabled) return null;

  const a = analysisData;

  return {
    version: "1.0",
    recorded_at: new Date().toISOString(),
    recording_type: recordingType,
    raw: {
      voice: a.voice_analysis ? {
        tone: a.voice_analysis.tone,
        speech_speed: a.voice_analysis.speech_speed,
        hesitation_level: a.voice_analysis.hesitation_level,
        filler_words_usage: a.voice_analysis.filler_words_usage,
        energy_level: a.voice_analysis.energy_level,
        voice_score: a.voice_analysis.voice_score ?? 0,
      } : null,
      visual: a.visual_analysis ? {
        eye_contact: a.visual_analysis.eye_contact,
        eye_contact_confidence: a.visual_analysis.eye_contact_confidence,
        camera_facing: a.visual_analysis.camera_facing,
        gaze_evidence: a.visual_analysis.gaze_evidence,
        script_reading_suspicion: a.visual_analysis.script_reading_suspicion,
        natural_delivery_score: a.visual_analysis.natural_delivery_score,
        spontaneity_proxy: a.visual_analysis.spontaneity_proxy,
        delivery_authenticity_notes: a.visual_analysis.delivery_authenticity_notes,
        confidence: a.visual_analysis.confidence,
        engagement_level: a.visual_analysis.engagement_level,
        presence: a.visual_analysis.presence,
        movement_level: a.visual_analysis.movement_level,
        attention_consistency: a.visual_analysis.attention_consistency,
        visual_score: a.visual_analysis.visual_score ?? 0,
      } : null,
      facial: a.facial_analysis ? {
        dominant_mood: a.facial_analysis.dominant_mood,
        average_confidence: a.facial_analysis.average_confidence,
        average_engagement: a.facial_analysis.average_engagement,
        common_expressions: a.facial_analysis.common_expressions ?? [],
        total_frames_analyzed: a.facial_analysis.total_frames_analyzed ?? 0,
        face_visibility: a.facial_analysis.face_visibility,
        camera_facing: a.facial_analysis.camera_facing,
        gaze_evidence: a.facial_analysis.gaze_evidence,
        eye_contact_confidence: a.facial_analysis.eye_contact_confidence,
        visual_commentary_confidence: a.facial_analysis.visual_commentary_confidence,
        observational_limits: a.facial_analysis.observational_limits ?? [],
      } : null,
      behavioral_profile: a.behavioral_profile ? {
        ...a.behavioral_profile,
        eye_contact_confidence: a.behavioral_profile.eye_contact_confidence ?? a.eye_contact_confidence,
        script_reading_suspicion: a.behavioral_profile.script_reading_suspicion ?? a.script_reading_suspicion,
        natural_delivery_score: a.behavioral_profile.natural_delivery_score ?? a.natural_delivery_score,
        spontaneity_proxy: a.behavioral_profile.spontaneity_proxy ?? a.spontaneity_proxy,
        delivery_authenticity_notes: a.behavioral_profile.delivery_authenticity_notes ?? a.delivery_authenticity_notes,
        confidence: a.behavioral_profile.confidence ?? a.data_quality?.transcript_delivery_confidence,
      } : null,
    },
    interpretation: (a.behavioral_interpretation || a.behavior_score !== undefined) ? {
      behavioral_interpretation: a.behavioral_interpretation ?? "",
      behavior_score: a.behavior_score ?? 0,
      behavior_score_description: a.behavior_score_description ?? "",
      voice_descriptions: {
        tone_description: a.voice_analysis?.tone_description ?? "",
        speech_speed_description: a.voice_analysis?.speech_speed_description ?? "",
        hesitation_description: a.voice_analysis?.hesitation_description ?? "",
        filler_words_description: a.voice_analysis?.filler_words_description ?? "",
        energy_description: a.voice_analysis?.energy_description ?? "",
      },
      visual_descriptions: {
        eye_contact_description: a.visual_analysis?.eye_contact_description ?? "",
        engagement_description: a.visual_analysis?.engagement_description ?? "",
        presence_description: a.visual_analysis?.presence_description ?? "",
        movement_description: a.visual_analysis?.movement_description ?? "",
        attention_description: a.visual_analysis?.attention_description ?? "",
      },
    } : null,
    metadata: {
      model_version: "gemini-2.5-flash",
      biveyos_enabled: true,
      signal_quality: a.voice_analysis && a.visual_analysis ? "high" : a.voice_analysis || a.visual_analysis ? "medium" : "low",
    },
  };
}
