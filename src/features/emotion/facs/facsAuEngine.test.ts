import { describe, expect, it } from "vitest";
import type { EmotionAnalysisResult } from "../types";
import { buildFacsAuScores, parseActionUnitIds } from "./facsAuEngine";

const emotionResult = (overrides: Partial<EmotionAnalysisResult> = {}): EmotionAnalysisResult => ({
  timestamp: 1_000,
  face_detected: true,
  face_visibility: "high",
  camera_quality: "good",
  lighting_quality: "good",
  dominant_signal: "engaged",
  ekman_style_emotion: { label: "happiness", confidence: 0.7 },
  facs_action_unit_hints: [
    { au: "AU6", name: "Cheek Raiser", observed_signal: "Yanak yükselmesi", possible_interpretation: "Pozitif ifade ipucu", confidence: 0.6 },
    { au: "AU12", name: "Lip Corner Puller", observed_signal: "Dudak köşesi yukarı", possible_interpretation: "Pozitif ifade ipucu", confidence: 0.8 },
    { au: "AU4", name: "Brow Lowerer", observed_signal: "Kaş gerilimi", possible_interpretation: "Odak/gerilim ipucu", confidence: 0.5 },
    { au: "AU7", name: "Lid Tightener", observed_signal: "Göz kapağı sıkılaşması", possible_interpretation: "Odak/gerilim ipucu", confidence: 0.4 },
    { au: "AU23", name: "Lip Tightener", observed_signal: "Dudak gerilimi", possible_interpretation: "Gerilim ipucu", confidence: 0.7 },
    { au: "AU45", name: "Blink", observed_signal: "Göz kırpma", possible_interpretation: "Stres/tempo ipucu", confidence: 0.3 },
    { au: "AU2+AU5", name: "Brow/Lid Raiser", observed_signal: "Kaş ve göz açıklığı", possible_interpretation: "Belirsizlik/katılım ipucu", confidence: 0.6 },
  ],
  visual_evidence: ["İfade sinyali belirgin"],
  decision_warning: "Tek başına karar kanıtı değildir.",
  engagement: { score: 0.7, trend: "stable" },
  eye_contact: { score: 0.9, evidence: "Kamera yönü güçlü", confidence: 0.8 },
  interpretation: "Destekleyici kamera sinyali",
  limitations: ["Kamera açısı sonucu etkileyebilir."],
  ...overrides,
});

describe("buildFacsAuScores", () => {
  it("parses combined action unit hints", () => {
    expect(parseActionUnitIds("AU2+AU5")).toEqual(["AU2", "AU5"]);
  });

  it("maps FACS/AU hints into engagement, focus, stress and positive signal scores", () => {
    const result = buildFacsAuScores(emotionResult());

    expect(result.auScores.AU12).toBe(0.8);
    expect(result.scores.positiveSignal).toBeGreaterThan(0.62);
    expect(result.scores.positiveSignal).toBeGreaterThan(result.scores.negativeSignal);
    expect(result.scores.neutralSignal).toBeLessThan(0.4);
    expect(result.scores.focus).toBeGreaterThan(0.55);
    expect(result.scores.stressSignal).toBeGreaterThan(0.22);
    expect(result.scores.engagement).toBeGreaterThan(0.65);
    expect(result.scores.observationConfidence).toBeGreaterThan(0.6);
  });

  it("keeps signals dynamic when AU hints are missing but Ekman and dominant signal change", () => {
    const stressed = buildFacsAuScores(emotionResult({
      dominant_signal: "stressed",
      ekman_style_emotion: { label: "fear", confidence: 0.82 },
      facs_action_unit_hints: [],
      engagement: { score: 0.28, trend: "decreasing" },
      eye_contact: { score: 0.35, evidence: "Bakış kısa süreli", confidence: 0.42 },
    }));
    const engaged = buildFacsAuScores(emotionResult({
      dominant_signal: "engaged",
      ekman_style_emotion: { label: "happiness", confidence: 0.78 },
      facs_action_unit_hints: [],
      engagement: { score: 0.78, trend: "increasing" },
      eye_contact: { score: 0.76, evidence: "Kamera yönü izlenebilir", confidence: 0.72 },
    }));

    expect(stressed.scores.stressSignal).toBeGreaterThan(stressed.scores.positiveSignal);
    expect(stressed.scores.negativeSignal).toBeGreaterThan(0.35);
    expect(engaged.scores.engagement).toBeGreaterThan(stressed.scores.engagement);
    expect(engaged.scores.positiveSignal).toBeGreaterThan(stressed.scores.positiveSignal);
  });
});
