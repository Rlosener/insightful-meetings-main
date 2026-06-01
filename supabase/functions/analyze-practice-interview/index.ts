import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, parseAIResponse } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transcript, position, department, experienceYears, skills, frames, questionsAsked, totalQuestions, difficulty, interviewStyle } = await req.json();

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `Mülakat koçu. EN KRİTİK 2-3 soruna odaklan. Her feedback: Gözlem(1c) → Etki(1c) → Düzeltme(1c+kısa örnek). Transkriptten somut kanıt. Jenerik YASAK. Gerçekçi puanlama: 85+ nadir. Türkçe JSON.`,
        },
        {
          role: "user",
          content: `Poz:${position} Dept:${department || "?"} Deneyim:${experienceYears || "?"}yıl Beceri:${(skills || []).join(",")} Zorluk:${difficulty || "medium"} Tarz:${interviewStyle || "formal"} Soru:${questionsAsked || "?"}/${totalQuestions || "?"}

Transkript:\n${transcript}

JSON:
{
  "analysis": {
    "summary": string (max 100 kelime),
    "communication_score": number, "technical_score": number, "confidence_score": number,
    "clarity_score": number, "depth_score": number, "body_language_score": number,
    "problem_solving_score": number,
    "position_fit": string (2 cümle),
    "interview_readiness": "Hazır"|"Neredeyse Hazır"|"Geliştirilmeli"|"Başlangıç Seviyesi",
    "question_handling": string (2 cümle),
    "improvement_areas": string[] (5)
  },
  "answer_feedback": [{"question":string,"score":number,"observed_behavior":string,"communication_pattern":string,"interviewer_perception":string,"good":string,"missing":string,"how_to_improve":string,"better_answer":string}],
  "improvement_system": {"top_weaknesses":[{"weakness":string,"why_it_matters":string,"suggestion":string,"example":string,"tip":string}] (max 3)},
  "character_analysis": {
    "overall_score": number,
    "character_summary": string (max 150 kelime),
    "communication_style": string, "thinking_style": string,
    "interview_strengths": string[] (3-5), "interview_weaknesses": string[] (2-3),
    "behavioral_patterns": string[] (2-3), "stress_management": string,
    "emotional_intelligence": string, "hireability_signals": string,
    "personality_traits": string[] (4), "strengths": string[] (3-5), "weaknesses": string[] (2-3),
    "recommendations": string[] (3)
  },
  "career_management": {
    "current_level": string,
    "target_gap_analysis": string (2 cümle),
    "short_term_goals": string[] (4), "mid_term_goals": string[] (4), "long_term_goals": string[] (3),
    "skill_development": [{"skill":string,"current_level":number,"target_level":number,"action":string}],
    "recommended_resources": string[] (5),
    "networking_tips": string[] (3),
    "salary_positioning": string (2 cümle),
    "ideal_companies": string[] (3)
  },
  "swot": {"strengths":string[],"weaknesses":string[],"opportunities":string[],"threats":string[]},
  "action_plan": {"immediate":string[] (3),"before_next_interview":string[] (4),"practice_exercises":string[] (3)}
}`,
        },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
      model: "google/gemini-2.5-flash",
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
