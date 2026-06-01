import { describe, expect, it } from "vitest";
import { DATA_COLLECTING_LABEL, formatLevelLabel, sanitizeSignalLabel } from "./facsLabelFormatter";

describe("sanitizeSignalLabel", () => {
  it("replaces raw provider tokens with Turkish UI-safe labels", () => {
    expect(sanitizeSignalLabel("unknown")).toBe(DATA_COLLECTING_LABEL);
    expect(sanitizeSignalLabel("weak")).toBe("Zayıf kanıt");
    expect(sanitizeSignalLabel("pasif")).toBe("Düşük katılım sinyali");
    expect(sanitizeSignalLabel("passive")).toBe("Düşük katılım sinyali");
  });

  it("handles empty and invalid values without leaking implementation details", () => {
    expect(sanitizeSignalLabel(undefined)).toBe(DATA_COLLECTING_LABEL);
    expect(sanitizeSignalLabel([])).toBe(DATA_COLLECTING_LABEL);
    expect(sanitizeSignalLabel(Number.NaN)).toBe("Hesaplanamadı");
  });

  it("formats signal levels as simple low medium high labels", () => {
    expect(formatLevelLabel(0.2)).toBe("Düşük");
    expect(formatLevelLabel(0.5)).toBe("Orta");
    expect(formatLevelLabel(0.8)).toBe("Yüksek");
  });
});
