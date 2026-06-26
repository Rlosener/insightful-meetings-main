import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { assertRecordingOwner, createServiceClient, jsonResponse, requireAuthenticatedUser } from "../_shared/auth.ts";
import { healthResponse, isHealthRequest, readJsonBody, supabaseChecks } from "../_shared/health.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await readJsonBody(req);
    if (isHealthRequest(body)) {
      return healthResponse("save-member-insights", supabaseChecks({ serviceRole: true }), corsHeaders);
    }

    const auth = await requireAuthenticatedUser(req, corsHeaders);
    if (!auth.ok) return auth.response;

    const { recordingId, participantsAnalysis } = body as Record<string, any>;
    const userId = auth.user.id;

    if (!recordingId || !participantsAnalysis) {
      return jsonResponse({ error: "Missing data" }, 400, corsHeaders);
    }

    const supabase = createServiceClient();
    const recordingOwner = await assertRecordingOwner(supabase, userId, corsHeaders, recordingId);
    if (!recordingOwner.ok) return recordingOwner.response;

    // Get all company members for this user
    const { data: members, error: membersError } = await supabase
      .from("company_members")
      .select("id, full_name")
      .eq("user_id", userId);

    if (membersError) throw membersError;
    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ matched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let matched = 0;

    for (const participant of participantsAnalysis) {
      const pName = (participant.name || "").toLowerCase().trim();
      
      // Find matching member by name (fuzzy)
      const member = members.find(m => {
        const mName = m.full_name.toLowerCase().trim();
        return mName === pName || 
               mName.includes(pName) || 
               pName.includes(mName) ||
               mName.split(" ").some((part: string) => pName.includes(part) && part.length > 2);
      });

      if (member) {
        const { error: insertError } = await supabase
          .from("member_meeting_insights")
          .upsert({
            user_id: userId,
            member_id: member.id,
            recording_id: recordingId,
            contribution_score: participant.contribution_score || null,
            communication_style: participant.communication_style || null,
            behavioral_insights: participant.behavioral_insights || null,
            strengths: participant.strengths || [],
            areas_for_improvement: participant.areas_for_improvement || [],
            mood: participant.mood || null,
            confidence_level: participant.confidence_level || null,
            engagement_level: participant.engagement_level || null,
          }, { onConflict: "member_id,recording_id" });

        if (!insertError) matched++;
      }
    }

    return new Response(JSON.stringify({ matched }), {
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
