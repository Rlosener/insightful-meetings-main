import { describe, expect, it } from "vitest";
import {
  buildAnalysisTranscriptFromChannels,
  buildChannelTranscriptDisplay,
  formatTranscriptProviderLabel,
  resolveChannelTranscriptStatus,
} from "./transcriptionService";

describe("transcriptionService channel status helpers", () => {
  it("marks all failed valid channels as failed", () => {
    const channels = [
      { speaker: "İK", error: "Sunucu hatası oluştu." },
    ];

    expect(resolveChannelTranscriptStatus(channels)).toBe("failed");
    expect(formatTranscriptProviderLabel(channels, "failed")).toBe("Transkript sağlayıcısı başarısız oldu.");
    expect(buildAnalysisTranscriptFromChannels(channels)).toBe("");
  });

  it("marks mixed success and failed channels as partial without treating errors as transcript", () => {
    const channels = [
      { speaker: "Aday", error: "Ses kaydı alınamadı veya dosya çok küçük (0 byte)." },
      { speaker: "İK", transcript: "Merhaba, adayın frontend deneyimini konuşuyoruz.", provider: "openai" as const },
    ];

    expect(resolveChannelTranscriptStatus(channels)).toBe("partial");
    expect(formatTranscriptProviderLabel(channels, "partial")).toBe("Provider: OpenAI");
    expect(buildAnalysisTranscriptFromChannels(channels)).toContain("[İK]");
    expect(buildAnalysisTranscriptFromChannels(channels)).not.toContain("0 byte");
    expect(buildChannelTranscriptDisplay(channels)).toContain("Aday kanalı: Ses kaydı alınamadı.");
  });

  it("marks all successful channels as completed and hides unknown provider from UI", () => {
    const channels = [
      { speaker: "Aday", transcript: "Bu pozisyon için deneyimimi anlatıyorum.", provider: "unknown" as const },
      { speaker: "İK", transcript: "Teknik detayları biraz daha açabilir misiniz?", provider: "google" as const },
    ];

    expect(resolveChannelTranscriptStatus(channels)).toBe("completed");
    expect(formatTranscriptProviderLabel(channels, "completed")).toBe("Provider: Google Speech");
  });
});
