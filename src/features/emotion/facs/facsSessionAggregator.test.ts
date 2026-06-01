import { describe, expect, it } from "vitest";
import type { EmotionAnalysisResult } from "../types";
import { buildFacsAuSessionResult } from "./facsSessionAggregator";

const sample = (timestamp: number, engagementScore = 0.7): EmotionAnalysisResult => ({
  timestamp,
  face_detected: true,
  face_visibility: "high",
  camera_quality: "good",
  lighting_quality: "good",
  dominant_signal: "engaged",
  ekman_style_emotion: { label: "happiness", confidence: 0.72 },
  facs_action_unit_hints: [
    { au: "AU6", name: "Cheek Raiser", observed_signal: "Yanak yükselmesi", possible_interpretation: "Pozitif ifade ipucu", confidence: 0.62 },
    { au: "AU12", name: "Lip Corner Puller", observed_signal: "Dudak köşesi yukarı", possible_interpretation: "Pozitif ifade ipucu", confidence: 0.74 },
    { au: "AU4", name: "Brow Lowerer", observed_signal: "Kaş gerilimi", possible_interpretation: "Odak ipucu", confidence: 0.38 },
    { au: "AU7", name: "Lid Tightener", observed_signal: "Göz kapağı sıkılaşması", possible_interpretation: "Odak ipucu", confidence: 0.42 },
  ],
  visual_evidence: ["İfade sinyali: yüz ifadesi izlenebilir", "Kamera açısı: karşıdan"],
  decision_warning: "Kamera sinyali tek başına karar kanıtı değildir.",
  engagement: { score: engagementScore, trend: "stable" },
  eye_contact: { score: 0.8, evidence: "Kamera yönü izlenebilir", confidence: 0.72 },
  interpretation: "Yüz ifadesi izlenebilir düzeyde.",
  limitations: ["Işık ve açı sonucu etkileyebilir."],
});

describe("buildFacsAuSessionResult", () => {
  it("uses only the last 10 seconds and averages FACS/AU-derived fields", () => {
    const now = 100_000;
    const result = buildFacsAuSessionResult([
      sample(now - 12_000, 0.2),
      sample(now - 9_000, 0.5),
      sample(now - 5_000, 0.7),
      sample(now - 500, 0.8),
    ], now);

    expect(result.window.durationMs).toBe(10_000);
    expect(result.window.sampleCount).toBe(3);
    expect(["Pozitif", "Nötr", "Negatif"]).toContain(result.signal.label);
    expect(result.signal.facsAuInference).toBeTruthy();
    expect(result.scores.positiveSignal).toBeGreaterThan(0.6);
    expect(result.evidence.expressionSummary).toContain("ifade eğilimi");
    expect(result.interpretation.hrNote).toContain("İK takip önerisi");
    expect(result.limitations.join(" ")).not.toMatch(/Kamera\/duygu sinyali|tek basina|tek başına|Yuz gorunurlugu, isik/i);
    expect(result.facsActionUnits[0].au).toMatch(/^AU/);
    expect(result.decisionWarning).toContain("tek başına");
    expect(JSON.stringify(result.labels).toLocaleLowerCase("tr-TR")).not.toMatch(/\bunknown\b|\bweak\b|\bpasif\b/);
  });

  it("does not summarize emotion before enough rolling-window samples exist", () => {
    const now = 100_000;
    const result = buildFacsAuSessionResult([sample(now - 1_000)], now);

    expect(result.window.sampleCount).toBe(1);
    expect(result.interpretation.title).toBe("Veri toplanıyor");
    expect(result.evidence.expressionSummary).toBe("Görsel kanıt toplanıyor. 10 saniyelik yorum için en az 3 örnek bekleniyor.");
    expect(result.facsActionUnits).toHaveLength(0);
  });
});
