import { describe, expect, it } from "vitest";
import { assertPromptExists, getPrompt, listPrompts } from "./prompt-registry";

describe("edge prompt registry", () => {
  it("exposes the Biveyos, interview, emotion and transcription prompts", () => {
    const keys = listPrompts().map((prompt) => prompt.key);

    expect(keys).toEqual(expect.arrayContaining([
      "BIVEYOS_PRE_EVALUATION",
      "GENERATE_INTERVIEW_QUESTIONS",
      "ANALYZE_INTERVIEW",
      "ANALYZE_FACIAL_EXPRESSIONS",
      "TRANSCRIPTION_CLEANUP",
    ]));
  });

  it("requires structured prompt metadata", () => {
    const prompt = getPrompt("ANALYZE_FACIAL_EXPRESSIONS");

    expect(prompt.outputFormat).toBe("json");
    expect(prompt.inputFields).toContain("frameCount");
    expect(prompt.safetyRules.join(" ")).toContain("tek başına");
    expect(prompt.userPromptTemplate).toContain("decision_warning");
  });

  it("keeps legacy keys mapped to the new prompt ids", () => {
    expect(assertPromptExists("INTERVIEW_ANALYSIS")).toBe("ANALYZE_INTERVIEW");
  });
});
