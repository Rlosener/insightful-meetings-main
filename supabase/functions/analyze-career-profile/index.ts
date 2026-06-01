import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, parseAIResponse } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { profile, practiceHistory } = await req.json();

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `Kıdemli kariyer danışmanı. Profili analiz et, spesifik içgörüler üret. Jenerik tavsiye YASAK — profil verisine referans ver. Türkçe JSON. career_readiness_score: 0-100, gerçekçi.`,
        },
        {
          role: "user",
          content: `Profil: ${JSON.stringify({
            full_name: profile?.full_name,
            target_role: profile?.target_role,
            skills: profile?.skills?.slice(0, 10),
            summary: profile?.summary?.slice(0, 300),
            experience: (profile?.experience || []).slice(0, 3).map((e: any) => ({ title: e.title, company: e.company, years: e.years })),
            education: (profile?.education || []).slice(0, 2),
            certifications: (profile?.certifications || []).slice(0, 3),
          })}
${practiceHistory ? `Pratik: ${practiceHistory.count} oturum, Ort:${practiceHistory.avgScore}, Son:${practiceHistory.latestScore}` : "Pratik yok."}

JSON:
{
  "strengths": [{"title":string,"detail":string}] (max 4),
  "weaknesses": [{"title":string,"detail":string}] (max 4),
  "missing_skills": string[] (3),
  "career_gaps": [{"gap":string,"impact":string}],
  "role_alignment": {"score":number,"summary":string,"key_matches":string[],"key_misses":string[]},
  "skill_gap_analysis": {"required_skills":string[],"matched_skills":string[],"missing_skills":string[],"priority_skills":[{"skill":string,"priority":string,"reason":string,"how_to_learn":string}]},
  "career_readiness_score": number,
  "score_explanation": string,
  "score_breakdown": {"education":{"score":number,"note":string},"experience":{"score":number,"note":string},"skills":{"score":number,"note":string},"certifications":{"score":number,"note":string},"projects":{"score":number,"note":string}},
  "linkedin_profile_insights": string[] (3),
  "how_to_improve": [{"action":string,"impact":string,"effort":string,"detail":string}] (3-4),
  "profile_summary": string,
  "recommendations": string[] (3)
}`,
        },
      ],
      temperature: 0.4,
      model: "google/gemini-2.5-flash-lite",
    });

    const { data, error } = await parseAIResponse(response, corsHeaders);
    if (error) return error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("analyze-career-profile error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Bilinmeyen hata" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
