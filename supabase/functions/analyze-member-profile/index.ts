import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, parseAIResponse } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { memberData, insights } = await req.json();

    const insightsSummary = (insights || []).slice(0, 10).map((i: any) =>
      `${i.recordings?.title || "?"} | Katkı:${i.contribution_score || "?"} İlet:${i.communication_style || "?"} Güven:${i.confidence_level || "?"} | G:${(i.strengths || []).slice(0, 2).join(",")} Z:${(i.areas_for_improvement || []).slice(0, 2).join(",")}`
    ).join("\n");

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `İK analisti. Personel profili ve toplantı verilerini analiz et. Objektif, dengeli. Türkçe JSON.`,
        },
        {
          role: "user",
          content: `${memberData.full_name} | ${memberData.position || "?"} | ${memberData.department || "?"} | Beceri:${(memberData.skills || []).slice(0, 5).join(",")}
Not: ${(memberData.notes || "").slice(0, 200)}

TOPLANTI(${(insights || []).length}):\n${insightsSummary || "Yok"}

JSON:
{
  "overall_assessment": string (200-300 kelime),
  "strengths": string[] (5),
  "development_areas": string[] (4),
  "recommended_position": string (2 cümle),
  "communication_patterns": string (2 cümle),
  "collaboration_insights": string (2 cümle),
  "personality_traits": string[],
  "risk_factors": string[]
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
