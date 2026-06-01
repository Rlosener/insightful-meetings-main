/**
 * Client-side audio extraction from video files.
 * Uses Web Audio API to decode audio track from video containers,
 * downsample to 8kHz mono, and encode as WAV for efficient transcription.
 *
 * Supported input: MP4, MOV, WebM, MKV, AVI (browser codec support varies)
 * Output: 8kHz mono 16-bit WAV (~38MB for 40-min recording)
 */

const MAX_EXTRACTION_SIZE = 500 * 1024 * 1024; // 500MB browser memory limit
const TARGET_SAMPLE_RATE = 8000; // 8kHz – sufficient for speech, keeps WAV small

export interface ExtractionResult {
  blob: Blob;
  duration: number;
  originalSize: number;
  extractedSize: number;
}

/**
 * Extract audio from a video file and return a compressed WAV blob.
 * Throws if file is too large, has no audio, or cannot be decoded.
 */
export async function extractAudioFromVideo(
  file: File,
  onProgress?: (progress: number, stage: string) => void,
): Promise<ExtractionResult> {
  if (file.size > MAX_EXTRACTION_SIZE) {
    throw new Error(
      `Dosya çok büyük (${Math.round(file.size / 1024 / 1024)}MB). ` +
      `Ses çıkarımı için maksimum ${Math.round(MAX_EXTRACTION_SIZE / 1024 / 1024)}MB. ` +
      `Lütfen doğrudan ses dosyası (MP3/M4A) yükleyin.`,
    );
  }

  onProgress?.(5, "Dosya okunuyor...");
  const arrayBuffer = await file.arrayBuffer();

  onProgress?.(25, "Ses kanalı çıkarılıyor...");
  const audioContext = new AudioContext();

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch {
    await audioContext.close();
    throw new Error(
      "Video dosyasından ses çıkarılamadı. Dosya bozuk olabilir veya ses kanalı içermiyor olabilir.",
    );
  }
  await audioContext.close();

  if (audioBuffer.duration < 3) {
    throw new Error("Ses kanalı çok kısa (< 3 saniye). Lütfen daha uzun bir kayıt yükleyin.");
  }

  onProgress?.(50, "Ses optimize ediliyor...");

  // Downsample to target rate, mono
  const offlineCtx = new OfflineAudioContext(
    1, // mono
    Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE),
    TARGET_SAMPLE_RATE,
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  onProgress?.(80, "WAV dosyası oluşturuluyor...");

  const wavBlob = encodeWav(rendered);
  onProgress?.(100, "Ses çıkarımı tamamlandı");

  return {
    blob: wavBlob,
    duration: audioBuffer.duration,
    originalSize: file.size,
    extractedSize: wavBlob.size,
  };
}

/** Check whether a file needs client-side audio extraction before transcription */
export function needsAudioExtraction(file: File, inlineLimit: number): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const isVideo = ["mp4", "mov", "mkv", "webm", "avi"].includes(ext);
  return isVideo && file.size > inlineLimit;
}

// ── WAV encoder ─────────────────────────────────────────────────────────

function encodeWav(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const dataLength = samples.length * bytesPerSample;
  const headerLength = 44;

  const ab = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(ab);

  writeStr(view, 0, "RIFF");
  view.setUint32(4, headerLength + dataLength - 8, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeStr(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([ab], { type: "audio/wav" });
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
