export interface SpeechTranscriptionResult {
  transcript: string;
  provider: "openai" | "google" | "gemini" | null;
  error?: string;
  providerErrors?: Array<{ provider: string; error: string }>;
  warnings?: string[];
}

let googleAccessTokenCache: { token: string; expiresAt: number } | null = null;

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

const warningForSmallAudio = (mediaBuf: ArrayBuffer) =>
  mediaBuf.byteLength < 1200 ? [`Audio blob çok küçük görünüyor (${mediaBuf.byteLength} byte). Mikrofon verisi gelmemiş olabilir.`] : [];

const toBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
};

const toBase64Url = (input: string | ArrayBuffer) => {
  const base64 = typeof input === "string" ? btoa(input) : toBase64(input);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemToArrayBuffer = (pem: string) => {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const getGoogleServiceAccount = () => {
  const raw = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    || Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    || Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.client_email || !parsed?.private_key) return null;
    return {
      clientEmail: String(parsed.client_email),
      privateKey: String(parsed.private_key).replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
};

const getGoogleAccessToken = async () => {
  if (googleAccessTokenCache && googleAccessTokenCache.expiresAt - 60_000 > Date.now()) {
    return googleAccessTokenCache.token;
  }

  const serviceAccount = getGoogleServiceAccount();
  if (!serviceAccount) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64Url(JSON.stringify({
    iss: serviceAccount.clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsignedJwt = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt),
  );
  const assertion = `${unsignedJwt}.${toBase64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Google OAuth ${response.status}: ${errorText.slice(0, 240)}`);
  }

  const data = await response.json();
  if (!data?.access_token) throw new Error("Google OAuth access_token dönmedi");

  googleAccessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000,
  };
  return googleAccessTokenCache.token;
};

const fileNameForMime = (filePath: string, mimeType: string) => {
  const originalName = filePath.split("/").pop() || "";
  const originalExt = originalName.split(".").pop()?.toLowerCase() || "";
  const openAiSupportedExts = new Set(["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm"]);
  if (openAiSupportedExts.has(originalExt)) return originalName;
  return getAudioFilenameByMime(mimeType);
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const extractTextFromGemini = (payload: unknown) => {
  const payloadRecord = asRecord(payload);
  const candidates = payloadRecord.candidates;
  const candidate = Array.isArray(candidates) ? candidates[0] : null;
  const content = asRecord(asRecord(candidate).content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((part) => asRecord(part).text)
    .filter((partText): partText is string => typeof partText === "string")
    .join("")
    .trim();
  if (!text) return "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
  } catch {
    return cleaned;
  }
};

const transcribeWithOpenAI = async (
  mediaBuf: ArrayBuffer,
  mimeType: string,
  filePath: string,
): Promise<SpeechTranscriptionResult> => {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_TRANSCRIPTION_API_KEY");
  if (!apiKey) return { transcript: "", provider: null, error: "OPENAI_API_KEY yok" };

  const normalizedMimeType = normalizeAudioMimeType(mimeType);
  const configuredModel = Deno.env.get("OPENAI_TRANSCRIBE_MODEL");
  const models = configuredModel ? [configuredModel] : ["gpt-4o-mini-transcribe", "whisper-1"];
  const errors: string[] = [];

  for (const model of models) {
    const form = new FormData();
    form.append("file", new Blob([mediaBuf], { type: normalizedMimeType }), fileNameForMime(filePath, normalizedMimeType));
    form.append("model", model);
    form.append("language", "tr");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      errors.push(`OpenAI ${model} ${response.status}: ${errorText.slice(0, 180)}`);
      continue;
    }

    const data = await response.json();
    const transcript = typeof data?.text === "string" ? data.text.trim() : "";
    if (transcript) return { transcript, provider: "openai" };
    errors.push(`OpenAI ${model}: boş transkript`);
  }

  return {
    transcript: "",
    provider: "openai",
    error: errors.join(" | ") || "OpenAI STT transkript döndürmedi",
  };
};

const transcribeWithGemini = async (
  mediaBuf: ArrayBuffer,
  mimeType: string,
  prompt: string,
): Promise<SpeechTranscriptionResult> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) return { transcript: "", provider: null, error: "GEMINI_API_KEY yok" };

  const normalizedMimeType = normalizeAudioMimeType(mimeType);
  const model = Deno.env.get("GEMINI_TRANSCRIBE_MODEL") || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          {
            text: `${prompt}

Yalnızca gerçek konuşmayı çıkar. Konuşma yoksa transcript boş dön.
Çıktı JSON olsun: {"transcript":"..."}`,
          },
          { inlineData: { mimeType: normalizedMimeType, data: toBase64(mediaBuf) } },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return { transcript: "", provider: "gemini", error: `Gemini STT ${response.status}: ${errorText.slice(0, 240)}` };
  }

  const data = await response.json();
  return { transcript: extractTextFromGemini(data), provider: "gemini" };
};

const googleSpeechEncoding = (mimeType: string, filePath = "") => {
  const normalizedMimeType = normalizeAudioMimeType(mimeType);
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "webm" || ext === "weba" || normalizedMimeType.includes("webm")) return "WEBM_OPUS";
  if (ext === "opus" || ext === "ogg" || normalizedMimeType.includes("ogg")) return "OGG_OPUS";
  if (ext === "mp3" || normalizedMimeType.includes("mpeg") || normalizedMimeType.includes("mp3")) return "MP3";
  if (ext === "flac" || normalizedMimeType.includes("flac")) return "FLAC";
  if (ext === "wav" || normalizedMimeType.includes("wav")) return "LINEAR16";
  return undefined;
};

const extractTextFromGoogleSpeech = (payload: unknown) =>
  (Array.isArray(asRecord(payload).results) ? asRecord(payload).results as unknown[] : [])
    .map((result) => {
      const alternatives = asRecord(result).alternatives;
      const firstAlternative = Array.isArray(alternatives) ? alternatives[0] : null;
      const transcript = asRecord(firstAlternative).transcript;
      return typeof transcript === "string" ? transcript : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();

const googleSpeechRequestBody = (
  mediaBuf: ArrayBuffer,
  mimeType: string,
  filePath: string,
  prompt: string,
) => {
  const normalizedMimeType = normalizeAudioMimeType(mimeType);
  const encoding = googleSpeechEncoding(normalizedMimeType, filePath);
  const config: Record<string, unknown> = {
    languageCode: "tr-TR",
    alternativeLanguageCodes: ["en-US"],
    enableAutomaticPunctuation: true,
    model: "latest_long",
    speechContexts: prompt ? [{ phrases: prompt.split(/[,\n.]/).map((item) => item.trim()).filter((item) => item.length > 2).slice(0, 50) }] : [],
  };
  if (encoding) config.encoding = encoding;
  if (encoding === "WEBM_OPUS" || encoding === "OGG_OPUS") config.sampleRateHertz = 48000;

  return {
    config,
    audio: { content: toBase64(mediaBuf) },
  };
};

const googleSpeechAuth = async () => {
  const accessToken = await getGoogleAccessToken();
  if (accessToken) {
    return {
      query: "",
      headers: { Authorization: `Bearer ${accessToken}` },
      missing: false,
    };
  }

  const apiKey = Deno.env.get("GOOGLE_SPEECH_TO_TEXT_API_KEY")
    || Deno.env.get("GOOGLE_SPEECH_API_KEY")
    || Deno.env.get("GOOGLE_CLOUD_SPEECH_API_KEY")
    || Deno.env.get("GOOGLE_CLOUD_API_KEY");
  if (!apiKey) {
    return {
      query: "",
      headers: {},
      missing: true,
    };
  }

  return {
    query: `?key=${encodeURIComponent(apiKey)}`,
    headers: {},
    missing: false,
  };
};

const pollGoogleSpeechOperation = async (
  operationName: string,
  auth: { query: string; headers: Record<string, string> },
) => {
  for (let attempt = 0; attempt < 45; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, attempt < 5 ? 1200 : 2500));
    const response = await fetch(`https://speech.googleapis.com/v1/${operationName}${auth.query}`, {
      headers: auth.headers,
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return { transcript: "", error: `Google Speech operation ${response.status}: ${errorText.slice(0, 240)}` };
    }
    const data = await response.json();
    if (data?.done) {
      if (data?.error) {
        return { transcript: "", error: `Google Speech operation error: ${JSON.stringify(data.error).slice(0, 240)}` };
      }
      return { transcript: extractTextFromGoogleSpeech(data?.response), error: undefined };
    }
  }

  return { transcript: "", error: "Google Speech operation timeout" };
};

const transcribeWithGoogleSpeech = async (
  mediaBuf: ArrayBuffer,
  mimeType: string,
  filePath: string,
  prompt: string,
): Promise<SpeechTranscriptionResult> => {
  let auth: { query: string; headers: Record<string, string>; missing: boolean };
  try {
    auth = await googleSpeechAuth();
  } catch (error) {
    return { transcript: "", provider: "google", error: error instanceof Error ? error.message : "Google Speech auth hatası" };
  }
  if (auth.missing) return { transcript: "", provider: null, error: "Google Speech için GOOGLE_SERVICE_ACCOUNT_JSON veya GOOGLE_SPEECH_API_KEY yok" };

  const body = googleSpeechRequestBody(mediaBuf, mimeType, filePath, prompt);
  const recognizeUrl = `https://speech.googleapis.com/v1/speech:recognize${auth.query}`;
  const recognizeResponse = await fetch(recognizeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth.headers },
    body: JSON.stringify(body),
  });

  if (recognizeResponse.ok) {
    const data = await recognizeResponse.json();
    const transcript = extractTextFromGoogleSpeech(data);
    if (transcript) return { transcript, provider: "google" };
  } else {
    const errorText = await recognizeResponse.text().catch(() => "");
    const shouldTryLongRunning = /longer than|too long|duration|sync/i.test(errorText) || mediaBuf.byteLength > 1_500_000;
    if (!shouldTryLongRunning) {
      return { transcript: "", provider: "google", error: `Google Speech ${recognizeResponse.status}: ${errorText.slice(0, 240)}` };
    }
  }

  const longRunningResponse = await fetch(`https://speech.googleapis.com/v1/speech:longrunningrecognize${auth.query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth.headers },
    body: JSON.stringify(body),
  });

  if (!longRunningResponse.ok) {
    const errorText = await longRunningResponse.text().catch(() => "");
    return { transcript: "", provider: "google", error: `Google Speech longrunning ${longRunningResponse.status}: ${errorText.slice(0, 240)}` };
  }

  const operation = await longRunningResponse.json();
  if (!operation?.name) {
    return { transcript: "", provider: "google", error: "Google Speech operation name dönmedi" };
  }

  const polled = await pollGoogleSpeechOperation(operation.name, auth);
  return {
    transcript: polled.transcript,
    provider: "google",
    error: polled.error,
  };
};

export const audioInputFormat = (mimeType: string, filePath = "") => {
  const normalizedMimeType = normalizeAudioMimeType(mimeType);
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "wav" || normalizedMimeType.includes("wav")) return "wav";
  if (ext === "mp3" || normalizedMimeType.includes("mpeg") || normalizedMimeType.includes("mp3")) return "mp3";
  if (ext === "m4a" || normalizedMimeType.includes("mp4")) return "m4a";
  if (ext === "webm" || ext === "weba" || normalizedMimeType.includes("webm")) return "webm";
  return "wav";
};

export const transcribeWithSpeechProvider = async (
  mediaBuf: ArrayBuffer,
  mimeType: string,
  filePath: string,
  prompt: string,
): Promise<SpeechTranscriptionResult> => {
  const normalizedMimeType = normalizeAudioMimeType(mimeType);
  console.log(`[transcription-provider] normalized mime: ${mimeType || "empty"} -> ${normalizedMimeType}, filename=${getAudioFilenameByMime(normalizedMimeType)}`);
  const warnings = warningForSmallAudio(mediaBuf);
  const providerErrors: Array<{ provider: string; error: string }> = [];
  const openAIResult = await transcribeWithOpenAI(mediaBuf, normalizedMimeType, filePath);
  if (openAIResult.transcript) return { ...openAIResult, warnings };
  if (openAIResult.error) {
    console.warn("[transcription-provider] openai failed:", openAIResult.error);
    providerErrors.push({ provider: "openai", error: openAIResult.error });
  }

  const googleSpeechResult = await transcribeWithGoogleSpeech(mediaBuf, normalizedMimeType, filePath, prompt);
  if (googleSpeechResult.transcript) return { ...googleSpeechResult, warnings };
  if (googleSpeechResult.error) {
    console.warn("[transcription-provider] google failed:", googleSpeechResult.error);
    providerErrors.push({ provider: "google", error: googleSpeechResult.error });
  }

  const geminiResult = await transcribeWithGemini(mediaBuf, normalizedMimeType, prompt);
  if (geminiResult.transcript) return { ...geminiResult, warnings };
  if (geminiResult.error) {
    console.warn("[transcription-provider] gemini failed:", geminiResult.error);
    providerErrors.push({ provider: "gemini", error: geminiResult.error });
  }

  return {
    transcript: "",
    provider: openAIResult.provider || googleSpeechResult.provider || geminiResult.provider,
    error: providerErrors.map((item) => `${item.provider}: ${item.error}`).join(" | ") || "Transkripsiyon sağlayıcısı yapılandırılmadı",
    providerErrors,
    warnings,
  };
};
