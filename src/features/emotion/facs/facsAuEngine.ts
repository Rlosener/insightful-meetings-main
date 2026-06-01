import type { EmotionAnalysisResult, FACSActionUnitHint } from "../types";
import { FACS_AU_DEFINITIONS, KNOWN_FACS_AU_IDS, type FacsAuId } from "./facsAuDefinitions";

export interface FacsAuScoreResult {
  auScores: Partial<Record<FacsAuId, number>>;
  actionUnits: Array<{
    au: FacsAuId;
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
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const average = (values: number[]) => {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
};

const weightedAverage = (items: Array<[number, number]>) => {
  const valid = items.filter(([value, weight]) => Number.isFinite(value) && Number.isFinite(weight) && weight > 0);
  const totalWeight = valid.reduce((sum, [, weight]) => sum + weight, 0);
  if (!totalWeight) return 0;
  return valid.reduce((sum, [value, weight]) => sum + clamp01(value) * weight, 0) / totalWeight;
};

const visibilityScore: Record<EmotionAnalysisResult["face_visibility"], number> = {
  high: 1,
  medium: 0.76,
  low: 0.38,
  none: 0.08,
  unknown: 0.24,
};

const qualityScore: Record<EmotionAnalysisResult["camera_quality"] | EmotionAnalysisResult["lighting_quality"], number> = {
  good: 0.86,
  fair: 0.58,
  poor: 0.24,
};

const dominantSignalVectors: Record<EmotionAnalysisResult["dominant_signal"], {
  positive: number;
  negative: number;
  focus: number;
  stress: number;
  uncertainty: number;
  engagement: number;
}> = {
  positive: { positive: 0.8, negative: 0.12, focus: 0.52, stress: 0.12, uncertainty: 0.14, engagement: 0.72 },
  engaged: { positive: 0.54, negative: 0.12, focus: 0.72, stress: 0.12, uncertainty: 0.16, engagement: 0.86 },
  focused: { positive: 0.28, negative: 0.22, focus: 0.88, stress: 0.28, uncertainty: 0.2, engagement: 0.68 },
  confused: { positive: 0.1, negative: 0.5, focus: 0.34, stress: 0.48, uncertainty: 0.82, engagement: 0.36 },
  stressed: { positive: 0.08, negative: 0.74, focus: 0.48, stress: 0.86, uncertainty: 0.66, engagement: 0.34 },
  uncertain: { positive: 0.12, negative: 0.52, focus: 0.42, stress: 0.56, uncertainty: 0.78, engagement: 0.42 },
  low_engagement: { positive: 0.08, negative: 0.36, focus: 0.2, stress: 0.26, uncertainty: 0.44, engagement: 0.16 },
  neutral: { positive: 0.18, negative: 0.18, focus: 0.48, stress: 0.16, uncertainty: 0.24, engagement: 0.48 },
  unknown: { positive: 0.12, negative: 0.12, focus: 0.22, stress: 0.12, uncertainty: 0.22, engagement: 0.24 },
};

const ekmanVectors: Record<EmotionAnalysisResult["ekman_style_emotion"]["label"], {
  positive: number;
  negative: number;
  focus: number;
  stress: number;
  uncertainty: number;
  engagement: number;
}> = {
  happiness: { positive: 0.88, negative: 0.08, focus: 0.5, stress: 0.08, uncertainty: 0.12, engagement: 0.7 },
  sadness: { positive: 0.08, negative: 0.58, focus: 0.24, stress: 0.38, uncertainty: 0.5, engagement: 0.22 },
  anger: { positive: 0.05, negative: 0.82, focus: 0.56, stress: 0.78, uncertainty: 0.38, engagement: 0.34 },
  fear: { positive: 0.04, negative: 0.66, focus: 0.38, stress: 0.86, uncertainty: 0.78, engagement: 0.28 },
  surprise: { positive: 0.24, negative: 0.34, focus: 0.58, stress: 0.4, uncertainty: 0.72, engagement: 0.54 },
  disgust: { positive: 0.04, negative: 0.7, focus: 0.36, stress: 0.52, uncertainty: 0.4, engagement: 0.26 },
  neutral: { positive: 0.14, negative: 0.14, focus: 0.44, stress: 0.12, uncertainty: 0.18, engagement: 0.46 },
  unknown: { positive: 0.08, negative: 0.08, focus: 0.2, stress: 0.1, uncertainty: 0.2, engagement: 0.2 },
};

export const parseActionUnitIds = (value: string): FacsAuId[] => {
  const matches = value.toUpperCase().match(/AU\d{1,2}/g) || [];
  return Array.from(new Set(matches.filter((au): au is FacsAuId => (
    KNOWN_FACS_AU_IDS.includes(au as FacsAuId)
  ))));
};

const actionUnitFromHint = (hint: FACSActionUnitHint) => {
  const auIds = parseActionUnitIds(hint.au);
  return auIds.map((au) => {
    const definition = FACS_AU_DEFINITIONS[au];
    return {
      au,
      name: hint.name || definition.name,
      observedSignal: hint.observed_signal || hint.evidence || definition.description,
      possibleInterpretation: hint.possible_interpretation || "Bu AU ipucu destekleyici kamera sinyalidir; tek başına karar kanıtı değildir.",
      confidence: clamp01(hint.confidence),
    };
  });
};

export const buildFacsAuScores = (result: EmotionAnalysisResult): FacsAuScoreResult => {
  const actionUnits = result.facs_action_unit_hints.flatMap(actionUnitFromHint);
  const auScores = actionUnits.reduce<Partial<Record<FacsAuId, number>>>((acc, item) => {
    acc[item.au] = Math.max(acc[item.au] || 0, item.confidence);
    return acc;
  }, {});

  const scoreFor = (...ids: FacsAuId[]) => ids.map((id) => auScores[id] || 0);
  const maxFor = (...ids: FacsAuId[]) => Math.max(0, ...scoreFor(...ids));
  const eyeContact = clamp01(result.eye_contact.score || result.eye_contact.confidence || 0);
  const engagementInput = clamp01(result.engagement.score);
  const dominant = dominantSignalVectors[result.dominant_signal] || dominantSignalVectors.unknown;
  const ekman = ekmanVectors[result.ekman_style_emotion.label] || ekmanVectors.unknown;
  const ekmanWeight = clamp01(result.ekman_style_emotion.confidence || 0.2);
  const faceQuality = visibilityScore[result.face_visibility] ?? visibilityScore.unknown;
  const visualQuality = weightedAverage([
    [faceQuality, 0.45],
    [qualityScore[result.camera_quality] ?? 0.35, 0.25],
    [qualityScore[result.lighting_quality] ?? 0.35, 0.2],
    [result.face_detected ? 1 : 0.15, 0.1],
  ]);
  const auEvidence = average(actionUnits.map((item) => item.confidence));
  const observationConfidence = average([
    weightedAverage([
      [result.ekman_style_emotion.confidence, 0.34],
      [result.eye_contact.confidence || eyeContact, 0.18],
      [auEvidence, actionUnits.length > 0 ? 0.26 : 0.08],
      [visualQuality, 0.22],
    ]),
    visualQuality,
  ]);

  const auPositive = weightedAverage([[auScores.AU12 || 0, 0.58], [auScores.AU6 || 0, 0.42]]);
  const auNegative = weightedAverage([
    [auScores.AU4 || 0, 0.25],
    [auScores.AU7 || 0, 0.18],
    [auScores.AU15 || 0, 0.28],
    [auScores.AU23 || 0, 0.29],
  ]);
  const auFocus = weightedAverage([
    [maxFor("AU4", "AU7"), 0.32],
    [auScores.AU5 || 0, 0.18],
    [eyeContact, 0.3],
    [engagementInput, 0.2],
  ]);
  const auStress = weightedAverage([
    [auScores.AU4 || 0, 0.25],
    [auScores.AU7 || 0, 0.18],
    [auScores.AU23 || 0, 0.3],
    [auScores.AU45 || 0, 0.12],
    [auScores.AU15 || 0, 0.15],
  ]);

  const positiveSignal = clamp01(weightedAverage([
    [auPositive, 0.42],
    [ekman.positive, 0.22 * ekmanWeight],
    [dominant.positive, 0.22],
    [engagementInput, 0.14],
  ]) * visualQuality);
  const negativeSignal = clamp01(weightedAverage([
    [auNegative, 0.38],
    [ekman.negative, 0.24 * ekmanWeight],
    [dominant.negative, 0.24],
    [1 - engagementInput, 0.14],
  ]) * visualQuality);
  const focus = clamp01(weightedAverage([
    [auFocus, 0.38],
    [dominant.focus, 0.2],
    [ekman.focus, 0.12 * ekmanWeight],
    [eyeContact, 0.18],
    [engagementInput, 0.12],
  ]) * visualQuality);
  const uncertainty = clamp01(weightedAverage([
    [average(scoreFor("AU1", "AU2", "AU5")), 0.34],
    [dominant.uncertainty, 0.32],
    [ekman.uncertainty, 0.2 * ekmanWeight],
    [1 - observationConfidence, 0.14],
  ]) * visualQuality);
  const stressSignal = clamp01(weightedAverage([
    [auStress, 0.4],
    [dominant.stress, 0.3],
    [ekman.stress, 0.2 * ekmanWeight],
    [uncertainty, 0.1],
  ]) * visualQuality);
  const engagement = clamp01(weightedAverage([
    [engagementInput, 0.28],
    [eyeContact, 0.22],
    [dominant.engagement, 0.24],
    [ekman.engagement, 0.12 * ekmanWeight],
    [positiveSignal, 0.14],
  ]) * visualQuality);
  const neutralSignal = clamp01(1 - Math.max(positiveSignal, negativeSignal));

  return {
    auScores,
    actionUnits,
    scores: {
      positiveSignal,
      negativeSignal,
      neutralSignal,
      focus,
      uncertainty,
      stressSignal,
      engagement,
      eyeContact,
      observationConfidence: clamp01(observationConfidence),
    },
  };
};
