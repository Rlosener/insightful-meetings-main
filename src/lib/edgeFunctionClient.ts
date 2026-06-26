/**
 * Centralized Edge Function client with retry, timeout, and detailed error handling.
 */
import { supabase } from "@/integrations/supabase/client";
import { API_DEFAULTS, SUPABASE_URL } from "@/config/api";

// ── Error Types ─────────────────────────────────────────────────────────
export type EdgeFunctionErrorType =
  | "VALIDATION"      // 400 — bad request body
  | "AUTH"            // 401/403 — token missing/invalid
  | "NOT_FOUND"       // 404 — resource not found
  | "RATE_LIMIT"      // 429 — too many requests
  | "PAYMENT"         // 402 — credits exhausted
  | "CORS"            // CORS preflight failure
  | "TIMEOUT"         // request timed out
  | "SERVER"          // 5xx server error
  | "NETWORK"         // fetch failed entirely
  | "PARSE"           // response wasn't valid JSON
  | "UNKNOWN";

export interface EdgeFunctionError {
  type: EdgeFunctionErrorType;
  message: string;          // user-friendly Turkish message
  detail?: string;          // technical detail for logging
  status?: number;
}

export interface EdgeFunctionResult<T = any> {
  data: T | null;
  error: EdgeFunctionError | null;
}

export interface EdgeFunctionStreamResult {
  response: Response | null;
  error: EdgeFunctionError | null;
}

// ── Classification ──────────────────────────────────────────────────────
function buildErrorDetail(body: Record<string, unknown> | null | undefined) {
  const serverMsg = typeof body?.error === "string"
    ? body.error
    : typeof body?.message === "string"
      ? body.message
      : "";
  const providerErrors = Array.isArray(body?.providerErrors)
    ? body.providerErrors
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const record = item as { provider?: string; error?: string };
        return record.provider && record.error ? `${record.provider}: ${record.error}` : "";
      })
      .filter(Boolean)
      .join(" | ")
    : "";
  const providerError = typeof body?.providerError === "string" ? body.providerError : "";
  return [serverMsg, providerErrors, providerError].filter(Boolean).join(" — ");
}

function classifyError(status: number, body: Record<string, unknown> | null | undefined): EdgeFunctionError {
  const serverMsg = typeof body?.error === "string"
    ? body.error
    : typeof body?.message === "string"
      ? body.message
      : "";
  const detail = buildErrorDetail(body);

  if (status === 400) return { type: "VALIDATION", message: "İstek verisi geçersiz. Lütfen bilgileri kontrol edip tekrar deneyin.", detail, status };
  if (status === 401 || status === 403) {
    if (/scope/i.test(serverMsg)) return { type: "AUTH", message: "Zoom uygulamasında gerekli izinler (scope) eksik. Zoom Marketplace'ten izinleri güncelleyin.", detail, status };
    if (/zoom/i.test(serverMsg)) return { type: "AUTH", message: serverMsg || "Zoom bağlantı hatası.", detail, status };
    return { type: "AUTH", message: "Oturum süresi dolmuş veya yetkiniz yok. Lütfen tekrar giriş yapın.", detail, status };
  }
  if (status === 402) return { type: "PAYMENT", message: "AI kredisi tükendi. Lütfen hesabınıza kredi ekleyin.", detail, status };
  if (status === 404) return { type: "NOT_FOUND", message: "İstenen kaynak bulunamadı. ID veya URL'yi kontrol edin.", detail, status };
  if (status === 422) {
    return {
      type: "VALIDATION",
      message: serverMsg || "İşlem tamamlanamadı. Gönderilen veri geçerli değil veya yetersiz.",
      detail,
      status,
    };
  }
  if (status === 429) return { type: "RATE_LIMIT", message: "Çok fazla istek gönderildi. Lütfen birkaç dakika bekleyip tekrar deneyin.", detail, status };
  if (status >= 500) return { type: "SERVER", message: "Sunucu hatası oluştu. Lütfen birkaç saniye sonra tekrar deneyin.", detail, status };

  return { type: "UNKNOWN", message: serverMsg || `Beklenmeyen hata (${status})`, detail, status };
}

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

// ── Sleep ───────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readResponseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.clone().json();
  } catch {
    try {
      return { error: await response.clone().text() };
    } catch {
      return {};
    }
  }
}

// ── Main Invoke ─────────────────────────────────────────────────────────
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  body: Record<string, any>,
  options?: { maxRetries?: number; timeoutMs?: number }
): Promise<EdgeFunctionResult<T>> {
  const maxRetries = options?.maxRetries ?? API_DEFAULTS.MAX_RETRIES;
  const timeoutMs = options?.timeoutMs ?? API_DEFAULTS.TIMEOUT_MS;

  // Pre-flight: ensure we have a valid session
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.access_token) {
    console.warn(`[EdgeFn] No active session for ${functionName}`);
    return {
      data: null,
      error: {
        type: "AUTH",
        message: "Oturum bulunamadı. Lütfen tekrar giriş yapın.",
        detail: "No active supabase session",
        status: 401,
      },
    };
  }

  let lastError: EdgeFunctionError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[EdgeFn] ${functionName} attempt ${attempt + 1}/${maxRetries + 1}`, Object.keys(body));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        signal: controller.signal,
        timeout: timeoutMs,
      });

      clearTimeout(timer);

      // supabase-js wraps non-2xx as FunctionsHttpError
      if (error) {
        const context = (error as any)?.context;
        const status: number = context?.status ?? 500;

        // Read actual response body from the Response object
        let errBody: any = data ?? {};
        if (context && typeof context.json === "function" && Object.keys(errBody).length === 0) {
          try {
            errBody = await context.json();
          } catch {
            try {
              errBody = { error: await context.text() };
            } catch {
              errBody = {};
            }
          }
        }

        console.error(`[EdgeFn] ${functionName} error ${status}:`, errBody);

        const classified = classifyError(status, errBody);

        if (isRetryable(status) && attempt < maxRetries) {
          const delay = API_DEFAULTS.RETRY_DELAY_MS * Math.pow(2, attempt);
          console.log(`[EdgeFn] Retrying ${functionName} in ${delay}ms...`);
          await sleep(delay);
          lastError = classified;
          continue;
        }

        return { data: null, error: classified };
      }

      // Check if the response body itself has an error field
      if (data?.error) {
        console.error(`[EdgeFn] ${functionName} returned error in body:`, data.error);
        return {
          data: null,
          error: {
            type: "SERVER",
            message: typeof data.error === "string" ? data.error : "Sunucu işlem hatası.",
            detail: JSON.stringify(data.error),
          },
        };
      }

      console.log(`[EdgeFn] ${functionName} success`);
      return { data: data as T, error: null };

    } catch (err: any) {
      console.error(`[EdgeFn] ${functionName} exception:`, err);

      if (err?.name === "AbortError") {
        return { data: null, error: { type: "TIMEOUT", message: "İstek zaman aşımına uğradı. Lütfen tekrar deneyin." } };
      }

      if (/failed to fetch|networkerror|load failed/i.test(err?.message || "")) {
        if (attempt < maxRetries) {
          await sleep(API_DEFAULTS.RETRY_DELAY_MS * Math.pow(2, attempt));
          lastError = { type: "NETWORK", message: "Ağ bağlantısı kurulamadı. İnternet bağlantınızı kontrol edin." };
          continue;
        }
        return { data: null, error: { type: "NETWORK", message: "Ağ bağlantısı kurulamadı. İnternet bağlantınızı kontrol edin.", detail: err?.message } };
      }

      return { data: null, error: { type: "UNKNOWN", message: err?.message || "Bilinmeyen hata oluştu.", detail: err?.stack } };
    }
  }

  return { data: null, error: lastError || { type: "UNKNOWN", message: "İşlem başarısız oldu." } };
}

export async function invokeEdgeFunctionStream(
  functionName: string,
  body: Record<string, any>,
  options?: { timeoutMs?: number }
): Promise<EdgeFunctionStreamResult> {
  if (!SUPABASE_URL) {
    return {
      response: null,
      error: {
        type: "VALIDATION",
        message: "Supabase URL yapılandırılmamış.",
        detail: "Missing VITE_SUPABASE_URL",
      },
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.access_token) {
    return {
      response: null,
      error: {
        type: "AUTH",
        message: "Oturum bulunamadı. Lütfen tekrar giriş yapın.",
        detail: "No active supabase session",
        status: 401,
      },
    };
  }

  const timeoutMs = options?.timeoutMs ?? API_DEFAULTS.TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const bodyJson = await readResponseBody(response);
      return { response: null, error: classifyError(response.status, bodyJson) };
    }

    return { response, error: null };
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      return { response: null, error: { type: "TIMEOUT", message: "İstek zaman aşımına uğradı. Lütfen tekrar deneyin." } };
    }
    return {
      response: null,
      error: {
        type: /failed to fetch|networkerror|load failed/i.test(err?.message || "") ? "NETWORK" : "UNKNOWN",
        message: err?.message || "Bilinmeyen hata oluştu.",
        detail: err?.stack,
      },
    };
  }
}

/**
 * Show a user-friendly toast based on EdgeFunctionError type.
 */
export function getErrorToastMessage(error: EdgeFunctionError): string {
  return error.message;
}
