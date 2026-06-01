import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveEmotionAnalysis } from "./useLiveEmotionAnalysis";

const invokeEdgeFunctionMock = vi.fn();

vi.mock("@/lib/edgeFunctionClient", () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunctionMock(...args),
  getErrorToastMessage: (error: unknown) => error instanceof Error ? error.message : "Edge function hatası",
}));

vi.mock("@/lib/frameSampling", () => ({
  captureVideoFrameDataUrl: vi.fn(() => "data:image/jpeg;base64,frame"),
  sampleLatestFrames: vi.fn((frames: string[]) => frames.slice(-4)),
}));

describe("useLiveEmotionAnalysis", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeEdgeFunctionMock.mockResolvedValue({
      data: {
        analysis: {
          dominant_mood: "rahat",
          average_confidence: "yüksek",
          average_engagement: "aktif",
          face_visibility: "high",
          gaze_evidence: "moderate",
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    invokeEdgeFunctionMock.mockReset();
  });

  it("captures frames and publishes normalized emotion results", async () => {
    const video = document.createElement("video");
    const videoRef = { current: video };
    const { result, unmount } = renderHook(() => useLiveEmotionAnalysis({
      videoRef,
      intervalMs: 1000,
      participants: ["Aday"],
    }));

    act(() => {
      result.current.start();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(result.current.status).toBe("running");
    expect(result.current.latestResult?.dominant_signal).toBe("positive");
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ frames: expect.arrayContaining(["data:image/jpeg;base64,frame"]), participants: ["Aday"] }),
      expect.any(Object),
    );

    unmount();
  });
});
