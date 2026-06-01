const waitForEvent = (target: HTMLVideoElement, event: string) =>
  new Promise<void>((resolve, reject) => {
    const handleResolve = () => {
      cleanup();
      resolve();
    };
    const handleReject = () => {
      cleanup();
      reject(new Error(`Video event failed: ${event}`));
    };
    const cleanup = () => {
      target.removeEventListener(event, handleResolve);
      target.removeEventListener("error", handleReject);
    };

    target.addEventListener(event, handleResolve, { once: true });
    target.addEventListener("error", handleReject, { once: true });
  });

const seekTo = async (video: HTMLVideoElement, time: number) => {
  if (Math.abs(video.currentTime - time) < 0.05) return;
  video.currentTime = time;
  await waitForEvent(video, "seeked");
};

export async function extractFramesFromVideo(
  file: File,
  options?: { count?: number; maxWidth?: number; quality?: number }
): Promise<string[]> {
  const count = options?.count ?? 5;
  const maxWidth = options?.maxWidth ?? 960;
  const quality = options?.quality ?? 0.72;

  if (typeof window === "undefined") return [];

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await waitForEvent(video, "loadedmetadata");

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const frameCount = Math.max(1, count);
    const timestamps = Array.from({ length: frameCount }, (_, index) => {
      if (!duration) return 0;
      const ratio = frameCount === 1 ? 0.5 : (index + 1) / (frameCount + 1);
      return Math.max(0, Math.min(duration, duration * ratio));
    });

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const scale = width > maxWidth ? maxWidth / width : 1;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");

    if (!context) throw new Error("Canvas context not available");

    const frames: string[] = [];
    for (const timestamp of timestamps) {
      await seekTo(video, timestamp);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", quality));
    }

    return frames;
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  }
}
