export type HealthStatus = "ok" | "misconfigured" | "error";
export type HealthChecks = Record<string, boolean | string>;

interface HealthOptions {
  required?: string[];
  message?: string;
}

const hasCustomAI = () => Boolean(Deno.env.get("CUSTOM_AI_API_URL") && Deno.env.get("CUSTOM_AI_API_KEY"));
const hasLovableAI = () => Boolean(Deno.env.get("LOVABLE_API_KEY"));

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function isHealthRequest(body: Record<string, unknown>) {
  return body.health === true;
}

export function aiProviderChecks(): HealthChecks {
  const provider = hasCustomAI() ? "custom_ai" : hasLovableAI() ? "lovable_gateway" : "missing";
  return {
    aiProvider: provider !== "missing",
    provider,
  };
}

export function supabaseChecks(options: { anon?: boolean; serviceRole?: boolean } = {}): HealthChecks {
  return {
    supabaseUrl: Boolean(Deno.env.get("SUPABASE_URL")),
    ...(options.anon ? { supabaseAnonKey: Boolean(Deno.env.get("SUPABASE_ANON_KEY")) } : {}),
    ...(options.serviceRole ? { supabaseServiceRoleKey: Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) } : {}),
  };
}

export function transcriptionChecks(): HealthChecks {
  const openai = Boolean(Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_TRANSCRIPTION_API_KEY"));
  const google = Boolean(
    Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
      || Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")
      || Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON")
      || Deno.env.get("GOOGLE_SPEECH_TO_TEXT_API_KEY")
      || Deno.env.get("GOOGLE_SPEECH_API_KEY")
      || Deno.env.get("GOOGLE_CLOUD_SPEECH_API_KEY")
      || Deno.env.get("GOOGLE_CLOUD_API_KEY"),
  );
  const gemini = Boolean(Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY"));
  const lovable = Boolean(Deno.env.get("LOVABLE_API_KEY"));
  const customAi = hasCustomAI();
  const configuredProviders = [
    openai ? "openai" : "",
    google ? "google" : "",
    gemini ? "gemini" : "",
    lovable ? "lovable" : "",
    customAi ? "custom_ai" : "",
  ].filter(Boolean).join(", ") || "none";

  return {
    providerReady: openai || google || gemini || lovable || customAi,
    configuredProviders,
    openai,
    google,
    gemini,
    lovable,
    custom_ai: customAi,
  };
}

export function zoomChecks(): HealthChecks {
  return {
    zoomClientId: Boolean(Deno.env.get("ZOOM_CLIENT_ID")),
    zoomClientSecret: Boolean(Deno.env.get("ZOOM_CLIENT_SECRET")),
    zoomAccountId: Boolean(Deno.env.get("ZOOM_ACCOUNT_ID")),
  };
}

export function healthResponse(
  functionName: string,
  checks: HealthChecks,
  corsHeaders: Record<string, string>,
  options: HealthOptions = {},
) {
  const requiredKeys = options.required || Object.keys(checks).filter((key) => typeof checks[key] === "boolean");
  const missingRequired = requiredKeys.filter((key) => checks[key] !== true);
  const status: HealthStatus = missingRequired.length === 0 ? "ok" : "misconfigured";
  const message = options.message || (
    status === "ok"
      ? "Health kontrolü başarılı."
      : `Konfigürasyon eksik: ${missingRequired.join(", ")}`
  );

  return new Response(
    JSON.stringify({ status, function: functionName, checks, message }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
