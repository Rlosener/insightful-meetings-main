import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, handleAIError } from "../_shared/ai-client.ts";
import { aiProviderChecks, healthResponse, isHealthRequest, readJsonBody } from "../_shared/health.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await readJsonBody(req);
    if (isHealthRequest(body)) return healthResponse("career-coach-chat", aiProviderChecks(), corsHeaders);
    const { message, context } = body as Record<string, any>;

    const parts = [];
    if (context) {
      if (context.practiceCount) parts.push(`${context.practiceCount} pratik`);
      if (context.trainingCount) parts.push(`${context.trainingCount} eğitim`);
      if (context.lastScore) parts.push(`Son:${context.lastScore}`);
      if (context.avgScore) parts.push(`Ort:${context.avgScore}`);
      if (context.avgTrainingScore) parts.push(`EğitimOrt:${context.avgTrainingScore}`);
      if (context.weaknesses?.length) parts.push(`Zayıf:${context.weaknesses.slice(0, 3).join(",")}`);
      if (context.strengths?.length) parts.push(`Güçlü:${context.strengths.slice(0, 3).join(",")}`);
      if (context.patterns?.length) parts.push(`Kalıp:${context.patterns.slice(0, 2).join(",")}`);
    }

    const ctxStr = parts.length > 0 ? `Kullanıcı: ${parts.join(" | ")}` : "";

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `Donebird AI Kariyer Koçu. Keskin, direkt, bazen sert. Her yanıtta veri referansı ZORUNLU.

YAPI: 🔍 İçgörü (1-2 cümle) → 💡 Bir Cümle Gerçeği → 📝 Geri Bildirim (2 cümle) → ✍️ Güçlü Cevap Örneği (varsa) → 🎯 Adımlar (2-3)
Max 8 cümle. Tekrar yok. Türkçe.
${ctxStr}`,
        },
        { role: "user", content: message },
      ],
      temperature: 0.6,
      model: "google/gemini-2.5-flash-lite",
    });

    const errorResponse = handleAIError(response, corsHeaders);
    if (errorResponse) return errorResponse;

    if (!response.ok) throw new Error(`AI error: ${response.status}`);

    const aiResponse = await response.json();
    const reply = aiResponse.choices?.[0]?.message?.content || "Bir hata oluştu, lütfen tekrar deneyin.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
