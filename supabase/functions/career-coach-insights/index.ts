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
    if (isHealthRequest(body)) return healthResponse("career-coach-insights", aiProviderChecks(), corsHeaders);
    const { practices, trainings, careerProfile } = body as Record<string, any>;

    // Compact summaries — only essential data
    const practiceSummary = (practices || []).slice(0, 5).map((p: any, i: number) =>
      `P${i + 1}: ${p.position} | Skor:${p.character_analysis?.overall_score || "?"} İlet:${p.analysis_data?.communication_score || "?"} Özgü:${p.analysis_data?.confidence_score || "?"} | G:${(p.character_analysis?.strengths || []).slice(0, 2).join(",")} Z:${(p.character_analysis?.weaknesses || []).slice(0, 2).join(",")}`
    ).join("\n");

    const trainingSummary = (trainings || []).slice(0, 5).map((t: any, i: number) => {
      const g = t.answers?.goal;
      const gt = g?.type === "interview" ? `${g.company}-${g.position}` : g?.type === "skill" ? g.skillFocus : "Kariyer";
      return `E${i + 1}(${t.training_date}): ${t.score || "?"}/100 Hedef:${gt} G:${(t.feedback?.detailed_analysis?.strengths || []).slice(0, 2).join(",")} Z:${(t.feedback?.detailed_analysis?.weaknesses || []).slice(0, 2).join(",")}`;
    }).join("\n");

    const profileCtx = careerProfile ? `Profil: ${careerProfile.target_role || "?"} | Beceri: ${(careerProfile.skills || []).slice(0, 5).join(",")} | Hazırlık: ${careerProfile.career_readiness_score || "?"}` : "";

    const hasPractices = (practices || []).length > 0;
    const hasTrainings = (trainings || []).length > 0;
    const ctx = [
      hasPractices ? `PRATİK(${practices.length}):\n${practiceSummary}` : "",
      hasTrainings ? `EĞİTİM(${trainings.length}):\n${trainingSummary}` : "",
      profileCtx,
    ].filter(Boolean).join("\n\n");

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `Donebird AI Kariyer Koçu. Keskin, direkt, veri-odaklı. Max 6 cümle/bölüm. Tekrar yok. Türkçe JSON.

Görev: Kalıp tanı, karşılaştır, trajektori çiz, sinyal ver.
Ton: Destekleyici ama sert. Jenerik övgü YASAK.`,
        },
        {
          role: "user",
          content: `${ctx}

JSON:
{
  "one_line_truth": string,
  "daily_focus": string,
  "weekly_focus": string[] (2),
  "performance_signals": {"clarity":"Düşük|Orta|İyi|Çok İyi","structure":"...","confidence":"...","knowledge":"..."},
  "comparative_feedback": string,
  "career_trajectory": {"current_path":string,"improved_path":string,"timeline":string},
  "top_weaknesses": [{"area":string,"why_it_matters":string,"tip":string,"example":string,"rewritten_example":string,"practice_exercise":string}] (max 2-3),
  "personal_advice": {"communication":string,"structure":string,"confidence":string},
  "progress_note": string,
  "pattern_detection": string[] (2-3),
  "next_actions": [{"action":string,"priority":"high"|"medium"|"low","estimated_impact":string}] (3),
  "smart_recommendations": {"learn_next":string[] (2),"practice_next":string,"target_roles":string[] (1-2)}
}`,
        },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
      model: "google/gemini-2.5-flash-lite",
    });

    const { data, error } = await parseAIResponse(response, corsHeaders);
    if (error) return error;

    return new Response(JSON.stringify(data), {
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
