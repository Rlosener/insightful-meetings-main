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
    if (isHealthRequest(body)) return healthResponse("analyze-company", aiProviderChecks(), corsHeaders);
    const { members, companyNotes } = body as { members?: any[]; companyNotes?: string };

    const membersSummary = (members || []).map((m: any) =>
      `${m.full_name} | ${m.position || "?"} | ${m.department || "?"} | Beceri:${(m.skills || []).slice(0, 5).join(",")} | Not:${(m.notes || "").slice(0, 100)} | Toplantı:${m.insights_count || 0}`
    ).join("\n");

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `İK stratejisti. Personel ve toplantı verilerini analiz et. Organizasyonel perspektif. Türkçe JSON.`,
        },
        {
          role: "user",
          content: `PERSONEL(${(members || []).length}):\n${membersSummary || "Yok"}\n\nNotlar: ${(companyNotes || "").slice(0, 500)}

JSON:
{
  "executive_summary": string (200-300 kelime),
  "team_dynamics": string (2-3 cümle),
  "talent_map": {"strong_areas":string[],"gaps":string[],"recommendations":string[]},
  "organizational_strengths": string[] (4-5),
  "risk_factors": string[] (3),
  "strategic_recommendations": string[] (4-5),
  "department_analysis": string (2-3 cümle),
  "leadership_assessment": string (2 cümle),
  "culture_insights": string (2 cümle),
  "action_items": string[] (4)
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
