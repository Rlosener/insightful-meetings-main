import { describe, expect, it } from "vitest";
import {
  getRecordingFileName,
  isValidAudioBlob,
  normalizeRecordingStoragePath,
} from "./storagePaths";

describe("storagePaths", () => {
  it("keeps bare storage paths unchanged", () => {
    expect(normalizeRecordingStoragePath("user-1/1700000000_recording.webm"))
      .toBe("user-1/1700000000_recording.webm");
  });

  it("extracts path from public storage URLs", () => {
    const url = "https://example.supabase.co/storage/v1/object/public/recordings/user-1/clip.webm";
    expect(normalizeRecordingStoragePath(url)).toBe("user-1/clip.webm");
  });

  it("returns readable file names", () => {
    expect(getRecordingFileName("user-1/1700000000_zoom-upload.mp4")).toBe("zoom-upload.mp4");
  });

  it("validates minimum audio blob size", () => {
    expect(isValidAudioBlob(new Blob(["x"], { type: "audio/webm" }))).toBe(false);
    expect(isValidAudioBlob(new Blob([new Uint8Array(2048)], { type: "audio/webm" }))).toBe(true);
  });
});
