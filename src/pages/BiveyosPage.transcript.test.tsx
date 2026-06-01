import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/pages/BiveyosPage.tsx"), "utf8");
const panelSource = readFileSync(join(process.cwd(), "src/features/emotion/components/FacsSessionSignalsPanel.tsx"), "utf8");

describe("BiveyosPage transcript and signal panel contract", () => {
  it("keeps a single Biveyos session signal panel on the page", () => {
    expect(source).not.toMatch(/Duygu Durum Sistemi|Alt Duygu Durum Paneli|<LiveEmotionPanel/);
    expect((source.match(/<FacsSessionSignalsPanel/g) || [])).toHaveLength(1);
    expect(source).toContain("max-h-[300px] overflow-y-auto");
  });

  it("normalizes audio/webm opus captures before upload and skips tiny audio before STT", () => {
    const tinyAudioGuard = source.indexOf("capture.blob.size < 1024");
    const sttInvoke = source.indexOf("EDGE_FUNCTIONS.TRANSCRIBE_RECORDING");

    expect(source).toContain("normalizeAudioMimeType(capture.mimeType)");
    expect(source).toContain("new Blob([capture.blob], { type: normalizedMimeType })");
    expect(source).toContain("contentType: normalizedMimeType");
    expect(tinyAudioGuard).toBeGreaterThan(-1);
    expect(sttInvoke).toBeGreaterThan(tinyAudioGuard);
  });

  it("blocks analyze-interview until a usable transcript exists", () => {
    const guardIndex = source.indexOf("if (!transcriptReadyForAnalysis)");
    const analyzeIndex = source.indexOf("EDGE_FUNCTIONS.ANALYZE_INTERVIEW");
    const guardedBlock = source.slice(guardIndex, analyzeIndex);

    expect(guardIndex).toBeGreaterThan(-1);
    expect(analyzeIndex).toBeGreaterThan(guardIndex);
    expect(guardedBlock).toContain("Transkript üretilemediği için analiz başlatılmadı.");
    expect(guardedBlock).toContain("return;");
  });

  it("does not show completed final transcript status for failed or insufficient transcripts", () => {
    expect(source).toContain("resolveChannelTranscriptStatus");
    expect(source).toContain("transcriptPipelineStatus === \"failed\" ? \"failed\" : \"insufficient\"");
    expect(source).toContain("Kısmi transkript tamamlandı");
    expect(source).toContain("Final transkript başarısız");
  });

  it("removes unwanted emotion cards from the simplified FACS panel", () => {
    expect(panelSource).not.toMatch(/Bakış kanıtı|Anlık gözlem|Ekman benzeri duygu etiketi|AU4|AU7|AU45|Karar uyarısı/);
    expect(panelSource).not.toContain("10 saniyelik genel eğilim");
    expect(panelSource).not.toContain("Gözlem güveni");
    expect(panelSource).not.toContain("Görsel Kanıt Özeti");
    expect(panelSource).toContain("10 saniyelik İK gözlem yorumu");
    expect(panelSource).toContain("FACS/AU tabanlı genel çıkarım ve görsel kanıt özeti");
  });

  it("supports CV file upload and sends CV context into AI preparation", () => {
    expect(source).toContain("parseCvFile(file)");
    expect(source).toContain("CV Yükle");
    expect(source).toContain("ACCEPTED_CV_FILE_FORMATS");
    expect(source).toContain("cvText: cvContext");
    expect(source).toContain("cvFileName: selectedCandidate.cvFileName");
    expect(source).toContain("CV/Pozisyon odak terimleri");
  });
});
