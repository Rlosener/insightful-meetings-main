import {
  EMOTION_DECISION_WARNING,
  EMOTION_MIN_SAMPLES_FOR_SESSION_SUMMARY,
  EMOTION_ROLLING_WINDOW_MS,
} from "../constants";
import type { EkmanStyleEmotion, EmotionAnalysisResult } from "../types";
import { buildFacsAuScores } from "./facsAuEngine";
import {
  DATA_COLLECTING_LABEL,
  formatEkmanLabel,
  formatLevelLabel,
  formatScoreLabel,
  formatTrendLabel,
} from "./facsLabelFormatter";

export type CameraSignalTendency = "positive" | "neutral" | "negative";

export type FacsAuSessionResult = {
  timestamp: number;
  window: {
    durationMs: 10000;
    sampleCount: number;
    startedAt: number;
    endedAt: number;
  };
  face: {
    detected: boolean;
    visibility: "none" | "low" | "medium" | "high" | "unknown";
    qualityLabel: string;
  };
  evidence: {
    expressionSummary: string;
    gazeSummary: string;
    cameraAngleSummary: string;
    lightingSummary: string;
    movementSummary: string;
  };
  ekman: {
    label: EkmanStyleEmotion;
    labelTr: string;
    confidence: number;
  };
  facsActionUnits: Array<{
    au: string;
    name: string;
    observedSignal: string;
    possibleInterpretation: string;
    confidence: number;
  }>;
  scores: {
    engagement: number;
    focus: number;
    stressSignal: number;
    uncertainty: number;
    positiveSignal: number;
    negativeSignal: number;
    neutralSignal: number;
    eyeContact: number;
    observationConfidence: number;
  };
  signal: {
    tendency: CameraSignalTendency;
    label: "Pozitif" | "Nötr" | "Negatif";
    summary: string;
    facsAuInference: string;
  };
  labels: {
    engagement: string;
    focus: string;
    stressSignal: string;
    uncertainty: string;
    positiveSignal: string;
    eyeContact: string;
    trend: string;
  };
  interpretation: {
    title: string;
    summary: string;
    hrNote: string;
  };
  limitations: string[];
  decisionWarning: string;
};

const emptyScores = {
  engagement: 0,
  focus: 0,
  stressSignal: 0,
  uncertainty: 0,
  positiveSignal: 0,
  negativeSignal: 0,
  neutralSignal: 0,
  eyeContact: 0,
  observationConfidence: 0,
};

const average = (values: number[]) => {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
};

const mostFrequent = <T extends string>(values: T[], fallback: T) => {
  if (values.length === 0) return fallback;
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return values.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0] || fallback;
};

const unique = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const lower = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const blockedLimitationPatterns = [
  "kamera/duygu sinyali destekleyici",
  "tek basina",
  "tek başına",
  "karar kriteri",
  "aday eleme",
  "kabul nedeni",
  "yuz gorunurlugu, isik",
  "yüz görünürlüğü, ışık",
  "gozluk, maske",
  "gözlük, maske",
  "frame kalitesi sonucu etkileyebilir",
];

const filterHrUsefulLimitations = (limitations: string[]) =>
  unique(limitations).filter((item) => {
    const normalized = lower(item);
    return !blockedLimitationPatterns.some((pattern) => normalized.includes(lower(pattern)));
  });

const buildLabels = (scores: FacsAuSessionResult["scores"], hasEnoughSamples: boolean, trend: EmotionAnalysisResult["engagement"]["trend"]) => {
  if (!hasEnoughSamples) {
    return {
      engagement: DATA_COLLECTING_LABEL,
      focus: DATA_COLLECTING_LABEL,
      stressSignal: DATA_COLLECTING_LABEL,
      uncertainty: DATA_COLLECTING_LABEL,
      positiveSignal: DATA_COLLECTING_LABEL,
      eyeContact: DATA_COLLECTING_LABEL,
      trend: "10 saniyelik yorum için veri toplanıyor",
    };
  }

  return {
    engagement: formatLevelLabel(scores.engagement),
    focus: formatLevelLabel(scores.focus),
    stressSignal: formatLevelLabel(scores.stressSignal),
    uncertainty: formatScoreLabel(scores.uncertainty, {
      low: "Belirsizlik ipucu düşük",
      medium: "Düşük-orta belirsizlik ipucu",
      high: "Belirgin belirsizlik ipucu",
    }),
    positiveSignal: formatScoreLabel(scores.positiveSignal, {
      low: "Pozitif ifade kanıtı sınırlı",
      medium: "Düşük-orta pozitif ifade ipucu",
      high: "Belirgin pozitif ifade ipucu",
    }),
    eyeContact: formatScoreLabel(scores.eyeContact, {
      low: "Sınırlı göz teması kanıtı",
      medium: "Orta düzey bakış kanıtı",
      high: "Belirgin bakış kanıtı",
    }),
    trend: formatTrendLabel(trend),
  };
};

const tendencyLabels: Record<CameraSignalTendency, "Pozitif" | "Nötr" | "Negatif"> = {
  positive: "Pozitif",
  neutral: "Nötr",
  negative: "Negatif",
};

const resolveTendency = (positiveScore: number, negativeScore: number): CameraSignalTendency => {
  if (positiveScore >= 0.38 && positiveScore > negativeScore + 0.08) return "positive";
  if (negativeScore >= 0.34 && negativeScore > positiveScore + 0.08) return "negative";
  return "neutral";
};

const formatFaceAdequacy = (visibility: EmotionAnalysisResult["face_visibility"]) => {
  if (visibility === "high" || visibility === "medium") return "Yüz görünürlüğü: Yeterli";
  if (visibility === "low") return "Yüz görünürlüğü: Sınırlı";
  return "Yüz görünürlüğü: Yetersiz";
};

const buildTendencySummary = (
  tendency: CameraSignalTendency,
  scores: FacsAuSessionResult["scores"],
) => {
  if (tendency === "positive") {
    return `Son 10 saniyede pozitif ifade hattı daha belirgin. Katılım ${formatLevelLabel(scores.engagement).toLocaleLowerCase("tr-TR")}, odak ${formatLevelLabel(scores.focus).toLocaleLowerCase("tr-TR")} düzeyde izleniyor.`;
  }
  if (tendency === "negative") {
    return `Son 10 saniyede gerilim veya zorlanma hattı daha belirgin. Gerilim ${formatLevelLabel(scores.stressSignal).toLocaleLowerCase("tr-TR")}, belirsizlik ${formatLevelLabel(scores.uncertainty).toLocaleLowerCase("tr-TR")} düzeyde izleniyor.`;
  }
  return `Son 10 saniyede belirgin pozitif veya negatif ifade baskınlığı oluşmadı. Katılım ${formatLevelLabel(scores.engagement).toLocaleLowerCase("tr-TR")}, odak ${formatLevelLabel(scores.focus).toLocaleLowerCase("tr-TR")}, gerilim ${formatLevelLabel(scores.stressSignal).toLocaleLowerCase("tr-TR")} düzeyde izleniyor.`;
};

const buildFacsAuInference = (
  tendency: CameraSignalTendency,
  scores: FacsAuSessionResult["scores"],
  faceLabel: string,
  ekmanLabel: EkmanStyleEmotion,
) => {
  const ekmanText = formatEkmanLabel(ekmanLabel).toLocaleLowerCase("tr-TR");
  const confidence = formatLevelLabel(scores.observationConfidence).toLocaleLowerCase("tr-TR");
  if (tendency === "positive") {
    return `Ekman/FACS çerçevesinde ${ekmanText} ve pozitif yüz kası hattı daha okunur durumda. ${faceLabel}; gözlem güveni ${confidence}. İK için bu bölüm, adayın daha rahat aktardığı cevap anı olarak işaretlenebilir; takipte somut örnek, rol payı ve ölçülebilir sonuç netliği kontrol edilmelidir.`;
  }
  if (tendency === "negative") {
    return `Ekman/FACS çerçevesinde ${ekmanText} ve kaş-göz-dudak gerilimi hattı daha okunur durumda. ${faceLabel}; gözlem güveni ${confidence}. İK için bu bölüm, adayın zorlandığı veya daha fazla düşünme yükü aldığı an olabilir; cevabı kesmeden netleştirici takip sorusu açılmalıdır.`;
  }
  return `Ekman/FACS çerçevesinde belirgin pozitif ifade ya da gerilim baskınlığı oluşmadı. ${faceLabel}; gözlem güveni ${confidence}. İK için mimik sinyali düşük ayrıştırıcıdır; bu bölümde ağırlık cevap yapısı, örnek netliği ve tutarlılık kontrolüne verilmelidir.`;
};

const buildHrFollowUp = (tendency: CameraSignalTendency, scores: FacsAuSessionResult["scores"]) => {
  if (tendency === "positive") {
    return "İK takip önerisi: Adayın rahat göründüğü bu cevap bölümünde başarı örneğinin bağlamını, kendi rolünü ve sonuç metriğini ayrı ayrı sordurun.";
  }
  if (tendency === "negative") {
    return "İK takip önerisi: Bu bölümde zorlanma sinyali arttığı için 'Bu noktayı gerçek bir örnekle açabilir misiniz?' veya 'Burada en kritik kararınız neydi?' gibi netleştirici soru kullanın.";
  }
  if (scores.focus >= 0.55 && scores.engagement >= 0.5) {
    return "İK takip önerisi: Aday kontrollü ve odaklı görünüyor; aynı çizgide STAR formatında durum, aksiyon ve sonuç ayrıntısı isteyin.";
  }
  return "İK takip önerisi: Mimik sinyali düşük ayrıştırıcı. Bu bölümde karar yerine cevap içeriğinin somutluğu, zaman çizgisi ve önceki cevaplarla tutarlılığı kontrol edin.";
};

const fallbackResult = (now: number, sampleCount: number): FacsAuSessionResult => ({
  timestamp: now,
  window: {
    durationMs: EMOTION_ROLLING_WINDOW_MS as 10000,
    sampleCount,
    startedAt: now - EMOTION_ROLLING_WINDOW_MS,
    endedAt: now,
  },
  face: {
    detected: false,
    visibility: "unknown",
    qualityLabel: DATA_COLLECTING_LABEL,
  },
  evidence: {
    expressionSummary: "Görsel kanıt toplanıyor. 10 saniyelik yorum için en az 3 örnek bekleniyor.",
    gazeSummary: DATA_COLLECTING_LABEL,
    cameraAngleSummary: DATA_COLLECTING_LABEL,
    lightingSummary: DATA_COLLECTING_LABEL,
    movementSummary: DATA_COLLECTING_LABEL,
  },
  ekman: {
    label: "unknown",
    labelTr: DATA_COLLECTING_LABEL,
    confidence: 0,
  },
  facsActionUnits: [],
  scores: { ...emptyScores },
  signal: {
    tendency: "neutral",
    label: "Nötr",
    summary: "Görsel kanıt toplanıyor. 10 saniyelik yorum için en az 3 örnek bekleniyor.",
    facsAuInference: "Görsel kanıt toplanıyor. 10 saniyelik yorum için en az 3 örnek bekleniyor.",
  },
  labels: buildLabels(emptyScores, false, "unknown"),
  interpretation: {
    title: DATA_COLLECTING_LABEL,
    summary: "Görsel kanıt toplanıyor. Yorum için en az 3 örnek bekleniyor.",
    hrNote: "İK takip önerisi: Örnek sayısı oluşana kadar aday cevabının içeriğine odaklanın.",
  },
  limitations: ["Görsel kanıt toplanıyor.", "Yorum için en az 3 örnek bekleniyor."],
  decisionWarning: EMOTION_DECISION_WARNING,
});

export const buildFacsAuSessionResult = (
  results: EmotionAnalysisResult[],
  now = Date.now(),
): FacsAuSessionResult => {
  const windowResults = results
    .filter((result) => now - result.timestamp <= EMOTION_ROLLING_WINDOW_MS)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (windowResults.length < EMOTION_MIN_SAMPLES_FOR_SESSION_SUMMARY) {
    return fallbackResult(now, windowResults.length);
  }

  const scored = windowResults.map((result) => ({ result, facs: buildFacsAuScores(result) }));
  const scores = {
    engagement: average(scored.map((item) => item.facs.scores.engagement)),
    focus: average(scored.map((item) => item.facs.scores.focus)),
    stressSignal: average(scored.map((item) => item.facs.scores.stressSignal)),
    uncertainty: average(scored.map((item) => item.facs.scores.uncertainty)),
    positiveSignal: average(scored.map((item) => item.facs.scores.positiveSignal)),
    negativeSignal: average(scored.map((item) => item.facs.scores.negativeSignal)),
    neutralSignal: average(scored.map((item) => item.facs.scores.neutralSignal)),
    eyeContact: average(scored.map((item) => item.facs.scores.eyeContact)),
    observationConfidence: average(scored.map((item) => item.facs.scores.observationConfidence)),
  };

  const firstHalf = scored.slice(0, Math.max(1, Math.floor(scored.length / 2)));
  const secondHalf = scored.slice(Math.max(1, Math.floor(scored.length / 2)));
  const engagementDelta = average(secondHalf.map((item) => item.facs.scores.engagement)) - average(firstHalf.map((item) => item.facs.scores.engagement));
  const trend: EmotionAnalysisResult["engagement"]["trend"] = engagementDelta > 0.12 ? "increasing" : engagementDelta < -0.12 ? "decreasing" : "stable";
  const labels = buildLabels(scores, true, trend);
  const faceVisibility = mostFrequent(windowResults.map((result) => result.face_visibility), "unknown");
  const faceLabel = formatFaceAdequacy(faceVisibility);
  const ekmanLabel = mostFrequent(windowResults.map((result) => result.ekman_style_emotion.label), "unknown");
  const actionUnits = scored
    .flatMap((item) => item.facs.actionUnits)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  const visualEvidence = unique(windowResults.flatMap((result) => result.visual_evidence)).slice(0, 6);
  const limitations = filterHrUsefulLimitations(windowResults.flatMap((result) => result.limitations)).slice(0, 4);

  const tendency = resolveTendency(scores.positiveSignal, scores.negativeSignal);
  const signal = {
    tendency,
    label: tendencyLabels[tendency],
    summary: buildTendencySummary(tendency, scores),
    facsAuInference: buildFacsAuInference(tendency, scores, faceLabel, ekmanLabel),
  };

  const gazeSummary = signal.summary;
  const cameraAngleSummary = visualEvidence.find((item) => item.toLocaleLowerCase("tr-TR").includes("kamera")) || faceLabel;
  const lightingSummary = mostFrequent(windowResults.map((result) => result.lighting_quality), "fair") === "poor"
    ? "Işık kanıtı sınırlı"
    : "Işık koşulu yorum için kullanılabilir düzeyde";
  const movementSummary = `Yorum güveni ${formatLevelLabel(scores.observationConfidence).toLocaleLowerCase("tr-TR")} düzeydedir.`;
  const topVisualEvidence = visualEvidence
    .filter((item) => !lower(item).includes("baskin sinyal"))
    .slice(0, 2)
    .join("; ");
  const evidenceSummary = [
    `${faceLabel}.`,
    `10 saniyelik pencerede ifade eğilimi ${signal.label.toLocaleLowerCase("tr-TR")} ağırlıklı ilerledi.`,
    `Katılım ${formatLevelLabel(scores.engagement).toLocaleLowerCase("tr-TR")}, odak ${formatLevelLabel(scores.focus).toLocaleLowerCase("tr-TR")}, gerilim ${formatLevelLabel(scores.stressSignal).toLocaleLowerCase("tr-TR")} düzeyde.`,
    `Yorum güveni ${formatLevelLabel(scores.observationConfidence).toLocaleLowerCase("tr-TR")} düzeydedir.`,
    topVisualEvidence ? `Gözlenen kanıt: ${topVisualEvidence}.` : "",
  ].filter(Boolean).join(" ");
  const hrNote = buildHrFollowUp(tendency, scores);

  return {
    timestamp: now,
    window: {
      durationMs: EMOTION_ROLLING_WINDOW_MS as 10000,
      sampleCount: windowResults.length,
      startedAt: windowResults[0]?.timestamp || now - EMOTION_ROLLING_WINDOW_MS,
      endedAt: windowResults[windowResults.length - 1]?.timestamp || now,
    },
    face: {
      detected: windowResults.some((result) => result.face_detected),
      visibility: faceVisibility,
      qualityLabel: faceLabel,
    },
    evidence: {
      expressionSummary: evidenceSummary,
      gazeSummary,
      cameraAngleSummary,
      lightingSummary,
      movementSummary,
    },
    ekman: {
      label: ekmanLabel,
      labelTr: formatEkmanLabel(ekmanLabel),
      confidence: average(windowResults.map((result) => result.ekman_style_emotion.confidence)),
    },
    facsActionUnits: actionUnits,
    scores,
    signal,
    labels,
    interpretation: {
      title: `10 saniyelik genel eğilim: ${signal.label}`,
      summary: signal.summary,
      hrNote,
    },
    limitations,
    decisionWarning: windowResults.find((result) => result.decision_warning)?.decision_warning || EMOTION_DECISION_WARNING,
  };
};
