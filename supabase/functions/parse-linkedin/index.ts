import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, handleAIError } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { linkedinUrl } = await req.json();
    if (!linkedinUrl) {
      return new Response(JSON.stringify({ error: "LinkedIn URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract username from LinkedIn URL for context
    const urlMatch = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
    const username = urlMatch ? urlMatch[1] : linkedinUrl;

    const systemPrompt = `You are an expert at analyzing LinkedIn profiles. Given a LinkedIn URL, generate a realistic and structured profile based on the username and URL pattern.

IMPORTANT: Respond ONLY with valid JSON, no markdown or extra text.

Since direct LinkedIn scraping is not available, generate a structured template that the user can then edit and correct. Use the username to make reasonable inferences about the person's background.

Generate this exact JSON structure:
{
  "full_name": "Inferred or formatted name from username",
  "headline": "Professional headline suggestion",
  "target_role": "Suggested target role",
  "summary": "A professional summary template the user can customize",
  "experience": [
    {"company": "", "role": "Suggested role title", "duration": "", "description": "Template description"}
  ],
  "education": [
    {"school": "", "degree": "", "field": "", "year": ""}
  ],
  "skills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "certifications": [],
  "projects": [],
  "events_trainings": [],
  "import_note": "Brief note about what was inferred vs what needs manual input"
}

Rules:
- Format the username into a readable name (e.g., "john-doe" -> "John Doe")
- Suggest 5-8 relevant skills based on common career paths
- Keep experience and education as editable templates
- All text content in Turkish
- Be helpful but honest that this is a template to be refined`;

    const response = await callAI({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `LinkedIn URL: ${linkedinUrl}\nUsername: ${username}\n\nGenerate a structured profile template.` },
      ],
      temperature: 0.3,
      model: "google/gemini-2.5-flash-lite",
    });

    const errorResponse = handleAIError(response, corsHeaders);
    if (errorResponse) return errorResponse;

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const profile = JSON.parse(content);

    return new Response(JSON.stringify(profile), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("parse-linkedin error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Bilinmeyen hata" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
