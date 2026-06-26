import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

export type AuthenticatedUserContext =
  | { ok: true; user: { id: string }; userClient: SupabaseClient }
  | { ok: false; response: Response };

export const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const getRequiredEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export const createServiceClient = () =>
  createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

export const requireAuthenticatedUser = async (
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthenticatedUserContext> => {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader) {
    return {
      ok: false,
      response: jsonResponse({ error: "Yetkilendirme gerekli" }, 401, corsHeaders),
    };
  }

  const userClient = createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return {
      ok: false,
      response: jsonResponse({ error: "Oturum geçersiz" }, 401, corsHeaders),
    };
  }

  return { ok: true, user: { id: data.user.id }, userClient };
};

export const normalizeUserStoragePath = (
  filePath: unknown,
  userId: string,
): { ok: true; path: string } | { ok: false; error: string } => {
  if (typeof filePath !== "string" || !filePath.trim()) {
    return { ok: false, error: "filePath is required" };
  }

  const path = decodeURIComponent(filePath.trim()).replace(/^\/+/, "");
  if (path.includes("..") || path.startsWith("http://") || path.startsWith("https://")) {
    return { ok: false, error: "Geçersiz dosya yolu." };
  }

  if (!path.startsWith(`${userId}/`)) {
    return { ok: false, error: "Bu medya dosyası oturumdaki kullanıcıya ait değil." };
  }

  return { ok: true, path };
};

export const assertRecordingOwner = async (
  serviceClient: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>,
  recordingId?: unknown,
): Promise<{ ok: true } | { ok: false; response: Response }> => {
  if (!recordingId) return { ok: true };
  if (typeof recordingId !== "string") {
    return { ok: false, response: jsonResponse({ error: "recordingId geçersiz" }, 400, corsHeaders) };
  }

  const { data, error } = await serviceClient
    .from("recordings")
    .select("id, user_id")
    .eq("id", recordingId)
    .maybeSingle();

  if (error) {
    return { ok: false, response: jsonResponse({ error: error.message }, 500, corsHeaders) };
  }

  if (!data) {
    return { ok: false, response: jsonResponse({ error: "Kayıt bulunamadı" }, 404, corsHeaders) };
  }

  if (data.user_id !== userId) {
    return { ok: false, response: jsonResponse({ error: "Bu kayıt oturumdaki kullanıcıya ait değil." }, 403, corsHeaders) };
  }

  return { ok: true };
};

export const assertProcessingJobOwner = async (
  serviceClient: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>,
  jobId?: unknown,
): Promise<{ ok: true } | { ok: false; response: Response }> => {
  if (!jobId) return { ok: true };
  if (typeof jobId !== "string") {
    return { ok: false, response: jsonResponse({ error: "jobId geçersiz" }, 400, corsHeaders) };
  }

  const { data, error } = await serviceClient
    .from("processing_jobs")
    .select("id, user_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    return { ok: false, response: jsonResponse({ error: error.message }, 500, corsHeaders) };
  }

  if (!data) {
    return { ok: false, response: jsonResponse({ error: "İş kaydı bulunamadı" }, 404, corsHeaders) };
  }

  if (data.user_id !== userId) {
    return { ok: false, response: jsonResponse({ error: "Bu iş kaydı oturumdaki kullanıcıya ait değil." }, 403, corsHeaders) };
  }

  return { ok: true };
};
