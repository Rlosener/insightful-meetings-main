import type {
  DominantSignal,
  EkmanStyleEmotion,
  EmotionAnalysisResult,
  EmotionTrend,
  FACSActionUnitHint,
} from "../types";
import { EMOTION_DECISION_WARNING } from "../constants";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const textValue = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase("tr-TR") : "";

export const confidenceLabelToScore = (value: unknown) => {
  if (typeof value === "number") return clamp01(value);
  const normalized = textValue(value);
  if (!normalized || normalized.includes("insufficient") || normalized.includes("kanıt")) return 0.18;
  if (normalized.includes("yüksek") || normalized.includes("high") || normalized.includes("strong")) return 0.82;
  if (normalized.includes("orta") || normalized.includes("medium") || normalized.includes("moderate")) return 0.58;
  if (normalized.includes("düşük") || normalized.includes("low") || normalized.includes("weak")) return 0.32;
  return 0.45;
};

export const visibilityValue = (value: unknown): EmotionAnalysisResult["face_visibility"] => {
  const normalized = textValue(value);
  if (!normalized) return "unknown";
  if (normalized.includes("none") || normalized.includes("yok")) return "none";
  if (normalized.includes("high") || normalized.includes("yüksek")) return "high";
  if (normalized.includes("medium") || normalized.includes("orta")) return "medium";
  if (normalized.includes("low") || normalized.includes("düşük")) return "low";
  return "unknown";
};

export const dominantMoodToSignal = (value: unknown): DominantSignal => {
  const normalized = textValue(value);
  if (!normalized || normalized.includes("insufficient") || normalized.includes("kanıt")) return "unknown";
  if (normalized.includes("aktif") || normalized.includes("ilgili") || normalized.includes("engaged")) return "engaged";
  if (normalized.includes("rahat") || normalized.includes("pozitif") || normalized.includes("positive") || normalized.includes("happy")) return "positive";
  if (normalized.includes("odak") || normalized.includes("focused")) return "focused";
  if (normalized.includes("karış") || normalized.includes("confus") || normalized.includes("dalgal")) return "confused";
  if (normalized.includes("stres") || normalized.includes("gergin") || normalized.includes("fear") || normalized.includes("anxious")) return "stressed";
  if (normalized.includes("mesaf") || normalized.includes("uncertain") || normalized.includes("temkin")) return "uncertain";
  if (normalized.includes("düşük") || normalized.includes("pasif") || normalized.includes("low")) return "low_engagement";
  if (normalized.includes("nötr") || normalized.includes("neutral")) return "neutral";
  return "unknown";
};

export const moodToEkmanEmotion = (value: unknown): EkmanStyleEmotion => {
  const normalized = textValue(value);
  if (!normalized || normalized.includes("insufficient") || normalized.includes("kanıt")) return "unknown";
  if (normalized.includes("rahat") || normalized.includes("pozitif") || normalized.includes("happy")) return "happiness";
  if (normalized.includes("düşük") || normalized.includes("sad")) return "sadness";
  if (normalized.includes("öfke") || normalized.includes("angry") || normalized.includes("sert")) return "anger";
  if (normalized.includes("fear") || normalized.includes("stres") || normalized.includes("gergin") || normalized.includes("endiş")) return "fear";
  if (normalized.includes("surprise") || normalized.includes("şaşk") || normalized.includes("dalgal")) return "surprise";
  if (normalized.includes("disgust") || normalized.includes("mesaf")) return "disgust";
  if (normalized.includes("nötr") || normalized.includes("neutral")) return "neutral";
  return "unknown";
};

export const computeEngagementTrend = (history: EmotionAnalysisResult[]): EmotionTrend => {
  if (history.length < 3) return "unknown";
  const recent = history.slice(-6);
  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));
  const avg = (items: EmotionAnalysisResult[]) =>
    items.reduce((sum, item) => sum + item.engagement.score, 0) / Math.max(1, items.length);
  const delta = avg(secondHalf) - avg(firstHalf);
  if (delta > 0.12) return "increasing";
  if (delta < -0.12) return "decreasing";
  return "stable";
};

const defaultLimitations: string[] = [];

const toStringList = (value: unknown) =>
  Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];

const emotionToFacsCatalog: Record<EkmanStyleEmotion, Array<Omit<FACSActionUnitHint, "confidence">>> = {
  happiness: [
    {
      au: "AU12",
      name: "Lip Corner Puller",
      observed_signal: "Dudak kosesinde yukari cekilme veya gulumseme sinyali aranir.",
      possible_interpretation: "Sosyal rahatlik ya da olumlu katilimla iliskili olabilir; tek basina mutluluk kaniti degildir.",
    },
    {
      au: "AU6",
      name: "Cheek Raiser",
      observed_signal: "Yanak bolgesinde yukselme ve goz cevresinde daralma sinyali aranir.",
      possible_interpretation: "Daha dogal gulumseme ihtimalini destekleyebilir; kamera kalitesi dusukse guven azalir.",
    },
  ],
  sadness: [
    {
      au: "AU1+AU4",
      name: "Inner Brow Raiser + Brow Lowerer",
      observed_signal: "Kas ic kisimlarinda yukselme veya kaslar arasinda gerilim sinyali aranir.",
      possible_interpretation: "Zorlanma, dusuk enerji veya yogun dusunme ile iliskili olabilir.",
    },
    {
      au: "AU15",
      name: "Lip Corner Depressor",
      observed_signal: "Dudak kosesinde asagi yonlu gerilim sinyali aranir.",
      possible_interpretation: "Dusuk enerji ya da memnuniyetsizlik sinyali olabilir; konusma icerigiyle dogrulanmalidir.",
    },
  ],
  anger: [
    {
      au: "AU4",
      name: "Brow Lowerer",
      observed_signal: "Kaslarda asagi cekilme ve kas arasi sikisma sinyali aranir.",
      possible_interpretation: "Yogun odak, rahatsizlik veya baski altinda gerilimle iliskili olabilir.",
    },
    {
      au: "AU7",
      name: "Lid Tightener",
      observed_signal: "Goz kapaklarinda sikilasma veya daralma sinyali aranir.",
      possible_interpretation: "Dikkat yogunlugu veya gerilim sinyali olabilir; tek basina ofke olarak okunmamalidir.",
    },
  ],
  fear: [
    {
      au: "AU1+AU2",
      name: "Inner/Outer Brow Raiser",
      observed_signal: "Kaslarda yukari yonlu acilma sinyali aranir.",
      possible_interpretation: "Belirsizlik, sasirma veya stresle iliskili olabilir.",
    },
    {
      au: "AU20",
      name: "Lip Stretcher",
      observed_signal: "Dudakta yatay gerilme sinyali aranir.",
      possible_interpretation: "Gerilim veya kaygi ihtimalini destekleyebilir; ses ve transkript ile kontrol edilmelidir.",
    },
  ],
  surprise: [
    {
      au: "AU1+AU2",
      name: "Brow Raiser",
      observed_signal: "Kaslarda yukari acilma sinyali aranir.",
      possible_interpretation: "Beklenmedik soru, sasirma veya dikkat artisi ile iliskili olabilir.",
    },
    {
      au: "AU5",
      name: "Upper Lid Raiser",
      observed_signal: "Goz acikliginda kisa sureli artis sinyali aranir.",
      possible_interpretation: "Ani tepki veya uyarilma sinyali olabilir; karar kaniti degildir.",
    },
  ],
  disgust: [
    {
      au: "AU9",
      name: "Nose Wrinkler",
      observed_signal: "Burun bolgesinde kirisma veya ust yuz gerilimi aranir.",
      possible_interpretation: "Rahatsizlik, mesafe veya fiziksel yuz hareketi olabilir.",
    },
    {
      au: "AU10",
      name: "Upper Lip Raiser",
      observed_signal: "Ust dudakta yukselme sinyali aranir.",
      possible_interpretation: "Elestirel tepki veya konusma artikulasyonu ile karisabilir.",
    },
  ],
  neutral: [
    {
      au: "AU0",
      name: "No Prominent Action Unit",
      observed_signal: "Belirgin ve tutarli mimik aktivitesi sinirli gorunuyor.",
      possible_interpretation: "Kontrollu, notr veya dusuk gorunurluklu ifade olabilir.",
    },
  ],
  unknown: [
    {
      au: "AU?",
      name: "Insufficient Visual Evidence",
      observed_signal: "Frame kalitesi veya yuz gorunurlugu belirgin AU cikarmak icin yetersiz.",
      possible_interpretation: "Duygu yorumu yerine daha fazla goruntu ve transkript kaniti gerekir.",
    },
  ],
};

const normalizeFacsHint = (value: unknown, fallbackConfidence: number): FACSActionUnitHint | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const au = typeof record.au === "string" ? record.au.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!au && !name) return null;
  const observedSignal = typeof record.observed_signal === "string"
    ? record.observed_signal.trim()
    : typeof record.evidence === "string"
      ? record.evidence.trim()
      : "Gorsel sinyal ayrintisi saglanmadi.";
  const possibleInterpretation = typeof record.possible_interpretation === "string"
    ? record.possible_interpretation.trim()
    : "Bu AU ipucu destekleyici gozlemdir; tek basina duygu ya da karar kaniti degildir.";
  return {
    au: au || "AU?",
    name: name || "Bilinmeyen AU",
    observed_signal: observedSignal,
    possible_interpretation: possibleInterpretation,
    confidence: confidenceLabelToScore(record.confidence ?? fallbackConfidence),
    evidence: typeof record.evidence === "string" ? record.evidence : observedSignal,
  };
};

const inferFacsHints = (
  raw: Record<string, unknown> | null | undefined,
  ekmanLabel: EkmanStyleEmotion,
  confidence: number,
) => {
  const explicit = Array.isArray(raw?.facs_action_unit_hints)
    ? raw.facs_action_unit_hints.map((item) => normalizeFacsHint(item, confidence)).filter((item): item is FACSActionUnitHint => Boolean(item))
    : [];
  if (explicit.length > 0) return explicit.slice(0, 5);

  const expressions = toStringList(raw?.common_expressions).join(", ");
  return emotionToFacsCatalog[ekmanLabel].map((hint) => ({
    ...hint,
    observed_signal: expressions ? `${hint.observed_signal} Modelin ek ifade notu: ${expressions}.` : hint.observed_signal,
    confidence: ekmanLabel === "unknown" ? Math.min(confidence, 0.25) : confidence,
  })).slice(0, 4);
};

const visualEvidenceList = (
  raw: Record<string, unknown> | null | undefined,
  faceVisibility: EmotionAnalysisResult["face_visibility"],
  dominantSignal: DominantSignal,
) => Array.from(new Set([
  ...toStringList(raw?.visual_evidence),
  ...toStringList(raw?.common_expressions).map((item) => `Ifade sinyali: ${item}`),
  typeof raw?.gaze_evidence === "string" ? `Bakis: ${raw.gaze_evidence}` : "",
  typeof raw?.camera_facing === "string" ? `Kamera acisi: ${raw.camera_facing}` : "",
  `Yuz gorunurlugu: ${faceVisibility}`,
  `Baskin sinyal: ${dominantSignal}`,
].filter(Boolean))).slice(0, 6);

export const normalizeEmotionAnalysis = (
  raw: Record<string, unknown> | null | undefined,
  history: EmotionAnalysisResult[] = [],
): EmotionAnalysisResult => {
  const faceVisibility = visibilityValue(raw?.face_visibility);
  const confidence = confidenceLabelToScore(raw?.visual_commentary_confidence ?? raw?.average_confidence);
  const dominantSignal = dominantMoodToSignal(raw?.dominant_signal ?? raw?.dominant_mood);
  const ekmanLabel = moodToEkmanEmotion(raw?.dominant_mood ?? raw?.dominant_signal);
  const engagementScore = confidenceLabelToScore(raw?.average_engagement);
  const eyeConfidence = confidenceLabelToScore(raw?.eye_contact_confidence ?? raw?.gaze_evidence);
  const limitations = [
    ...toStringList(raw?.observational_limits),
    ...defaultLimitations,
  ];
  const facsHints = inferFacsHints(raw, ekmanLabel, confidence);
  const visualEvidence = visualEvidenceList(raw, faceVisibility, dominantSignal);

  const normalized: EmotionAnalysisResult = {
    timestamp: typeof raw?.timestamp === "number" ? raw.timestamp : Date.now(),
    face_detected: faceVisibility !== "none" && faceVisibility !== "low" && faceVisibility !== "unknown",
    face_visibility: faceVisibility,
    camera_quality: faceVisibility === "high" ? "good" : faceVisibility === "medium" ? "fair" : "poor",
    lighting_quality: faceVisibility === "high" ? "good" : "fair",
    dominant_signal: dominantSignal,
    ekman_style_emotion: {
      label: ekmanLabel,
      confidence,
    },
    facs_action_unit_hints: facsHints,
    visual_evidence: visualEvidence,
    decision_warning: typeof raw?.decision_warning === "string" ? raw.decision_warning : EMOTION_DECISION_WARNING,
    engagement: {
      score: clamp01(engagementScore),
      trend: computeEngagementTrend(history),
    },
    eye_contact: {
      score: clamp01(eyeConfidence),
      evidence: typeof raw?.gaze_evidence === "string" ? raw.gaze_evidence : "insufficient_evidence",
      confidence: clamp01(eyeConfidence),
    },
    interpretation: typeof raw?.interpretation === "string"
      ? raw.interpretation
      : "Goruntude gozlenebilir sinyaller sinirli guvenle yorumlandi; transkript kaniti ile birlikte degerlendirilmelidir.",
    limitations: Array.from(new Set(limitations)).slice(0, 6),
    provider: "internal_vision",
  };

  return {
    ...normalized,
    engagement: {
      ...normalized.engagement,
      trend: computeEngagementTrend([...history, normalized]),
    },
  };
};
