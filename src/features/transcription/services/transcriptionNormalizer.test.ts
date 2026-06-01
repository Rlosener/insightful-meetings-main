import { describe, expect, it } from "vitest";
import { isTranscriptUsableForAnalysis, normalizeTranscript, normalizeTranscriptResult } from "./transcriptionNormalizer";

describe("normalizeTranscript", () => {
  it("keeps speaker blocks and normalizes spacing", () => {
    const result = normalizeTranscript("[Aday]\nMerhaba   ben Ece.\n\n\n[İK]\nTeşekkürler.");

    expect(result.transcript).toBe("[Aday]\nMerhaba ben Ece.\n\n[İK]\nTeşekkürler.");
    expect(result.segments).toHaveLength(2);
    expect(result.wordCount).toBeGreaterThanOrEqual(4);
    expect(result.hasSpeech).toBe(true);
  });

  it("parses timestamped live transcript headers", () => {
    const result = normalizeTranscript("[Aday • 00:12]\nBu role neden uygunum anlatayım.");

    expect(result.segments[0]).toMatchObject({
      speaker: "Aday",
      timestamp: "00:12",
      text: "Bu role neden uygunum anlatayım.",
    });
  });

  it("normalizes edge function transcriptResult payloads", () => {
    const result = normalizeTranscriptResult({
      transcriptResult: {
        text: "Merhaba, bu pozisyon için React ve TypeScript deneyimimi anlatıyorum. Son projede performans ve ekip iletişimi üzerine çalıştım.",
        provider: "google",
        confidence: 0.77,
        warnings: ["Google STT kullanıldı."],
      },
    });

    expect(result.text).toContain("React ve TypeScript");
    expect(result.provider).toBe("google");
    expect(result.confidence).toBe(0.77);
    expect(result.warnings).toContain("Google STT kullanıldı.");
    expect(isTranscriptUsableForAnalysis(result)).toBe(true);
  });

  it("marks empty or synthetic transcripts as not usable for analysis", () => {
    const empty = normalizeTranscriptResult({ transcriptResult: { text: "", provider: "openai" } });
    const synthetic = normalizeTranscript("[İsim Soyisim]\nLorem ipsum");

    expect(empty.warnings).toContain("Transkript boş.");
    expect(isTranscriptUsableForAnalysis(empty)).toBe(false);
    expect(isTranscriptUsableForAnalysis(synthetic)).toBe(false);
  });
});
