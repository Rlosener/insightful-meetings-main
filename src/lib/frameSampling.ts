export const captureVideoFrameDataUrl = (
  video: HTMLVideoElement | null,
  options: { maxWidth?: number; quality?: number } = {},
) => {
  if (!video || !video.videoWidth || !video.videoHeight) return null;

  const maxWidth = options.maxWidth ?? 640;
  const quality = options.quality ?? 0.62;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
};

export const sampleLatestFrames = (
  frames: string[],
  maxFrames = 4,
  sourceWindow = maxFrames * 3,
) => {
  const recentFrames = frames.slice(-Math.max(maxFrames, sourceWindow)).filter(Boolean);
  if (recentFrames.length <= maxFrames) return recentFrames;

  const step = (recentFrames.length - 1) / Math.max(1, maxFrames - 1);
  const selected = Array.from({ length: maxFrames }, (_, index) => recentFrames[Math.round(index * step)]);
  return Array.from(new Set(selected.filter(Boolean)));
};
