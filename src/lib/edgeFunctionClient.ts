/**
 * Centralized Edge Function client with retry, timeout, and detailed error handling.
 */
import { supabase } from "@/integrations/supabase/client";
import { API_DEFAULTS } from "@/config/api";

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

// ── Classification ──────────────────────────────────────────────────────
function classifyError(status: number, body: any): EdgeFunctionError {
  const serverMsg = body?.error || body?.message || "";

  if (status === 400) return { type: "VALIDATION", message: "İstek verisi geçersiz. Lütfen bilgileri kontrol edip tekrar deneyin.", detail: serverMsg, status };
  if (status === 401 || status === 403) {
    if (/scope/i.test(serverMsg)) return { type: "AUTH", message: "Zoom uygulamasında gerekli izinler (scope) eksik. Zoom Marketplace'ten izinleri güncelleyin.", detail: serverMsg, status };
    if (/zoom/i.test(serverMsg)) return { type: "AUTH", message: typeof serverMsg === "string" ? serverMsg : "Zoom bağlantı hatası.", detail: serverMsg, status };
    return { type: "AUTH", message: "Oturum süresi dolmuş veya yetkiniz yok. Lütfen tekrar giriş yapın.", detail: serverMsg, status };
  }
  if (status === 402) return { type: "PAYMENT", message: "AI kredisi tükendi. Lütfen hesabınıza kredi ekleyin.", detail: serverMsg, status };
  if (status === 404) return { type: "NOT_FOUND", message: "İstenen kaynak bulunamadı. ID veya URL'yi kontrol edin.", detail: serverMsg, status };
  if (status === 429) return { type: "RATE_LIMIT", message: "Çok fazla istek gönderildi. Lütfen birkaç dakika bekleyip tekrar deneyin.", detail: serverMsg, status };
  if (status >= 500) return { type: "SERVER", message: "Sunucu hatası oluştu. Lütfen birkaç saniye sonra tekrar deneyin.", detail: serverMsg, status };

  return { type: "UNKNOWN", message: serverMsg || `Beklenmeyen hata (${status})`, detail: serverMsg, status };
}

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

// ── Sleep ───────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/**
 * Show a user-friendly toast based on EdgeFunctionError type.
 */
export function getErrorToastMessage(error: EdgeFunctionError): string {
  return error.message;
}
