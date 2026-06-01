import { describe, expect, it } from "vitest";
import { normalizeEmotionAnalysis } from "./emotionNormalizer";

describe("normalizeEmotionAnalysis", () => {
  it("maps legacy facial analysis fields into the standard emotion contract", () => {
    const result = normalizeEmotionAnalysis({
      dominant_mood: "gergin",
      average_confidence: "orta",
      average_engagement: "aktif",
      face_visibility: "high",
      gaze_evidence: "weak",
      observational_limits: ["Kamera açısı sınırlı."],
    });

    expect(result.provider).toBe("internal_vision");
    expect(result.face_detected).toBe(true);
    expect(result.dominant_signal).toBe("stressed");
    expect(result.ekman_style_emotion?.label).toBe("fear");
    expect(result.facs_action_unit_hints[0]).toMatchObject({
      au: expect.any(String),
      observed_signal: expect.any(String),
      possible_interpretation: expect.any(String),
    });
    expect(result.visual_evidence).toContain("Yuz gorunurlugu: high");
    expect(result.decision_warning).toContain("tek basina kullanilamaz");
    expect(result.limitations).toContain("Kamera açısı sınırlı.");
  });

  it("does not overstate evidence when visibility is missing", () => {
    const result = normalizeEmotionAnalysis({
      dominant_mood: "insufficient_evidence",
      face_visibility: "none",
      average_confidence: "insufficient_evidence",
    });

    expect(result.face_detected).toBe(false);
    expect(result.dominant_signal).toBe("unknown");
    expect(result.ekman_style_emotion?.confidence).toBeLessThan(0.25);
    expect(result.facs_action_unit_hints[0].au).toBe("AU?");
  });
});
