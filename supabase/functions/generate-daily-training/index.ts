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
    if (isHealthRequest(body)) return healthResponse("generate-daily-training", aiProviderChecks(), corsHeaders);
    const { targetRole, skills, weaknesses, strengths, avgScore, practiceCount, streakCount, goal } = body as Record<string, any>;

    const goalCtx = goal?.type === "career" ? "Kariyer gelişimi" :
      goal?.type === "skill" ? `Yetenek: ${goal.skillFocus}` :
      goal?.type === "interview" ? `Mülakat: ${goal.company} — ${goal.position}` : "";

    const ctx = [
      targetRole ? `Rol:${targetRole}` : "",
      goalCtx,
      skills?.length ? `Beceri:${skills.slice(0, 5).join(",")}` : "",
      weaknesses?.length ? `Zayıf:${weaknesses.slice(0, 3).join(",")}` : "",
      strengths?.length ? `Güçlü:${strengths.slice(0, 3).join(",")}` : "",
      avgScore ? `Ort:${avgScore}` : "",
    ].filter(Boolean).join(" | ");

    const goalInst = goal?.type === "interview"
      ? `Sorular ${goal.company} kültürüne ve ${goal.position} rolüne uygun olmalı. Teknik+davranışsal karıştır.`
      : goal?.type === "skill"
      ? `Sorular "${goal.skillFocus}" alanına odaklanmalı — teori, uygulama, problem çözme.`
      : `Sorular iletişim, problem çözme, liderlik gibi temel yetkinlikleri test etmeli.`;

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `Kariyer koçu. Hedefe özel günlük eğitim soruları üret. ${goalInst}

FORMAT: 10 soru: 1-4 MCQ, 5 açık, 6-9 MCQ, 10 açık. Orta zorluk.

MCQ KALİTE: 4 şık benzer uzunlukta (max 1 cümle). Doğru cevap farklı pozisyonlarda. Yanlış şıklar gerçekçi. "Hepsi/Hiçbiri" YASAK. Her şık kısa ve profesyonel.

Açıklama: Doğru neden doğru (1 cümle) + yanlış neden zayıf (1 cümle).
Türkçe JSON.`,
        },
        {
          role: "user",
          content: `${ctx}

JSON:
{
  "motivation": string (1 kısa cümle),
  "questions": [
    {
      "id": number,
      "type": "mcq"|"text",
      "question": string,
      "focus_area": string,
      "options": string[]|null,
      "correct_answer": number|null (0-3),
      "explanation": string
    }
  ]
}`,
        },
      ],
      temperature: 0.7,
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
