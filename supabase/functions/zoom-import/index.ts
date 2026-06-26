import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { healthResponse, isHealthRequest, zoomChecks } from "../_shared/health.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ZOOM_OAUTH_URL = "https://zoom.us/oauth/token";
const ZOOM_API_BASE = "https://api.zoom.us/v2";
const DEFAULT_TIMEOUT_MS = 20000;

type Action = "get-recordings" | "get-transcript";

type RequestBody = {
  meetingIdOrUrl: string;
  action: Action;
};

type ZoomOAuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

type ZoomErrorDetails = {
  status: number;
  code?: number;
  message: string;
  raw: string;
};

type RecordingFile = {
  id?: string;
  file_type?: string;
  file_extension?: string;
  file_size?: number;
  recording_type?: string;
  status?: string;
  download_url?: string;
  play_url?: string;
};

type ZoomRecordingsResponse = {
  id?: string | number;
  uuid?: string;
  topic?: string;
  start_time?: string;
  duration?: number;
  total_size?: number;
  recording_count?: number;
  host_email?: string;
  participant_count?: number;
  recording_files?: RecordingFile[];
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

function normalizeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Bilinmeyen hata";
}

function createTimeoutSignal(timeoutMs = DEFAULT_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort("Request timeout"), timeoutMs);
  return controller.signal;
}

async function safeJsonParse<T>(input: string): Promise<T | null> {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function parseRequestBodyText(text: string): RequestBody {
  const parsed = safeJsonParse<RequestBody>(text);

  if (!parsed) {
    throw new Error("Geçersiz istek gövdesi (JSON parse hatası).");
  }

  if (!parsed.meetingIdOrUrl || typeof parsed.meetingIdOrUrl !== "string") {
    throw new Error("Meeting ID veya URL gerekli.");
  }

  if (!parsed.action || !["get-recordings", "get-transcript"].includes(parsed.action)) {
    throw new Error("Geçersiz action. 'get-recordings' veya 'get-transcript' kullanın.");
  }

  return parsed;
}

async function parseRequestBody(req: Request): Promise<RequestBody> {
  return parseRequestBodyText(await req.text());
}

async function getZoomAccessToken(): Promise<string> {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");

  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      "Zoom API credentials not configured. Please set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET.",
    );
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const body = new URLSearchParams();
  body.set("grant_type", "account_credentials");
  body.set("account_id", accountId);

  const response = await fetch(ZOOM_OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: createTimeoutSignal(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[zoom-import] Zoom OAuth error:", response.status, errorText);
    throw new Error(
      `Zoom kimlik doğrulama başarısız (${response.status}). Lütfen Zoom Marketplace'te Server-to-Server OAuth uygulamanızın aktif olduğunu ve ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET değerlerinin doğru olduğunu kontrol edin.`,
    );
  }

  const data = (await response.json()) as ZoomOAuthResponse;

  if (!data?.access_token) {
    throw new Error("Zoom access token alınamadı.");
  }

  return data.access_token;
}

function extractMeetingIdentifier(input: string): string {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);

    const pathParts = url.pathname.split("/").filter(Boolean);

    for (const part of pathParts) {
      const cleaned = part.replace(/[\s-]/g, "");
      if (/^\d{9,11}$/.test(cleaned)) {
        return cleaned;
      }
    }

    const pwdMeetingId = url.searchParams.get("meeting_id");
    if (pwdMeetingId) return pwdMeetingId;
  } catch {
    // not a URL, continue
  }

  const cleaned = trimmed.replace(/[\s-]/g, "");
  if (/^\d{9,11}$/.test(cleaned)) return cleaned;

  return trimmed;
}

function encodeMeetingIdentifierForPath(identifier: string): string {
  // Zoom past meeting UUID values may contain / or // and must be double-encoded.
  // For numeric meeting IDs, normal encoding is harmless.
  return encodeURIComponent(encodeURIComponent(identifier));
}

async function parseZoomError(response: Response): Promise<ZoomErrorDetails> {
  const raw = await response.text();
  const parsed = await safeJsonParse<Record<string, unknown>>(raw);

  return {
    status: response.status,
    code: typeof parsed?.code === "number" ? parsed.code : undefined,
    message:
      typeof parsed?.message === "string"
        ? parsed.message
        : typeof parsed?.error === "string"
          ? parsed.error
          : raw || `Zoom API error: ${response.status}`,
    raw,
  };
}

function buildZoomErrorResponse(error: ZoomErrorDetails): Response {
  if (error.status === 404) {
    return jsonResponse(
      {
        error: "Meeting bulunamadı veya recording mevcut değil. Meeting ID / UUID değerini kontrol edin.",
        error_type: "ZOOM_NOT_FOUND",
        zoom_error_code: error.code,
        zoom_error_message: error.message,
      },
      404,
    );
  }

  if (error.code === 4711 || /does not contain scopes/i.test(error.message)) {
    return jsonResponse(
      {
        error:
          "Zoom app gerekli recording scope'larına sahip değil. Zoom Marketplace'te cloud_recording:read:list_recording_files (veya admin varyantı) ekleyin, ardından Server-to-Server OAuth app'i yeniden authorize / reinstall edin.",
        error_type: "ZOOM_SCOPE_MISSING",
        zoom_error_code: error.code,
        zoom_error_message: error.message,
      },
      403,
    );
  }

  if (error.status === 401) {
    return jsonResponse(
      {
        error: "Zoom access token geçersiz veya süresi dolmuş.",
        error_type: "ZOOM_AUTH",
        zoom_error_code: error.code,
        zoom_error_message: error.message,
      },
      401,
    );
  }

  if (error.status === 403) {
    return jsonResponse(
      {
        error: "Zoom API erişimi reddedildi. App permission / scope / account yetkilerini kontrol edin.",
        error_type: "ZOOM_FORBIDDEN",
        zoom_error_code: error.code,
        zoom_error_message: error.message,
      },
      403,
    );
  }

  return jsonResponse(
    {
      error: `Zoom API error: ${error.status}`,
      error_type: "ZOOM_API",
      zoom_error_code: error.code,
      zoom_error_message: error.message,
    },
    error.status || 500,
  );
}

async function zoomFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${ZOOM_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
    signal: createTimeoutSignal(),
  });

  return response;
}

async function fetchRecordings(
  meetingIdentifier: string,
  accessToken: string,
): Promise<ZoomRecordingsResponse | Response> {
  const encodedId = encodeMeetingIdentifierForPath(meetingIdentifier);

  const response = await zoomFetch(`/meetings/${encodedId}/recordings`, accessToken);

  if (!response.ok) {
    const zoomError = await parseZoomError(response);
    console.error(
      `[zoom-import] Recordings error: status=${zoomError.status} code=${zoomError.code} msg=${zoomError.message}`,
    );
    return buildZoomErrorResponse(zoomError);
  }

  const data = (await response.json()) as ZoomRecordingsResponse;
  return data;
}

async function fetchParticipants(meetingIdentifier: string, accessToken: string): Promise<any[]> {
  try {
    const encodedId = encodeMeetingIdentifierForPath(meetingIdentifier);

    const response = await zoomFetch(`/past_meetings/${encodedId}/participants?page_size=300`, accessToken);

    if (!response.ok) {
      const err = await parseZoomError(response);
      console.warn(`[zoom-import] Participants fetch failed: status=${err.status} code=${err.code} msg=${err.message}`);
      return [];
    }

    const data = await response.json();

    return (data.participants || []).map((p: any) => ({
      name: p.name,
      email: p.user_email,
      join_time: p.join_time,
      leave_time: p.leave_time,
      duration: p.duration,
      attentiveness_score: p.attentiveness_score,
    }));
  } catch (error) {
    console.warn("[zoom-import] Could not fetch participants:", error);
    return [];
  }
}

async function downloadTranscriptFile(downloadUrl: string, accessToken: string): Promise<string> {
  try {
    const url = `${downloadUrl}${downloadUrl.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`;

    const response = await fetch(url, {
      method: "GET",
      signal: createTimeoutSignal(),
    });

    if (!response.ok) {
      console.warn(`[zoom-import] Transcript download failed: ${response.status}`);
      return "";
    }

    const vttText = await response.text();
    return parseVttToText(vttText);
  } catch (error) {
    console.warn("[zoom-import] Transcript download exception:", error);
    return "";
  }
}

function mapMeetingInfo(data: ZoomRecordingsResponse) {
  return {
    id: data.id,
    uuid: data.uuid,
    topic: data.topic,
    start_time: data.start_time,
    duration: data.duration,
    total_size: data.total_size,
    recording_count: data.recording_count,
    host_email: data.host_email,
    participants_count: data.participant_count,
  };
}

function mapRecordings(data: ZoomRecordingsResponse) {
  return (data.recording_files || []).map((file: RecordingFile) => ({
    id: file.id,
    file_type: file.file_type,
    file_extension: file.file_extension,
    file_size: file.file_size,
    recording_type: file.recording_type,
    status: file.status,
    download_url: file.download_url,
    play_url: file.play_url,
  }));
}

function isTranscriptFile(file: RecordingFile): boolean {
  const recordingType = (file.recording_type || "").toLowerCase();
  const fileType = (file.file_type || "").toUpperCase();
  const extension = (file.file_extension || "").toLowerCase();

  return (
    recordingType.includes("transcript") ||
    recordingType.includes("closed_caption") ||
    fileType === "TRANSCRIPT" ||
    fileType === "VTT" ||
    fileType === "SRT" ||
    fileType === "TXT" ||
    extension === "vtt" ||
    extension === "srt" ||
    extension === "txt"
  );
}

function transcriptFilePriority(file: RecordingFile): number {
  const recordingType = (file.recording_type || "").toLowerCase();
  const fileType = (file.file_type || "").toUpperCase();
  if (recordingType === "audio_transcript") return 0;
  if (fileType === "TRANSCRIPT") return 1;
  if (fileType === "VTT" || file.file_extension?.toLowerCase() === "vtt") return 2;
  return 3;
}

function buildParticipantStats(participants: any[]) {
  return {
    total_participants: participants.length,
    participants: participants.map((p) => ({
      name: p.name,
      duration_minutes: Math.round((p.duration || 0) / 60),
      attentiveness: p.attentiveness_score ?? "N/A",
    })),
    avg_duration:
      participants.length > 0
        ? Math.round(participants.reduce((sum, p) => sum + (p.duration || 0), 0) / participants.length / 60)
        : 0,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Sadece POST desteklenir.", error_type: "METHOD" }, 405);
  }

  try {
    let body: RequestBody;

    try {
      const rawText = await req.text();
      const rawBody = safeJsonParse<Record<string, unknown>>(rawText);
      if (rawBody && isHealthRequest(rawBody)) {
        return healthResponse("zoom-import", zoomChecks(), corsHeaders);
      }
      body = parseRequestBodyText(rawText);
    } catch (error) {
      const message = normalizeErrorMessage(error);
      console.error("[zoom-import] Validation error:", message);
      return jsonResponse({ error: message, error_type: "VALIDATION" }, 400);
    }

    const { meetingIdOrUrl, action } = body;
    console.log(`[zoom-import] action=${action} input=${meetingIdOrUrl.slice(0, 60)}`);

    let accessToken: string;
    try {
      accessToken = await getZoomAccessToken();
    } catch (error) {
      const message = normalizeErrorMessage(error);
      console.error("[zoom-import] Auth failed:", message);
      return jsonResponse({ error: message, error_type: "AUTH" }, 401);
    }

    const meetingIdentifier = extractMeetingIdentifier(meetingIdOrUrl);
    console.log(`[zoom-import] Extracted meeting identifier=${meetingIdentifier}`);

    if (action === "get-recordings") {
      const recordingsData = await fetchRecordings(meetingIdentifier, accessToken);

      if (recordingsData instanceof Response) {
        return recordingsData;
      }

      const meetingInfo = mapMeetingInfo(recordingsData);
      const recordings = mapRecordings(recordingsData);

      console.log(`[zoom-import] Recordings OK: ${recordings.length} files`);

      return jsonResponse({
        success: true,
        action,
        meetingInfo,
        recordings,
      });
    }

    if (action === "get-transcript") {
      const recordingsData = await fetchRecordings(meetingIdentifier, accessToken);

      if (recordingsData instanceof Response) {
        return recordingsData;
      }

      const transcriptFile = (recordingsData.recording_files || [])
        .filter(isTranscriptFile)
        .sort((a, b) => transcriptFilePriority(a) - transcriptFilePriority(b))[0];

      let transcript = "";

      if (transcriptFile?.download_url) {
        console.log(
          `[zoom-import] Downloading transcript file type=${transcriptFile.file_type} recording_type=${transcriptFile.recording_type}`,
        );
        transcript = await downloadTranscriptFile(transcriptFile.download_url, accessToken);
        console.log(`[zoom-import] Transcript parsed: ${transcript.length} chars`);
      } else {
        console.warn("[zoom-import] No transcript file found in recordings");
      }

      const participants = await fetchParticipants(meetingIdentifier, accessToken);
      console.log(`[zoom-import] Participants: ${participants.length}`);

      const meetingInfo = {
        topic: recordingsData.topic,
        start_time: recordingsData.start_time,
        duration: recordingsData.duration,
        host_email: recordingsData.host_email,
        uuid: recordingsData.uuid,
        id: recordingsData.id,
      };

      const participantStats = buildParticipantStats(participants);

      return jsonResponse({
        success: true,
        action,
        transcript,
        meetingInfo,
        participants: participantStats,
        hasTranscript: transcript.length > 0,
        transcriptSource: transcriptFile
          ? {
              id: transcriptFile.id,
              file_type: transcriptFile.file_type,
              file_extension: transcriptFile.file_extension,
              recording_type: transcriptFile.recording_type,
            }
          : null,
      });
    }

    return jsonResponse({ error: "Geçersiz action.", error_type: "VALIDATION" }, 400);
  } catch (error) {
    console.error("[zoom-import] Unhandled error:", error);

    const message = normalizeErrorMessage(error);
    const isTimeout = /timeout|timed out|aborted/i.test(message);

    return jsonResponse(
      {
        error: isTimeout ? "İstek zaman aşımına uğradı. Lütfen tekrar deneyin." : message,
        error_type: isTimeout ? "TIMEOUT" : "SERVER",
      },
      isTimeout ? 504 : 500,
    );
  }
});

function parseVttToText(vtt: string): string {
  const lines = vtt.split("\n");
  const textLines: string[] = [];
  let currentSpeaker = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;
    if (trimmed === "WEBVTT") continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s-->\s\d{2}:\d{2}:\d{2}\.\d{3}/.test(trimmed)) continue;
    if (/^\d{2}:\d{2}\.\d{3}\s-->\s\d{2}:\d{2}\.\d{3}/.test(trimmed)) continue;
    if (/^NOTE/.test(trimmed)) continue;

    const speakerMatch = trimmed.match(/^([^:]{1,80}):\s*(.*)$/);

    if (speakerMatch) {
      const speaker = speakerMatch[1].trim();
      const text = speakerMatch[2].trim();

      if (speaker && speaker !== currentSpeaker) {
        currentSpeaker = speaker;
        textLines.push(`\n[${speaker}]: ${text}`);
      } else if (text) {
        textLines.push(text);
      }
    } else {
      textLines.push(trimmed);
    }
  }

  return textLines.join(" ").replace(/\s+/g, " ").trim();
}
