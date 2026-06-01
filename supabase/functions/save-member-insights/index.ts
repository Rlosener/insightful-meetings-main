import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, recordingId, participantsAnalysis } = await req.json();

    if (!userId || !recordingId || !participantsAnalysis) {
      return new Response(JSON.stringify({ error: "Missing data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
