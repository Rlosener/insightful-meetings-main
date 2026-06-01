import { describe, expect, it } from "vitest";
import { buildEmotionObservation, type HrEmotionSample } from "./emotionHrObservation";

const sample = (emotion: HrEmotionSample["emotion"], confidence = 0.72): HrEmotionSample => ({
  emotion,
  confidence,
  ts: Date.now(),
});

describe("buildEmotionObservation", () => {
  it("keeps interpretation limited when there are not enough samples", () => {
    const result = buildEmotionObservation([sample("neutral"), sample("happy")]);

    expect(result.state).toBe("veri_sinirli");
    expect(result.note).toContain("tek başına çıkarım yapılmaz");
    expect(result.total).toBe(2);
  });

  it("returns a realistic supportive observation for mostly tense samples", () => {
    const result = buildEmotionObservation([
      sample("fear"),
      sample("angry"),
      sample("fear"),
      sample("neutral"),
      sample("fear"),
    ]);

    expect(["gergin", "temkinli", "karisik"]).toContain(result.state);
    expect(result.attention).toMatch(/Tek başına|Kararı|Destekleyici/);
    expect(result.avgConfidence).toBeGreaterThan(0.6);
  });
});
