import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, parseAIResponse } from "../_shared/ai-client.ts";
import {
  assertProcessingJobOwner,
  assertRecordingOwner,
  createServiceClient,
  jsonResponse,
  normalizeUserStoragePath,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import { detectEntities, normalizeTranscriptWithEntities } from "../_shared/b2b-intelligence.ts";
import { aiProviderChecks, healthResponse, isHealthRequest, readJsonBody, supabaseChecks, transcriptionChecks } from "../_shared/health.ts";
import { audioInputFormat, transcribeWithSpeechProvider } from "../_shared/transcription-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ───────────────────────────────────────────────────────────
const WAV_HEADER_SIZE = 44;
const CHUNK_DURATION_SEC = 300; // 5 minutes per chunk
const MIN_CHUNK_BYTES = 32000; // minimum chunk to bother transcribing (~2s at 8kHz)
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100MB download limit for edge function
const MIN_TRANSCRIPT_LENGTH = 50;

const SYNTHETIC_PATTERNS = [
  /\[isim soyisim\]/i,
  /\[şirket adı\]/i,
  /\[üniversite adı\]/i,
  /\[pozisyon adı\]/i,
];

// ── Helpers ─────────────────────────────────────────────────────────────
const toBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
};

const hasSyntheticPatterns = (text: string) =>
  SYNTHETIC_PATTERNS.some((p) => p.test(text));

const getAudioMimeType = (filePath: string, isWav: boolean) => {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (isWav || ext === "wav") return "audio/wav";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (ext === "weba" || ext === "webm" || ext === "opus") return "audio/webm";
  return "audio/webm";
};

// ── WAV Chunking ────────────────────────────────────────────────────────
interface WavInfo {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  bytesPerSecond: number;
  dataSize: number;
  totalDurationSec: number;
}

function parseWavHeader(buf: ArrayBuffer): WavInfo | null {
  if (buf.byteLength < WAV_HEADER_SIZE) return null;
  const view = new DataView(buf);

  // Verify RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== "RIFF") return null;

  const sampleRate = view.getUint32(24, true);
  const numChannels = view.getUint16(22, true);
  const bitsPerSample = view.getUint16(34, true);
  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  const dataSize = buf.byteLength - WAV_HEADER_SIZE;

  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    bytesPerSecond,
    dataSize,
    totalDurationSec: dataSize / bytesPerSecond,
  };
}

function splitWavIntoChunks(buf: ArrayBuffer, info: WavInfo, chunkDurationSec: number): ArrayBuffer[] {
  const chunkBytes = Math.floor(chunkDurationSec * info.bytesPerSecond);
  const chunks: ArrayBuffer[] = [];
  const srcBytes = new Uint8Array(buf);

  for (let offset = 0; offset < info.dataSize; offset += chunkBytes) {
    const end = Math.min(offset + chunkBytes, info.dataSize);
    const chunkDataSize = end - offset;

    if (chunkDataSize < MIN_CHUNK_BYTES) break; // skip tiny tail

    // Build WAV: header (44 bytes) + chunk PCM data
    const chunkBuf = new ArrayBuffer(WAV_HEADER_SIZE + chunkDataSize);
    const chunkArr = new Uint8Array(chunkBuf);
    const chunkView = new DataView(chunkBuf);

    // Copy original header
    chunkArr.set(srcBytes.subarray(0, WAV_HEADER_SIZE));

    // Patch sizes in header
    chunkView.setUint32(4, 36 + chunkDataSize, true); // RIFF chunk size
    chunkView.setUint32(40, chunkDataSize, true); // data sub-chunk size

    // Copy PCM data
    chunkArr.set(srcBytes.subarray(WAV_HEADER_SIZE + offset, WAV_HEADER_SIZE + end), WAV_HEADER_SIZE);

    chunks.push(chunkBuf);
  }

  return chunks;
}

// ── Transcribe a single audio buffer ────────────────────────────────────
async function transcribeChunk(
  audioBuf: ArrayBuffer,
  chunkIndex: number,
  totalChunks: number,
  recordingType: string,
  participants?: string[],
): Promise<string> {
  const participantCtx = participants?.length
    ? `Katılımcılar: ${participants.join(", ")}. Konuşmacıları mümkün olduğunca ayırt et.`
    : "Konuşmacıları mümkün olduğunca ayırt et.";

  const chunkHint = totalChunks > 1
    ? `Bu, toplam ${totalChunks} parçadan ${chunkIndex + 1}. parçadır. Önceki parçalarla tutarlı konuşmacı etiketleri kullan.`
    : "";
  const providerResult = await transcribeWithSpeechProvider(
    audioBuf,
    "audio/wav",
    `chunk-${chunkIndex + 1}.wav`,
    `Donebird ${recordingType === "mülakat" ? "mülakat" : "toplantı"} ses kaydı. ${participantCtx} ${chunkHint} Türkçe konuşmaları yazıya çevir.`,
  );
  if (providerResult.transcript) return providerResult.transcript;
  console.warn(`[process] Chunk ${chunkIndex + 1}/${totalChunks} direct provider failed:`, providerResult.error);

  const base64Audio = toBase64(audioBuf);

  const response = await callAI({
    model: "google/gemini-2.5-flash",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Sen profesyonel bir Türkçe transkripsiyon uzmanısın. Görevin yüklenen ses dosyasının GERÇEK konuşma metnini çıkarmak. ${participantCtx}

MUTLAK KURALLAR:
1) Yalnızca gerçekten duyduğun ses içeriğini kullan.
2) Ses dosyasını dinle ve konuşmaları transkribe et.
3) Medya okunamıyorsa veya yeterli konuşma yoksa transcript UYDURMA; status="failed" döndür.
4) Şablon konuşma, placeholder isim veya tahmini içerik üretme.
5) Konuşmacı değişiminde [Konuşmacı 1]: formatını kullan.
6) Zaman damgası ekleme.
${chunkHint}
7) Çıktı SADECE JSON: {"status":"ok|failed","transcript":"string|null","failure_reason":"string|null"}`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Bu ses dosyasının tam Türkçe transkriptini üret. Medya okunamazsa status="failed" dön.` },
          { type: "input_audio", input_audio: { data: base64Audio, format: "wav" } },
        ],
      },
    ],
  });

  const { data: parsed, error: parseErr } = await parseAIResponse(response, corsHeaders);
  if (parseErr) {
    console.error(`[process] Chunk ${chunkIndex + 1}/${totalChunks} parse error`);
    return "";
  }

  if (parsed?.status === "ok" && typeof parsed?.transcript === "string") {
    return parsed.transcript.trim();
  }

  console.warn(`[process] Chunk ${chunkIndex + 1}/${totalChunks} returned no transcript:`, parsed?.failure_reason);
  return "";
}

// ── Update job helper ───────────────────────────────────────────────────
async function updateJobStatus(
  supabase: any,
  jobId: string,
  updates: Record<string, any>,
) {
  try {
    await supabase.from("processing_jobs").update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  } catch (e) {
    console.warn("[process] Job update failed:", e);
  }
}

// ── Main handler ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await readJsonBody(req);
    if (isHealthRequest(body)) {
      return healthResponse("process-recording", {
        ...supabaseChecks({ serviceRole: true }),
        ...aiProviderChecks(),
        ...transcriptionChecks(),
      }, corsHeaders, { required: ["supabaseUrl", "supabaseServiceRoleKey", "aiProvider", "providerReady"] });
    }

    const { filePath, recordingId, jobId, recordingType, participants, recordingInfo, interviewQuestions } = body as Record<string, any>;

    if (!filePath || !recordingId) {
      return jsonResponse({ error: "filePath and recordingId are required" }, 400, corsHeaders);
    }

    const auth = await requireAuthenticatedUser(req, corsHeaders);
    if (!auth.ok) return auth.response;

    const storagePath = normalizeUserStoragePath(filePath, auth.user.id);
    if (!storagePath.ok) {
      return jsonResponse(
        { error: storagePath.error },
        storagePath.error.includes("ait değil") ? 403 : 400,
        corsHeaders,
      );
    }

    console.log(`[process] Starting for ${storagePath.path} recording=${recordingId} job=${jobId}`);

    const supabase = createServiceClient();
    const recordingOwner = await assertRecordingOwner(supabase, auth.user.id, corsHeaders, recordingId);
    if (!recordingOwner.ok) return recordingOwner.response;
    const jobOwner = await assertProcessingJobOwner(supabase, auth.user.id, corsHeaders, jobId);
    if (!jobOwner.ok) return jobOwner.response;

    // ── Update job: transcribing ──
    if (jobId) {
      await updateJobStatus(supabase, jobId, {
        status: "transcribing",
        pipeline_step: "transcribing",
        progress: 5,
        started_at: new Date().toISOString(),
      });
    }

    // ── Download audio from storage ──
    const { data: blob, error: dlErr } = await supabase.storage
      .from("recordings")
      .download(storagePath.path);

    if (dlErr || !blob) {
      console.error("[process] Download error:", dlErr);
      if (jobId) await updateJobStatus(supabase, jobId, { status: "failed", failure_reason: "Ses dosyası indirilemedi", failed_step: "download", error_type: "download_failed" });
      return new Response(JSON.stringify({ error: "Ses dosyası indirilemedi" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBuf = await blob.arrayBuffer();
    const audioBytes = audioBuf.byteLength;
    console.log(`[process] Downloaded ${audioBytes} bytes`);

    if (audioBytes === 0) {
      if (jobId) await updateJobStatus(supabase, jobId, { status: "failed", failure_reason: "Ses dosyası boş", failed_step: "download", error_type: "empty_file" });
      return new Response(JSON.stringify({ error: "Ses dosyası boş" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (audioBytes > MAX_DOWNLOAD_BYTES) {
      if (jobId) await updateJobStatus(supabase, jobId, { status: "failed", failure_reason: `Dosya çok büyük: ${Math.round(audioBytes / 1024 / 1024)}MB`, failed_step: "download", error_type: "file_too_large" });
      return new Response(JSON.stringify({ error: "Ses dosyası edge function limiti aşıyor" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Determine if chunking is needed ──
    const wavInfo = parseWavHeader(audioBuf);
    const isWav = wavInfo !== null;
    const needsChunking = isWav && audioBytes > 10 * 1024 * 1024; // >10MB WAV → chunk

    let transcript = "";
    let chunkCount = 1;

    if (needsChunking && wavInfo) {
      // ── CHUNKED TRANSCRIPTION ──
      console.log(`[process] WAV chunking: duration=${wavInfo.totalDurationSec.toFixed(0)}s, splitting into ${CHUNK_DURATION_SEC}s chunks`);

      if (jobId) await updateJobStatus(supabase, jobId, {
        pipeline_step: "chunking",
        progress: 8,
        metadata: { chunking: true, total_duration_sec: Math.round(wavInfo.totalDurationSec) },
      });

      const chunks = splitWavIntoChunks(audioBuf, wavInfo, CHUNK_DURATION_SEC);
      chunkCount = chunks.length;
      console.log(`[process] Created ${chunkCount} chunks`);

      if (jobId) await updateJobStatus(supabase, jobId, {
        pipeline_step: "transcribing_chunks",
        progress: 10,
        metadata: { chunking: true, chunk_count: chunkCount, chunks_completed: 0 },
      });

      const chunkTranscripts: string[] = [];
      let failedChunks = 0;

      for (let i = 0; i < chunks.length; i++) {
        const progress = 10 + Math.round((75 * (i + 1)) / chunks.length);

        try {
          console.log(`[process] Transcribing chunk ${i + 1}/${chunkCount} (${chunks[i].byteLength} bytes)`);
          const chunkText = await transcribeChunk(chunks[i], i, chunkCount, recordingType, participants);

          if (chunkText) {
            chunkTranscripts.push(chunkText);
          } else {
            failedChunks++;
            console.warn(`[process] Chunk ${i + 1} returned empty transcript`);
          }

          if (jobId) await updateJobStatus(supabase, jobId, {
            progress,
            metadata: { chunking: true, chunk_count: chunkCount, chunks_completed: i + 1, failed_chunks: failedChunks },
          });
        } catch (chunkErr) {
          failedChunks++;
          console.error(`[process] Chunk ${i + 1} error:`, chunkErr);

          // Don't abort entire process for a single chunk failure
          if (failedChunks > Math.ceil(chunkCount / 2)) {
            console.error(`[process] Too many chunk failures (${failedChunks}/${chunkCount}), aborting`);
            break;
          }
        }
      }

      // ── Merge chunk transcripts ──
      if (jobId) await updateJobStatus(supabase, jobId, { pipeline_step: "merging_transcript", progress: 88 });

      transcript = chunkTranscripts.join("\n\n--- Bölüm Geçişi ---\n\n");

      console.log(`[process] Merged ${chunkTranscripts.length}/${chunkCount} chunks, total ${transcript.length} chars, failed=${failedChunks}`);

    } else {
      // ── SINGLE-SHOT TRANSCRIPTION ──
      console.log(`[process] Single-shot transcription: ${audioBytes} bytes, wav=${isWav}`);

      if (jobId) await updateJobStatus(supabase, jobId, { pipeline_step: "transcribing", progress: 15 });

      const mimeType = getAudioMimeType(storagePath.path, isWav);
      const providerResult = await transcribeWithSpeechProvider(
        audioBuf,
        mimeType,
        storagePath.path,
        `Donebird ${recordingType === "mülakat" ? "mülakat" : "toplantı"} ses kaydı. ${participants?.length ? `Katılımcılar: ${participants.join(", ")}.` : ""} Türkçe konuşmaları yazıya çevir.`,
      );

      if (providerResult.transcript) {
        transcript = providerResult.transcript;
      } else {
        console.warn("[process] Single-shot direct provider failed, falling back to chat multimodal:", providerResult.error);
        const base64 = toBase64(audioBuf);

        const response = await callAI({
          model: "google/gemini-2.5-flash",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Sen profesyonel bir Türkçe transkripsiyon uzmanısın. Görevin yüklenen ses dosyasının GERÇEK konuşma metnini çıkarmak. ${participants?.length ? `Katılımcılar: ${participants.join(", ")}. Konuşmacıları ayırt et.` : "Konuşmacıları ayırt et."}

MUTLAK KURALLAR:
1) Yalnızca gerçekten duyduğun içeriği kullan.
2) Ses okunamazsa veya yeterli konuşma yoksa transcript UYDURMA; status="failed" döndür.
3) Placeholder isim veya tahmini içerik üretme.
4) Konuşmacı değişiminde [Konuşmacı 1]: formatını kullan.
5) Çıktı SADECE JSON: {"status":"ok|failed","transcript":"string|null","failure_reason":"string|null"}`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Bu ses dosyasının tam Türkçe transkriptini üret." },
                { type: "input_audio", input_audio: { data: base64, format: audioInputFormat(mimeType, storagePath.path) } },
              ],
            },
          ],
        });

        const { data: parsed, error: parseErr } = await parseAIResponse(response, corsHeaders);
        if (!parseErr && parsed?.status === "ok" && typeof parsed?.transcript === "string") {
          transcript = parsed.transcript.trim();
        }
      }
    }

    const detectedEntities = detectEntities(recordingInfo || { participants }, interviewQuestions || []);
    const normalizedTranscript = normalizeTranscriptWithEntities(
      transcript,
      recordingInfo || { participants },
      interviewQuestions || [],
    );
    transcript = normalizedTranscript.transcript.trim();

    // ── Validate transcript ──
    if (!transcript || transcript.length < MIN_TRANSCRIPT_LENGTH) {
      const reason = !transcript ? "Transkript oluşturulamadı" : `Transkript çok kısa (${transcript.length} karakter)`;
      console.error(`[process] Transcript validation failed: ${reason}`);

      if (jobId) await updateJobStatus(supabase, jobId, {
        status: "failed",
        failure_reason: reason,
        failed_step: "transcription",
        error_type: "transcription_failed",
        progress: 90,
      });

      // Save whatever we have
      if (transcript) {
        await supabase.from("recordings").update({ transcript }).eq("id", recordingId).eq("user_id", auth.user.id);
      }

      return new Response(JSON.stringify({ error: reason }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (hasSyntheticPatterns(transcript)) {
      console.error("[process] Synthetic transcript detected");
      if (jobId) await updateJobStatus(supabase, jobId, {
        status: "failed",
        failure_reason: "Sentetik/placeholder transkript tespit edildi",
        failed_step: "transcription",
        error_type: "synthetic_transcript",
      });
      return new Response(JSON.stringify({ error: "Sentetik transkript reddedildi" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Save transcript ──
    await supabase.from("recordings").update({ transcript }).eq("id", recordingId).eq("user_id", auth.user.id);

    if (jobId) await updateJobStatus(supabase, jobId, {
      status: "transcribed",
      pipeline_step: "transcribed",
      progress: 92,
      transcript_length: transcript.length,
      metadata: {
        chunking: needsChunking,
        chunk_count: chunkCount,
        transcript_length: transcript.length,
        transcript_correction_count: normalizedTranscript.corrections.length,
      },
    });

    console.log(`[process] Success: ${transcript.length} chars, chunks=${chunkCount}, corrections=${normalizedTranscript.corrections.length}`);

    return new Response(JSON.stringify({
      transcript,
      chunks: chunkCount,
      transcriptLength: transcript.length,
      corrections: normalizedTranscript.corrections,
      properNounGlossary: normalizedTranscript.glossary,
      detected_entities: detectedEntities,
      entity_confidence: detectedEntities.reduce<Record<string, string>>((acc, item) => {
        acc[item.name] = item.confidence;
        return acc;
      }, {}),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[process] Unexpected error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "İşlem hatası",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
