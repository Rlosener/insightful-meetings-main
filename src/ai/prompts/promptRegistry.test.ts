import { describe, expect, it } from "vitest";
import { assertPromptExists, getPrompt, listPrompts } from "./promptRegistry";

const requiredPromptKeys = [
  "BIVEYOS_PRE_EVALUATION",
  "GENERATE_INTERVIEW_QUESTIONS",
  "ANALYZE_INTERVIEW",
  "ANALYZE_FACIAL_EXPRESSIONS",
  "ANALYZE_PRACTICE_INTERVIEW",
  "ANALYZE_CHARACTER_OVERALL",
  "ANALYZE_CAREER_PROFILE",
  "COMPANY_ADVISOR",
  "ANALYZE_COMPANY",
  "ANALYZE_MEMBER_PROFILE",
  "TRANSCRIPTION_CLEANUP",
];

describe("promptRegistry", () => {
  it("contains the required central prompt definitions", () => {
    for (const key of requiredPromptKeys) {
      const prompt = getPrompt(key);
      expect(prompt.id).toBeTruthy();
      expect(prompt.inputFields.length).toBeGreaterThan(0);
      expect(["json", "text"]).toContain(prompt.outputFormat);
      expect(prompt.safetyRules.length).toBeGreaterThan(0);
    }
  });

  it("supports old aliases without duplicating registry entries", () => {
    expect(assertPromptExists("EMOTION_INTERPRETATION")).toBe("ANALYZE_FACIAL_EXPRESSIONS");
    expect(getPrompt("PRACTICE_QUESTIONS").id).toBe(getPrompt("GENERATE_INTERVIEW_QUESTIONS").id);
  });

  it("lists prompts with stable keys", () => {
    const keys = listPrompts().map((item) => item.key);
    expect(keys).toContain("ANALYZE_INTERVIEW");
    expect(keys).not.toContain("EMOTION_INTERPRETATION");
  });
});
