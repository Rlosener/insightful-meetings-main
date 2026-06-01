export type EmotionProviderName = "internal_vision" | "morphcast" | "disabled";

export type EmotionProviderStatus =
  | "idle"
  | "initializing"
  | "camera_waiting"
  | "running"
  | "analyzing"
  | "low_visibility"
  | "error"
  | "disabled";

export type DominantSignal =
  | "neutral"
  | "positive"
  | "focused"
  | "confused"
  | "stressed"
  | "uncertain"
  | "engaged"
  | "low_engagement"
  | "unknown";

export type EkmanStyleEmotion =
  | "happiness"
  | "sadness"
  | "anger"
  | "fear"
  | "surprise"
  | "disgust"
  | "neutral"
  | "unknown";

export interface FACSActionUnitHint {
  au: string;
  name: string;
  observed_signal: string;
  possible_interpretation: string;
  confidence: number;
  evidence?: string;
}

export interface EmotionAnalysisResult {
  timestamp: number;
  face_detected: boolean;
  face_visibility: "none" | "low" | "medium" | "high" | "unknown";
  camera_quality: "poor" | "fair" | "good";
  lighting_quality: "poor" | "fair" | "good";
  dominant_signal: DominantSignal;
  ekman_style_emotion: {
    label: EkmanStyleEmotion;
    confidence: number;
  };
  facs_action_unit_hints: FACSActionUnitHint[];
  visual_evidence: string[];
  decision_warning: string;
  engagement: {
    score: number;
    trend: "increasing" | "stable" | "decreasing" | "unknown";
  };
  eye_contact: {
    score: number;
    evidence: string;
    confidence: number;
  };
  interpretation: string;
  limitations: string[];
  provider?: EmotionProviderName;
}

export type EmotionTrend = "increasing" | "stable" | "decreasing" | "unknown";

export interface EmotionProvider {
  name: EmotionProviderName;
  initialize: () => Promise<void>;
  start: (videoElement: HTMLVideoElement) => Promise<void>;
  stop: () => Promise<void>;
  onResult: (callback: (result: EmotionAnalysisResult) => void) => void;
}
