import { describe, expect, it } from "vitest";
import { getPrompt } from "../prompts";
import { renderPrompt, renderTemplate } from "./promptRenderer";

describe("renderTemplate", () => {
  it("renders scalar and array values", () => {
    const result = renderTemplate("Pozisyon: {{position}}\nYetenekler: {{skills}}", {
      position: "Backend Developer",
      skills: ["Node.js", "Postgres"],
    });

    expect(result).toContain("Pozisyon: Backend Developer");
    expect(result).toContain("Yetenekler: Node.js, Postgres");
  });

  it("does not leak unresolved null values", () => {
    expect(renderTemplate("Not: {{notes}}", { notes: null })).toBe("Not: ");
  });

  it("adds prompt metadata while rendering", () => {
    const rendered = renderPrompt(getPrompt("ANALYZE_INTERVIEW"), {
      transcript: "Aday rol deneyimini anlattı.",
      context: "Frontend mülakatı",
    });

    expect(rendered.systemPrompt).toContain("mulakat");
    expect(rendered.userPrompt).toContain("Aday rol deneyimini anlattı.");
    expect(rendered.metadata.outputFormat).toBe("json");
    expect(rendered.metadata.createdAt).toBeTruthy();
  });
});
