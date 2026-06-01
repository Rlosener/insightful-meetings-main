export type EmotionAnalysisResult = {
  timestamp: number;
  face_detected: boolean;
  face_visibility: "none" | "low" | "medium" | "high" | "unknown";
  camera_quality: "poor" | "fair" | "good";
  lighting_quality: "poor" | "fair" | "good";
  dominant_signal: "neutral" | "positive" | "focused" | "confused" | "stressed" | "uncertain" | "engaged" | "low_engagement" | "unknown";
  ekman_style_emotion: {
    label: "happiness" | "sadness" | "anger" | "fear" | "surprise" | "disgust" | "neutral" | "unknown";
    confidence: number;
  };
  facs_action_unit_hints: Array<{
    au: string;
    name: string;
    observed_signal: string;
    possible_interpretation: string;
    confidence: number;
    evidence?: string;
  }>;
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
};

const text = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase("tr-TR") : "";
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const EMOTION_DECISION_WARNING =
  "Duygu durumu ve FACS/AU ipuclari ise alim karari icin tek basina kullanilamaz; transkript, rol kaniti, yetkinlik degerlendirmesi ve insan gozlemiyle birlikte ele alinmalidir.";

const score = (value: unknown) => {
  if (typeof value === "number") return clamp01(value);
  const normalized = text(value);
  if (!normalized || normalized.includes("insufficient") || normalized.includes("kanıt")) return 0.18;
  if (normalized.includes("yüksek") || normalized.includes("high") || normalized.includes("strong")) return 0.82;
  if (normalized.includes("orta") || normalized.includes("medium") || normalized.includes("moderate")) return 0.58;
  if (normalized.includes("düşük") || normalized.includes("low") || normalized.includes("weak")) return 0.32;
  if (normalized.includes("aktif") || normalized.includes("ilgili")) return 0.68;
  if (normalized.includes("pasif") || normalized.includes("ilgisiz")) return 0.28;
  return 0.45;
};

const visibility = (value: unknown): EmotionAnalysisResult["face_visibility"] => {
  const normalized = text(value);
  if (!normalized) return "unknown";
  if (normalized.includes("high") || normalized.includes("yüksek")) return "high";
  if (normalized.includes("medium") || normalized.includes("orta")) return "medium";
  if (normalized.includes("low") || normalized.includes("düşük")) return "low";
  if (normalized.includes("none") || normalized.includes("yok")) return "none";
  return "unknown";
};

const signal = (value: unknown): EmotionAnalysisResult["dominant_signal"] => {
  const normalized = text(value);
  if (!normalized || normalized.includes("insufficient") || normalized.includes("kanıt")) return "unknown";
  if (normalized.includes("rahat") || normalized.includes("pozitif") || normalized.includes("happy")) return "positive";
  if (normalized.includes("odak") || normalized.includes("focused")) return "focused";
  if (normalized.includes("aktif") || normalized.includes("ilgili") || normalized.includes("engaged")) return "engaged";
  if (normalized.includes("stres") || normalized.includes("gergin") || normalized.includes("fear")) return "stressed";
  if (normalized.includes("dalgal") || normalized.includes("karış") || normalized.includes("confus")) return "confused";
  if (normalized.includes("mesaf") || normalized.includes("temkin") || normalized.includes("uncertain")) return "uncertain";
  if (normalized.includes("düşük") || normalized.includes("pasif")) return "low_engagement";
  if (normalized.includes("nötr") || normalized.includes("neutral")) return "neutral";
  return "unknown";
};

type EkmanLabel = NonNullable<EmotionAnalysisResult["ekman_style_emotion"]>["label"];

const ekman = (value: unknown): EkmanLabel => {
  const normalized = text(value);
  if (!normalized || normalized.includes("insufficient") || normalized.includes("kanıt")) return "unknown";
  if (normalized.includes("rahat") || normalized.includes("pozitif") || normalized.includes("happy")) return "happiness";
  if (normalized.includes("düşük") || normalized.includes("sad")) return "sadness";
  if (normalized.includes("öfke") || normalized.includes("angry")) return "anger";
  if (normalized.includes("fear") || normalized.includes("stres") || normalized.includes("gergin")) return "fear";
  if (normalized.includes("surprise") || normalized.includes("dalgal")) return "surprise";
  if (normalized.includes("disgust") || normalized.includes("mesaf")) return "disgust";
  if (normalized.includes("nötr") || normalized.includes("neutral")) return "neutral";
  return "unknown";
};

const list = (value: unknown) =>
  Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];

const facsCatalog: Record<EkmanLabel, Array<Omit<EmotionAnalysisResult["facs_action_unit_hints"][number], "confidence">>> = {
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

const normalizeFacs = (value: unknown, fallbackConfidence: number): EmotionAnalysisResult["facs_action_unit_hints"][number] | null => {
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
  return {
    au: au || "AU?",
    name: name || "Bilinmeyen AU",
    observed_signal: observedSignal,
    possible_interpretation: typeof record.possible_interpretation === "string"
      ? record.possible_interpretation.trim()
      : "Bu AU ipucu destekleyici gozlemdir; tek basina duygu ya da karar kaniti degildir.",
    confidence: score(record.confidence ?? fallbackConfidence),
    evidence: typeof record.evidence === "string" ? record.evidence : observedSignal,
  };
};

const facsHints = (
  analysis: Record<string, unknown>,
  ekmanLabel: EkmanLabel,
  confidence: number,
) => {
  const explicit = Array.isArray(analysis.facs_action_unit_hints)
    ? analysis.facs_action_unit_hints.map((item) => normalizeFacs(item, confidence)).filter((item): item is EmotionAnalysisResult["facs_action_unit_hints"][number] => Boolean(item))
    : [];
  if (explicit.length > 0) return explicit.slice(0, 5);

  const expressions = list(analysis.common_expressions).join(", ");
  return facsCatalog[ekmanLabel].map((hint) => ({
    ...hint,
    observed_signal: expressions ? `${hint.observed_signal} Modelin ek ifade notu: ${expressions}.` : hint.observed_signal,
    confidence: ekmanLabel === "unknown" ? Math.min(confidence, 0.25) : confidence,
  })).slice(0, 4);
};

export const normalizeEmotionAnalysis = (analysis: Record<string, unknown>): EmotionAnalysisResult => {
  const faceVisibility = visibility(analysis.face_visibility);
  const confidence = score(analysis.visual_commentary_confidence ?? analysis.average_confidence);
  const limits = list(analysis.observational_limits);
  const ekmanLabel = ekman(analysis.ekman_style_emotion && typeof analysis.ekman_style_emotion === "object"
    ? (analysis.ekman_style_emotion as Record<string, unknown>).label
    : analysis.dominant_mood);
  const dominantSignal = signal(analysis.dominant_signal ?? analysis.dominant_mood);
  const visualEvidence = Array.from(new Set([
    ...list(analysis.visual_evidence),
    ...list(analysis.common_expressions).map((item) => `Ifade sinyali: ${item}`),
    typeof analysis.gaze_evidence === "string" ? `Bakis: ${analysis.gaze_evidence}` : "",
    typeof analysis.camera_facing === "string" ? `Kamera acisi: ${analysis.camera_facing}` : "",
    `Yuz gorunurlugu: ${faceVisibility}`,
    `Baskin sinyal: ${dominantSignal}`,
  ].filter(Boolean))).slice(0, 6);

  return {
    timestamp: Date.now(),
    face_detected: faceVisibility !== "none" && faceVisibility !== "low" && faceVisibility !== "unknown",
    face_visibility: faceVisibility,
    camera_quality: analysis.camera_quality === "poor" || faceVisibility === "low" ? "poor" : faceVisibility === "high" ? "good" : "fair",
    lighting_quality: analysis.lighting_quality === "poor" ? "poor" : faceVisibility === "high" ? "good" : "fair",
    dominant_signal: dominantSignal,
    ekman_style_emotion: {
      label: ekmanLabel,
      confidence,
    },
    facs_action_unit_hints: facsHints(analysis, ekmanLabel, confidence),
    visual_evidence: visualEvidence,
    decision_warning: typeof analysis.decision_warning === "string" ? analysis.decision_warning : EMOTION_DECISION_WARNING,
    engagement: {
      score: score(analysis.average_engagement),
      trend: "unknown",
    },
    eye_contact: {
      score: score(analysis.eye_contact_confidence ?? analysis.gaze_evidence),
      evidence: typeof analysis.gaze_evidence === "string" ? analysis.gaze_evidence : "insufficient_evidence",
      confidence: score(analysis.eye_contact_confidence ?? analysis.gaze_evidence),
    },
    interpretation: typeof analysis.interpretation === "string"
      ? analysis.interpretation
      : "Gorsel sinyaller destekleyici gozlem olarak yorumlandi; transkript kaniti ile birlikte degerlendirilmelidir.",
    limitations: Array.from(new Set(limits)),
  };
};
