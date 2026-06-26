import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, parseAIResponse } from "../_shared/ai-client.ts";
import { aiProviderChecks, healthResponse, isHealthRequest, readJsonBody } from "../_shared/health.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await readJsonBody(req);
    if (isHealthRequest(body)) return healthResponse("analyze-character-overall", aiProviderChecks(), corsHeaders);
    const { practices } = body as { practices?: any[] };

    const summary = (practices || []).slice(0, 8).map((p: any, i: number) =>
      `P${i + 1}: ${p.position} | Skor:${p.character_analysis?.overall_score || "?"} İlet:${p.analysis_data?.communication_score || "?"} Özgü:${p.analysis_data?.confidence_score || "?"} | G:${(p.character_analysis?.strengths || []).slice(0, 3).join(",")} Z:${(p.character_analysis?.weaknesses || []).slice(0, 3).join(",")} | Kişilik:${(p.character_analysis?.personality_traits || []).slice(0, 3).join(",")}`
    ).join("\n");

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `Kariyer koçu ve davranışsal değerlendirme uzmanı. 3 katman: Gözlem → İletişim Kalıbı → Mülakat Etkisi. Pratiklerden somut kanıt göster. Genel etiket YASAK. Güvenli dil kullan. Türkçe JSON.`,
        },
        {
          role: "user",
          content: `${(practices || []).length} PRATİK:\n${summary}

JSON:
{
  "overall_assessment": string (300 kelime),
  "communication_profile": string (3 cümle),
  "thinking_profile": string (2 cümle),
  "career_recommendations": string (200 kelime),
  "core_strengths": string[] (5),
  "interview_blind_spots": string[] (3),
  "hireability_assessment": string (2 cümle),
  "development_plan": string[] (5),
  "ideal_roles": string[],
  "personality_profile": string (2 cümle)
}`,
        },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
      model: "google/gemini-2.5-flash-lite",
    });

    const { data, error } = await parseAIResponse(response, corsHeaders);
    if (error) return error;

    return new Response(JSON.stringify({ analysis: data }), {
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
