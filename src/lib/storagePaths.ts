import { supabase } from "@/integrations/supabase/client";

const RECORDINGS_BUCKET = "recordings";

/** Minimum audio payload for reliable server-side STT. */
export const MIN_AUDIO_BYTES = 1024;

const PUBLIC_STORAGE_MARKER = "/storage/v1/object/public/recordings/";

/**
 * Normalize a recordings value to a storage object path (userId/file.ext).
 * Accepts legacy full public URLs and bare paths.
 */
export const normalizeRecordingStoragePath = (value?: string | null): string | null => {
  if (!value?.trim()) return null;
  const trimmed = value.trim();

  if (trimmed.includes(PUBLIC_STORAGE_MARKER)) {
    const idx = trimmed.indexOf(PUBLIC_STORAGE_MARKER);
    return decodeURIComponent(trimmed.slice(idx + PUBLIC_STORAGE_MARKER.length));
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const match = trimmed.match(/\/recordings\/(.+)$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }

  return trimmed.replace(/^\/+/, "");
};

export const getRecordingFileName = (value?: string | null): string | null => {
  const path = normalizeRecordingStoragePath(value);
  if (!path) return null;
  const fileName = path.split("/").pop() || null;
  return fileName?.replace(/^\d+_/, "") || fileName;
};

export const isValidAudioBlob = (blob?: Blob | null, minBytes = MIN_AUDIO_BYTES) =>
  Boolean(blob && blob.size >= minBytes);

export const createRecordingStoragePath = (userId: string, fileName: string) =>
  `${userId}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;

export const getSignedRecordingUrl = async (
  value?: string | null,
  expiresInSeconds = 3600,
): Promise<string | null> => {
  const path = normalizeRecordingStoragePath(value);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.warn("[storage] signed URL failed", error?.message);
    return null;
  }

  return data.signedUrl;
};
