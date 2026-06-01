import { describe, expect, it } from "vitest";
import { getAudioExtensionByMime, getAudioFilenameByMime, normalizeAudioMimeType } from "./audioMime";

describe("audioMime", () => {
  it("strips codec parameters so audio/webm opus recordings stay compatible with STT providers", () => {
    expect(normalizeAudioMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(getAudioFilenameByMime("audio/webm;codecs=opus")).toBe("recording.webm");
    expect(getAudioExtensionByMime("audio/webm;codecs=opus")).toBe("webm");
  });

  it("keeps supported upload extensions stable for common audio formats", () => {
    expect(getAudioFilenameByMime("audio/wav; codecs=1")).toBe("recording.wav");
    expect(getAudioFilenameByMime("audio/mpeg")).toBe("recording.mp3");
    expect(getAudioFilenameByMime("audio/mp4")).toBe("recording.m4a");
    expect(normalizeAudioMimeType("")).toBe("audio/webm");
  });
});
