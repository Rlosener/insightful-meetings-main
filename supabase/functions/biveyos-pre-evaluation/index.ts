import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, handleAIError } from "../_shared/ai-client.ts";
import { getPrompt } from "../_shared/prompt-registry.ts";
import { logPromptUsage, renderPrompt } from "../_shared/prompt-renderer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { candidate } = await req.json();

    if (!candidate || !text(candidate.jobTitle) || !text(candidate.cvText)) {
      return new Response(
        JSON.stringify({ error: "Aday pozisyonu ve CV metni zorunludur." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const candidateName = text(candidate.fullName) || `${text(candidate.firstName)} ${text(candidate.lastName)}`.trim() || "Aday";
    const prompt = getPrompt("BIVEYOS_PRE_EVALUATION");
    const rendered = renderPrompt(prompt, {
      candidateName,
      position: text(candidate.jobTitle),
      department: text(candidate.department) || "Belirtilmedi",
      experienceYears: text(candidate.experienceYears) || "Belirtilmedi",
      education: text(candidate.education) || "Belirtilmedi",
      jobDescription: text(candidate.jobDescription) || "Belirtilmedi",
      cvFileName: text(candidate.cvFileName) || "Belirtilmedi",
      cvText: text(candidate.cvText),
      notes: text(candidate.notes) || "Yok",
    });
    logPromptUsage(rendered.metadata, { usedBy: "biveyos-pre-evaluation", inputSummary: candidateName });

    const response = await callAI({
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: rendered.systemPrompt,
        },
        {
          role: "user",
          content: rendered.userPrompt,
        },
      ],
    });

    const errorResponse = handleAIError(response, corsHeaders);
    if (errorResponse) return errorResponse;
    if (!response.ok) throw new Error(`AI error: ${response.status}`);

    const aiResponse = await response.json();
    const parsed = JSON.parse(aiResponse.choices[0].message.content);

    return new Response(JSON.stringify({
      preEvaluation: text(parsed.preEvaluation),
      riskAreas: Array.isArray(parsed.riskAreas) ? parsed.riskAreas : [],
      focusAreas: Array.isArray(parsed.focusAreas) ? parsed.focusAreas : [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[biveyos-pre-evaluation] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Bilinmeyen hata" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
