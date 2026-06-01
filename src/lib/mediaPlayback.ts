const isInterruptedPlayError = (error: unknown) => {
  if (!(error instanceof DOMException)) return false;
  return error.name === "AbortError" || /play\(\) request was interrupted|new load request/i.test(error.message);
};

export const playVideoSafely = async (video: HTMLVideoElement, label = "video") => {
  try {
    await video.play();
    return true;
  } catch (error: unknown) {
    if (isInterruptedPlayError(error)) {
      console.debug(`[media] ${label} play interrupted by source change`);
      return false;
    }
    console.warn(`[media] ${label} play failed`, error);
    return false;
  }
};

export const attachStreamAndPlay = async (
  video: HTMLVideoElement,
  stream: MediaStream,
  label = "video",
) => {
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  return playVideoSafely(video, label);
};
