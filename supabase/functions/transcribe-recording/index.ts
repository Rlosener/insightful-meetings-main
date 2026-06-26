import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, parseAIResponse } from "../_shared/ai-client.ts";
import { assertRecordingOwner, createServiceClient, normalizeUserStoragePath, requireAuthenticatedUser } from "../_shared/auth.ts";
import { detectEntities, normalizeTranscriptWithEntities } from "../_shared/b2b-intelligence.ts";
import { healthResponse, transcriptionChecks } from "../_shared/health.ts";
import { audioInputFormat, normalizeAudioMimeType, transcribeWithSpeechProvider } from "../_shared/transcription-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Limits ──────────────────────────────────────────────────────────────
/** 50 MB – raised to support extracted audio from long recordings (40-min WAV ≈ 38MB at 8kHz) */
const MAX_INLINE_MEDIA_BYTES = 50 * 1024 * 1024;
const MIN_TRANSCRIPT_LENGTH = 8;
const ANALYSIS_READY_TRANSCRIPT_LENGTH = 50;

const SYNTHETIC_TRANSCRIPT_PATTERNS = [
  /\[isim soyisim\]/i,
  /\[şirket adı\]/i,
  /\[üniversite adı\]/i,
  /\[bölüm adı\]/i,
  /\[pozisyon adı\]/i,
];

// ── Helpers ─────────────────────────────────────────────────────────────
const MIME_MAP: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska",
  webm: "video/webm", avi: "video/x-msvideo",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
  weba: "audio/webm", opus: "audio/ogg",
};

const getMimeType = (filePath: string): string => {
  const ext = filePath.split(".").pop()?.toLowerCase() || "mp4";
  return MIME_MAP[ext] || "video/mp4";
};

const isAudioMime = (mime: string) => mime.startsWith("audio/");
const isVideoMime = (mime: string) => mime.startsWith("video/");

type SupabaseStorageListClient = {
  storage: {
    from: (bucket: string) => {
      list: (
        path: string,
        options: { search?: string; limit?: number },
      ) => Promise<{
        data: Array<{ name: string; metadata?: { size?: number | string | null } }> | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

const getStoredObjectSize = async (
  supabase: SupabaseStorageListClient,
  filePath: string,
) => {
  const segments = filePath.split("/");
  const fileName = segments.pop();
  const folder = segments.join("/");
  if (!fileName) return null;

  const { data, error } = await supabase.storage
    .from("recordings")
    .list(folder, { search: fileName, limit: 10 });

  if (error) { console.warn("[transcribe] list error", error); return null; }

  const matched = data?.find((i) => i.name === fileName) || data?.[0];
  const size = matched?.metadata?.size;
  return typeof size === "number" ? size : typeof size === "string" ? Number(size) : null;
};

const toBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
};

const digestHex = async (buf: ArrayBuffer): Promise<string> => {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const hasSyntheticPatterns = (text: string) =>
  SYNTHETIC_TRANSCRIPT_PATTERNS.some((p) => p.test(text));

const stringField = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === "string" ? record[key] as string : undefined;

type TranscriptProvider = "openai" | "google" | "gemini" | "web_speech" | "manual" | "unknown";

type TranscriptResult = {
  text: string;
  language: "tr" | "en" | "unknown";
  provider: TranscriptProvider;
  confidence?: number;
  segments?: Array<{ speaker?: string; start?: number; end?: number; text: string }>;
  warnings: string[];
  error?: string;
};

const normalizeProvider = (value: unknown): TranscriptProvider => {
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (normalized.includes("openai") || normalized.includes("whisper")) return "openai";
  if (normalized.includes("google")) return "google";
  if (normalized.includes("gemini")) return "gemini";
  if (normalized.includes("web")) return "web_speech";
  if (normalized.includes("manual")) return "manual";
  return "unknown";
};

const confidenceScore = (value: unknown) => {
  if (typeof value === "number") return Math.max(0, Math.min(1, value));
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("high") || normalized.includes("yüksek")) return 0.82;
  if (normalized.includes("medium") || normalized.includes("orta")) return 0.58;
  if (normalized.includes("low") || normalized.includes("düşük")) return 0.32;
  return undefined;
};

const detectLanguage = (text: string): TranscriptResult["language"] => {
  if (!text.trim()) return "unknown";
  const trSignals = text.match(/[çğıöşüÇĞİÖŞÜ]/g)?.length || 0;
  const trWords = text.match(/\b(ve|bir|için|olarak|ben|biz|bu|şu|ile|de|da)\b/gi)?.length || 0;
  const enWords = text.match(/\b(the|and|with|for|this|that|you|we|is|are)\b/gi)?.length || 0;
  if (trSignals > 0 || trWords >= enWords) return "tr";
  if (enWords > 2) return "en";
  return "unknown";
};

const buildTranscriptResult = (
  text: string,
  options: {
    provider?: unknown;
    confidence?: unknown;
    warnings?: string[];
    error?: string;
  } = {},
): TranscriptResult => {
  const cleanText = text.trim();
  const warnings = new Set(options.warnings || []);
  if (!cleanText) warnings.add("Transkript boş.");
  if (cleanText && cleanText.length < ANALYSIS_READY_TRANSCRIPT_LENGTH) {
    warnings.add(`Transkript analiz için kısa (${cleanText.length} karakter).`);
  }
  if (hasSyntheticPatterns(cleanText)) warnings.add("Transkript placeholder/şablon içerik sinyali içeriyor.");

  return {
    text: cleanText,
    language: detectLanguage(cleanText),
    provider: normalizeProvider(options.provider),
    confidence: confidenceScore(options.confidence),
    segments: cleanText ? [{ text: cleanText }] : [],
    warnings: Array.from(warnings),
    error: options.error,
  };
};

const transcriptErrorResponse = (
  message: string,
  status: number,
  transcriptResult: TranscriptResult,
  extra: Record<string, unknown> = {},
) => new Response(JSON.stringify({
  error: message,
  transcript: transcriptResult.text,
  transcriptResult,
  ...extra,
}), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

// ── Build the correct multimodal content part ───────────────────────────
/**
 * Audio  → OpenAI `input_audio` part   (natively supported)
 * Video  → `image_url` data-URL part   (Gemini handles video via this path)
 */
const buildMediaPart = (base64: string, mime: string, filePath: string) => {
  if (isAudioMime(mime)) {
    return {
      type: "input_audio",
      input_audio: { data: base64, format: audioInputFormat(mime, filePath) },
    };
  }
  // Video: send as data-URL via image_url – Gemini's OpenAI-compat layer
  // picks up video/* MIME types and processes natively.
  return {
    type: "image_url",
    image_url: { url: `data:${mime};base64,${base64}` },
  };
};

const providerHealth = () => ({
  openai: Boolean(Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_TRANSCRIPTION_API_KEY")),
  google: Boolean(
    Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    || Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    || Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON")
    || Deno.env.get("GOOGLE_SPEECH_TO_TEXT_API_KEY")
    || Deno.env.get("GOOGLE_SPEECH_API_KEY")
    || Deno.env.get("GOOGLE_CLOUD_SPEECH_API_KEY")
    || Deno.env.get("GOOGLE_CLOUD_API_KEY"),
  ),
  gemini: Boolean(Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY")),
  lovable: Boolean(Deno.env.get("LOVABLE_API_KEY")),
  custom_ai: Boolean(Deno.env.get("CUSTOM_AI_API_URL") && Deno.env.get("CUSTOM_AI_API_KEY")),
});

// ── Main handler ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method === "GET") {
    return healthResponse("transcribe-recording", transcriptionChecks(), corsHeaders, {
      required: ["providerReady"],
      message: Object.values(providerHealth()).some(Boolean)
        ? "En az bir transkript sağlayıcısı yapılandırılmış."
        : "Transkript sağlayıcısı yapılandırılmamış. OPENAI_API_KEY, GEMINI_API_KEY veya LOVABLE_API_KEY ekleyin.",
    });
  }

  try {
    const body = await req.json();
    if (body?.health === true) {
      return healthResponse("transcribe-recording", transcriptionChecks(), corsHeaders, { required: ["providerReady"] });
    }

    const { filePath, recordingId, recordingType, participants, recordingInfo, interviewQuestions } = body;

    if (!filePath) {
      return transcriptErrorResponse(
        "filePath is required",
        400,
        buildTranscriptResult("", { provider: "unknown", error: "filePath eksik." }),
      );
    }

    const auth = await requireAuthenticatedUser(req, corsHeaders);
    if (!auth.ok) return auth.response;

    const storagePath = normalizeUserStoragePath(filePath, auth.user.id);
    if (!storagePath.ok) {
      return transcriptErrorResponse(
        storagePath.error,
        storagePath.error.includes("ait değil") ? 403 : 400,
        buildTranscriptResult("", { provider: "unknown", error: storagePath.error }),
      );
    }

    console.log(`[transcribe] Starting for ${storagePath.path}`);

    const supabase = createServiceClient();
    const recordingOwner = await assertRecordingOwner(supabase, auth.user.id, corsHeaders, recordingId);
    if (!recordingOwner.ok) return recordingOwner.response;

    const detectedMimeType = getMimeType(storagePath.path);
    let mimeType = detectedMimeType.startsWith("audio/")
      ? normalizeAudioMimeType(detectedMimeType)
      : detectedMimeType.split(";")[0].trim();
    let isVideo = isVideoMime(mimeType);
    const participantCtx = participants?.length
      ? `Katılımcılar: ${participants.join(", ")}. Konuşmacıları mümkün olduğunca ayırt et.`
      : "Konuşmacıları mümkün olduğunca ayırt et.";
    const typeLabel = recordingType === "mülakat" ? "mülakat" : "toplantı";

    // ── Size gate (pre-download) ────────────────────────────────────
    const storedSize = await getStoredObjectSize(supabase, storagePath.path);
    if (typeof storedSize === "number") {
      console.log(`[transcribe] Storage size=${storedSize} mime=${mimeType}`);
      if (storedSize > MAX_INLINE_MEDIA_BYTES) {
        const limitMB = Math.round(MAX_INLINE_MEDIA_BYTES / 1024 / 1024);
        const fileMB = Math.round(storedSize / 1024 / 1024);
        return transcriptErrorResponse(
          `Dosya ${fileMB} MB. Güvenilir inline transkripsiyon limiti ${limitMB} MB. Lütfen daha küçük veya yalnızca ses dosyası yükleyin.`,
          422,
          buildTranscriptResult("", { provider: "unknown", error: "Dosya boyutu transkript limiti üzerinde." }),
          { mediaBytes: storedSize },
        );
      }
    }

    // ── Download ────────────────────────────────────────────────────
    const { data: blob, error: dlErr } = await supabase.storage
      .from("recordings")
      .download(storagePath.path);

    if (dlErr || !blob) {
      console.error("[transcribe] Download error:", dlErr);
      return transcriptErrorResponse(
        "Medya dosyası indirilemedi.",
        400,
        buildTranscriptResult("", { provider: "unknown", error: dlErr?.message || "Storage download failed." }),
      );
    }

    const mediaBuf = await blob.arrayBuffer();
    const mediaBytes = mediaBuf.byteLength;
    const mediaHash = await digestHex(mediaBuf);
    const storageMimeType = blob.type
      ? blob.type.startsWith("audio/")
        ? normalizeAudioMimeType(blob.type)
        : blob.type.split(";")[0].trim()
      : "";
    if (storageMimeType && storageMimeType !== mimeType) {
      console.log(`[transcribe] Storage content-type overrides extension mime: ${mimeType} -> ${storageMimeType}`);
      mimeType = storageMimeType;
      isVideo = isVideoMime(mimeType);
    }

    console.log(`[transcribe] Downloaded bytes=${mediaBytes} mime=${mimeType} hash=${mediaHash.slice(0, 16)}`);

    if (mediaBytes === 0) {
      return transcriptErrorResponse(
        "Medya dosyası boş.",
        400,
        buildTranscriptResult("", { provider: "unknown", error: "Boş medya dosyası." }),
        { mediaBytes },
      );
    }

    if (mediaBytes > MAX_INLINE_MEDIA_BYTES) {
      const limitMB = Math.round(MAX_INLINE_MEDIA_BYTES / 1024 / 1024);
      const fileMB = Math.round(mediaBytes / 1024 / 1024);
      return transcriptErrorResponse(
        `Dosya ${fileMB} MB. Inline transkripsiyon limiti ${limitMB} MB. Lütfen daha küçük veya yalnızca ses dosyası yükleyin.`,
        422,
        buildTranscriptResult("", { provider: "unknown", error: "Dosya boyutu transkript limiti üzerinde." }),
        { mediaBytes },
      );
    }

    // ── Build media content part ────────────────────────────────────
    const mediaKind = isVideo ? "video" : "audio";
    console.log(`[transcribe] Sending inline ${mediaKind} to AI: mime=${mimeType}, detected=${detectedMimeType}, type=${typeLabel}, bytes=${mediaBytes}`);

    const providerResult = await transcribeWithSpeechProvider(mediaBuf, mimeType, storagePath.path, "");
    let parsed: Record<string, unknown> = { confidence: providerResult.provider ? "high" : "unknown", provider: providerResult.provider };
    let transcript = providerResult.transcript.trim();

    if (!transcript) {
      console.warn("[transcribe] direct provider failed, falling back to chat multimodal:", providerResult.error);
      const mediaBase64 = toBase64(mediaBuf);
      const mediaPart = buildMediaPart(mediaBase64, mimeType, storagePath.path);

      // ── AI transcription fallback ─────────────────────────────────
      const response = await callAI({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Sen Donebird için çalışan profesyonel bir Türkçe transkripsiyon uzmanısın. Görevin yüklenen ${mediaKind} ${typeLabel} dosyasının yalnızca GERÇEK konuşma metnini çıkarmak.

MUTLAK KURALLAR:
1) Yalnızca gerçekten duyduğun/okuyabildiğin medya içeriğini kullan.
2) ${isVideo ? "Video dosyasındaki ses kanalını dinle ve konuşmaları transkribe et." : "Ses dosyasını dinle ve konuşmaları transkribe et."}
3) Medya okunamıyorsa, erişilemiyorsa, bozuksa veya yeterli konuşma yoksa transcript UYDURMA; status="failed" döndür.
4) Şablon konuşma, örnek mülakat, placeholder isim ([isim soyisim], [şirket adı] vb.) veya tahmini içerik üretme.
5) Konuşmacı değişiminde yeni satıra geç ve [Konuşmacı 1]: formatını kullan.
6) Zaman damgası ekleme.
7) Çıktı SADECE JSON olsun: {"status":"ok|failed","transcript":"string|null","failure_reason":"string|null","confidence":"high|medium|low"}`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Bu ${mediaKind} dosyasının tam Türkçe transkriptini üret. ${isVideo ? "Videodaki ses kanalından konuşmaları çıkar." : ""} Medya okunamazsa status="failed" dön.` },
              mediaPart,
            ],
          },
        ],
      });

      // ── Parse fallback ────────────────────────────────────────────
      const parsedResult = await parseAIResponse(response, corsHeaders);
      if (parsedResult.error) return parsedResult.error;
      parsed = parsedResult.data;
      transcript =
        parsed.status === "ok" && typeof parsed.transcript === "string"
          ? parsed.transcript.trim()
          : "";
    }

    const detectedEntities = detectEntities(recordingInfo || { participants }, interviewQuestions || []);
    const normalizedTranscript = normalizeTranscriptWithEntities(transcript, recordingInfo || { participants }, interviewQuestions || []);
    const finalTranscript = normalizedTranscript.transcript.trim();
    const providerWarnings = [
      ...(providerResult.warnings || []),
      ...(providerResult.providerErrors || []).map((item) => `${item.provider}: ${item.error}`),
    ];
    const transcriptResult = buildTranscriptResult(finalTranscript, {
      provider: providerResult.provider || stringField(parsed, "provider") || "unknown",
      confidence: parsed.confidence,
      warnings: [
        ...providerWarnings,
        ...normalizedTranscript.corrections.map((item) => `Düzeltme: ${item.from} → ${item.to}`),
      ],
    });

    if (!finalTranscript) {
      console.error("[transcribe] No transcript returned", parsed);
      return transcriptErrorResponse(
        stringField(parsed, "failure_reason") || providerResult.error || "Dosyadan konuşma metni çıkarılamadı. Sahte transkript üretimi engellendi.",
        422,
        buildTranscriptResult("", {
          provider: providerResult.provider || stringField(parsed, "provider") || "unknown",
          error: stringField(parsed, "failure_reason") || providerResult.error || "Transkript boş.",
          warnings: providerWarnings,
        }),
        {
          provider: providerResult.provider || stringField(parsed, "provider") || null,
          providerErrors: providerResult.providerErrors || [],
        },
      );
    }

    if (finalTranscript.length < MIN_TRANSCRIPT_LENGTH) {
      console.error("[transcribe] Transcript too short", finalTranscript.length);
      return transcriptErrorResponse(
        `Transkript çok kısa (${finalTranscript.length} karakter). Yeterli konuşma algılanamadı.`,
        422,
        { ...transcriptResult, error: "Transkript minimum uzunluğun altında." },
      );
    }

    if (hasSyntheticPatterns(finalTranscript)) {
      console.error("[transcribe] Synthetic pattern detected", finalTranscript.slice(0, 240));
      return transcriptErrorResponse(
        "Transkript placeholder/şablon içerik içerdiği için reddedildi.",
        422,
        { ...transcriptResult, error: "Placeholder/şablon içerik tespit edildi." },
      );
    }

    // ── Persist ─────────────────────────────────────────────────────
    if (recordingId) {
      const { error: updateErr } = await supabase
        .from("recordings")
        .update({ transcript: finalTranscript })
        .eq("id", recordingId)
        .eq("user_id", auth.user.id);

      if (updateErr) console.error("[transcribe] DB save error:", updateErr);
    }

    console.log(`[transcribe] Success: ${finalTranscript.length} chars, confidence=${parsed.confidence || "unknown"}, kind=${mediaKind}, corrections=${normalizedTranscript.corrections.length}`);

    return new Response(JSON.stringify({
      transcript: finalTranscript,
      transcriptResult,
      provider: providerResult.provider || stringField(parsed, "provider") || null,
      providerError: providerResult.error || null,
      providerErrors: providerResult.providerErrors || [],
      warnings: transcriptResult.warnings,
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
    console.error("[transcribe] Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Transkripsiyon hatası";
    return transcriptErrorResponse(
      message,
      500,
      buildTranscriptResult("", { provider: "unknown", error: message }),
    );
  }
});
