import { describe, expect, it } from "vitest";
import { formatTranscriptionFailure } from "./transcriptionErrors";

describe("formatTranscriptionFailure", () => {
  it("combines edge error with provider errors", () => {
    const message = formatTranscriptionFailure(
      {
        type: "VALIDATION",
        message: "Transkript oluşturulamadı.",
        detail: "OPENAI_API_KEY yok",
        status: 422,
      },
      {
        providerErrors: [
          { provider: "openai", error: "OPENAI_API_KEY yok" },
          { provider: "gemini", error: "GEMINI_API_KEY yok" },
        ],
      },
    );

    expect(message).toContain("Transkript oluşturulamadı");
    expect(message).toContain("openai");
  });
});
