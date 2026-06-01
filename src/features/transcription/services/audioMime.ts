export function normalizeAudioMimeType(type?: string) {
  if (!type) return "audio/webm";
  return type.split(";")[0].trim() || "audio/webm";
}

export function getAudioFilenameByMime(mime: string) {
  const normalizedMime = normalizeAudioMimeType(mime);
  if (normalizedMime.includes("wav")) return "recording.wav";
  if (normalizedMime.includes("mpeg") || normalizedMime.includes("mp3")) return "recording.mp3";
  if (normalizedMime.includes("mp4") || normalizedMime.includes("m4a")) return "recording.m4a";
  return "recording.webm";
}

export function getAudioExtensionByMime(mime: string) {
  return getAudioFilenameByMime(mime).split(".").pop() || "webm";
}
