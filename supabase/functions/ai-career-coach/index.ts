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
    if (isHealthRequest(body)) return healthResponse("ai-career-coach", aiProviderChecks(), corsHeaders);
    const { practices } = body as { practices?: any[] };

    const practicesSummary = (practices || []).map((p: any, i: number) =>
      `Oturum ${i + 1} (${p.created_at}): Pozisyon: ${p.position} | Departman: ${p.department || "?"} | Süre: ${p.duration || "?"} | Skor: ${p.character_analysis?.overall_score || "?"}/100 | İletişim: ${p.analysis_data?.communication_score || "?"} | Özgüven: ${p.analysis_data?.confidence_score || "?"} | Teknik: ${p.analysis_data?.technical_score || "?"} | Güçlü: ${(p.character_analysis?.strengths || []).slice(0, 5).join(", ")} | Zayıf: ${(p.character_analysis?.weaknesses || []).slice(0, 5).join(", ")}`
    ).join("\n");

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `Sen kişisel bir AI kariyer koçusun. Kullanıcının tüm pratik mülakat oturumlarını analiz ederek kişiselleştirilmiş gelişim önerileri sunacaksın.

KURALLAR:
1. Samimi ama profesyonel bir ton kullan — "Gözlemlerime göre...", "Verileriniz şunu gösteriyor..." gibi
2. Oturumlar arası gelişimi analiz et
3. Tutarlılık ve trendleri değerlendir
4. Haftalık pratik önerileri sun
5. Kesin yargılardan kaçın, gözlem ve eğilim bildir`,
        },
        {
          role: "user",
          content: `${(practices || []).length} PRATİK OTURUMU:
${practicesSummary}

JSON formatında kişiselleştirilmiş koçluk çıktısı:
{
  "personalized_assessment": string (300-400 kelime — samimi, doğrudan kullanıcıya hitap eden, veriye dayalı değerlendirme),
  "key_observations": string[] (5-7 — en kritik gözlemler, spesifik ve veriye dayalı),
  "weekly_focus": [{ "area": string, "action": string, "exercise": string }] (3-4 haftalık odak alanı),
  "improvement_trends": string (3-4 cümle — oturumlar arası gelişim trendleri),
  "consistency_feedback": string (2-3 cümle — tutarlılık değerlendirmesi),
  "consolidated_strengths": string[] (5-7),
  "focus_areas": string[] (4-6),
  "next_steps": string[] (5-7 somut aksiyon)
}`,
        },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
    });

    const errorResponse = handleAIError(response, corsHeaders);
    if (errorResponse) return errorResponse;

    if (!response.ok) throw new Error(`AI error: ${response.status}`);

    const aiResponse = await response.json();
    const result = JSON.parse(aiResponse.choices[0].message.content);

    return new Response(JSON.stringify(result), {
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
