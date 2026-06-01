import type { EmotionAnalysisResult, EkmanStyleEmotion } from "../types";

export const DATA_COLLECTING_LABEL = "Veri toplanıyor";

const visibilityLabels: Record<EmotionAnalysisResult["face_visibility"], string> = {
  none: "Yüz algılanmadı",
  low: "Yüz görünürlüğü sınırlı",
  medium: "Yüz görünürlüğü orta",
  high: "Yüz görünürlüğü iyi",
  unknown: DATA_COLLECTING_LABEL,
};

const ekmanLabels: Record<EkmanStyleEmotion, string> = {
  happiness: "Pozitif ifade benzeri",
  sadness: "Düşük enerji benzeri",
  anger: "Gerilim benzeri",
  fear: "Kaygı/stres benzeri",
  surprise: "Ani tepki/şaşırma benzeri",
  disgust: "Rahatsızlık/mesafe benzeri",
  neutral: "Nötr ifade",
  unknown: DATA_COLLECTING_LABEL,
};

const trendLabels: Record<EmotionAnalysisResult["engagement"]["trend"], string> = {
  increasing: "10 saniyelik pencerede artış eğilimi var",
  stable: "10 saniyelik pencerede belirgin yön oluşmadı",
  decreasing: "10 saniyelik pencerede düşüş eğilimi var",
  unknown: "10 saniyelik yorum için veri toplanıyor",
};

export const sanitizeSignalLabel = (value: unknown, fallback = DATA_COLLECTING_LABEL) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" && Number.isNaN(value)) return "Hesaplanamadı";
  if (Array.isArray(value) && value.length === 0) return fallback;
  const text = String(value).trim();
  if (!text || text === "[]" || text === "undefined" || text === "null" || text === "NaN") return fallback;
  const normalized = text.toLocaleLowerCase("tr-TR");
  if (normalized === "unknown" || normalized.includes("insufficient")) return fallback;
  if (normalized === "weak") return "Zayıf kanıt";
  if (normalized === "passive" || normalized === "pasif") return "Düşük katılım sinyali";
  if (normalized === "low") return "Sınırlı kanıt";
  if (normalized === "medium") return "Orta düzey kanıt";
  if (normalized === "high") return "Belirgin kanıt";
  return text;
};

export const formatScoreLabel = (score: number, labels: { low: string; medium: string; high: string }) => {
  if (!Number.isFinite(score)) return "Hesaplanamadı";
  if (score < 0.34) return labels.low;
  if (score < 0.67) return labels.medium;
  return labels.high;
};

export const formatLevelLabel = (score: number) => {
  if (!Number.isFinite(score)) return "Hesaplanamadı";
  if (score < 0.34) return "Düşük";
  if (score < 0.67) return "Orta";
  return "Yüksek";
};

export const formatFaceVisibility = (visibility: EmotionAnalysisResult["face_visibility"]) =>
  visibilityLabels[visibility] || DATA_COLLECTING_LABEL;

export const formatEkmanLabel = (label: EkmanStyleEmotion) =>
  ekmanLabels[label] || DATA_COLLECTING_LABEL;

export const formatTrendLabel = (trend: EmotionAnalysisResult["engagement"]["trend"]) =>
  trendLabels[trend] || trendLabels.unknown;
