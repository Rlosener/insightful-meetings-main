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
    if (isHealthRequest(body)) return healthResponse("meeting-assistant", aiProviderChecks(), corsHeaders);
    const { messages, meetingContext } = body as { messages?: Array<{ role: string; content: string }>; meetingContext?: any };

    const systemPrompt = `Sen bir toplantı asistanısın. Toplantı sırasında gerçek zamanlı olarak yardımcı oluyorsun.

GÖREVLERİN:
1. Konuşulan konular hakkında ANLIK öneriler sun
2. Eksik kalan noktaları hatırlat
3. İlgili soruların sorulmasını öner
4. Karar alınması gereken konuları vurgula
5. Eylem maddeleri öner
6. Toplantının verimli ilerlemesine katkı sağla

${meetingContext ? `TOPLANTI BAĞLAMI:\nKonu: ${meetingContext.topic}\nGündem: ${meetingContext.agenda}\nKatılımcılar: ${meetingContext.participants?.join(", ")}` : ""}

ÖNEMLİ: Kısa, öz ve aksiyona dönük öneriler sun. Her öneriyi net ve uygulanabilir tut.`;

    const response = await callAI({
      messages: [
        { role: "system", content: systemPrompt },
        ...(messages || [])
      ],
      stream: true,
      temperature: 0.7,
    });

    const errorResponse = handleAIError(response, corsHeaders);
    if (errorResponse) return errorResponse;

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      throw new Error(`AI error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Error in meeting assistant:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
