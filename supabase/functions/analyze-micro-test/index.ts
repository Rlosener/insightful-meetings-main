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
    if (isHealthRequest(body)) return healthResponse("analyze-micro-test", aiProviderChecks(), corsHeaders);
    const { questions, answers, targetRole, goal, score, mcqCorrect, mcqTotal } = body as Record<string, any>;

    const goalText = goal?.type === "career" ? "Kariyer gelişimi" :
      goal?.type === "skill" ? `Yetenek: ${goal.skillFocus}` :
      goal?.type === "interview" ? `Mülakat: ${goal.company}—${goal.position}` : "";

    // Only send incorrect/notable answers to reduce tokens
    const qaText = (answers || []).map((a: any, i: number) => {
      const base = `S${i + 1}[${a.focus_area}](${a.type}): ${a.question}`;
      if (a.type === "text") return `${base}\nCevap: ${(a.user_answer || "").slice(0, 200)}`;
      return `${base}\nCevap: ${a.user_answer || "(boş)"} | ${a.correct ? "✓" : `✗ Doğru:${a.correct_answer_text}`}`;
    }).join("\n");

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `Kariyer koçu. Günlük eğitim sonuçlarını analiz et. Spesifik ol, jenerik ifade YASAK. Cevaplara referans ver. Türkçe JSON.`,
        },
        {
          role: "user",
          content: `Rol:${targetRole || "?"} ${goalText} Skor:${score}/100 (${mcqCorrect}/${mcqTotal} doğru)

${qaText}

JSON:
{
  "summary": string (2-3 cümle),
  "strengths": string[] (2-3),
  "weaknesses": string[] (2-3),
  "focus_breakdown": [{"area":string,"score":number,"note":string}],
  "improvement_tips": string[] (3),
  "progress_note": string,
  "coach_suggestion": string
}`,
        },
      ],
      temperature: 0.4,
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
