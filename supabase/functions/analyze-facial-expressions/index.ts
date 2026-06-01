import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, handleAIError } from "../_shared/ai-client.ts";
import { normalizeEmotionAnalysis } from "../_shared/emotion-normalizer.ts";
import { getPrompt } from "../_shared/prompt-registry.ts";
import { logPromptUsage, renderPrompt } from "../_shared/prompt-renderer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sampleLatestFrames = (frames: string[], maxFrames = 4, sourceWindow = maxFrames * 3) => {
  const recentFrames = frames.slice(-Math.max(maxFrames, sourceWindow)).filter(Boolean);
  if (recentFrames.length <= maxFrames) return recentFrames;

  const step = (recentFrames.length - 1) / Math.max(1, maxFrames - 1);
  const selected = Array.from({ length: maxFrames }, (_, index) => recentFrames[Math.round(index * step)]);
  return Array.from(new Set(selected.filter(Boolean)));
};

const parseJsonContent = (content: string) => {
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch (error) {
    console.warn("[facial] JSON parse failed, returning low-confidence fallback", error);
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
      } catch {
        // Fall through to fallback.
      }
    }
    return {
      dominant_mood: "insufficient_evidence",
      average_confidence: "low",
      average_engagement: "insufficient_evidence",
      common_expressions: [],
      face_visibility: "unknown",
      gaze_evidence: "insufficient_evidence",
      eye_contact_confidence: "low",
      visual_commentary_confidence: "low",
      interpretation: "Model yanıtı JSON olarak çözümlenemedi; duygu yorumu düşük güvenle sınırlandırıldı.",
      observational_limits: ["Model JSON yanıtı çözümlenemedi.", "Frame kanıtı yeniden analiz gerektiriyor."],
    };
  }
};

type VisionContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { frames, participants } = await req.json();

    if (!frames || frames.length === 0) {
      return new Response(
        JSON.stringify({ error: "No frames provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const framesToAnalyze = sampleLatestFrames(frames, 4);

    const prompt = getPrompt("ANALYZE_FACIAL_EXPRESSIONS");
    const rendered = renderPrompt(prompt, {
      frameCount: framesToAnalyze.length,
      participants: Array.isArray(participants) ? participants.join(", ") : "Belirtilmedi",
    });
    logPromptUsage(rendered.metadata, {
      function: "analyze-facial-expressions",
      frameCount: framesToAnalyze.length,
    });

    const content: VisionContent[] = [
      {
        type: "text",
        text: `${rendered.systemPrompt}

KRİTİK KURALLAR:
- Yüz görünürlüğü, kameraya dönüklük ve göz teması aynı şey değildir.
- Kişinin yüze dönük görünmesi tek başına "yüksek göz teması" kanıtı sayılmaz.
- Gerçek gaze kanıtı zayıfsa eye_contact_confidence düşük olmalıdır.
- Mimik veya duygu hakkında yeterli veri yoksa "insufficient_evidence" kullan.
- Uydurma psikolojik yorum yapma, yalnızca gözlenebilir sinyalleri özetle.
- Pozitif/olumlu varsayılan yorum üretme; gözlem yetersizse rahat/iyi gibi yorumlama.
- Eğer frame kalitesi, yüz görünürlüğü, açı veya örnek sayısı zayıfsa bunu observational_limits içinde belirt.
- "nötr", "hafif gülümseme", "ağzı açık" gibi jenerik etiketleri yalnızca birden fazla frame'de tutarlıysa yaz.
- common_expressions en fazla 2 kısa gözlenebilir ifade içersin; zayıf kanıtta boş dizi döndür.
- FACS/Action Unit alanları kesin kodlama değil, gözlenebilir mimik ipucu olarak yazılmalı.
- FACS hint içinde observed_signal ve possible_interpretation alanlarını mutlaka doldur.
- Her yanıta decision_warning ekle: duygu sinyalleri işe alım kararında tek başına kullanılamaz.

${rendered.userPrompt}`
      },
      ...framesToAnalyze.map((frameData: string) => ({
        type: "image_url",
        image_url: { url: frameData }
      }))
    ];

    const response = await callAI({
      model: Deno.env.get("FACIAL_ANALYSIS_MODEL") || Deno.env.get("AI_VISION_MODEL") || "google/gemini-2.5-flash",
      messages: [{ role: "user", content }],
      temperature: 0.05,
      response_format: { type: "json_object" }
    });

    const errorResponse = handleAIError(response, corsHeaders);
    if (errorResponse) return errorResponse;

    if (!response.ok) {
      console.error("AI error:", response.status, await response.text());
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const analysis = parseJsonContent(aiResponse.choices?.[0]?.message?.content || "{}");
    const standardEmotion = normalizeEmotionAnalysis(analysis);

    const aggregatedAnalysis = {
      total_frames_analyzed: framesToAnalyze.length,
      dominant_mood: analysis.dominant_mood || "insufficient_evidence",
      average_confidence: analysis.average_confidence || "insufficient_evidence",
      average_engagement: analysis.average_engagement || "insufficient_evidence",
      common_expressions: Array.isArray(analysis.common_expressions)
        ? Array.from(new Set(analysis.common_expressions.map(String).map((item) => item.trim()).filter(Boolean))).slice(0, 2)
        : [],
      mood_progression: analysis.mood_progression || "insufficient_evidence",
      face_visibility: analysis.face_visibility || "medium",
      camera_facing: analysis.camera_facing || "medium",
      gaze_evidence: analysis.gaze_evidence || "insufficient_evidence",
      eye_contact_confidence: analysis.eye_contact_confidence || "low",
      visual_commentary_confidence: analysis.visual_commentary_confidence || "low",
      observational_limits: Array.isArray(analysis.observational_limits) ? analysis.observational_limits : [],
      dominant_signal: analysis.dominant_signal || standardEmotion.dominant_signal,
      camera_quality: analysis.camera_quality || standardEmotion.camera_quality,
      lighting_quality: analysis.lighting_quality || standardEmotion.lighting_quality,
      ekman_style_emotion: analysis.ekman_style_emotion || standardEmotion.ekman_style_emotion,
      facs_action_unit_hints: standardEmotion.facs_action_unit_hints,
      visual_evidence: standardEmotion.visual_evidence,
      decision_warning: standardEmotion.decision_warning,
      interpretation: analysis.interpretation || standardEmotion.interpretation,
      limitations: standardEmotion.limitations,
      standard_emotion: standardEmotion,
      provider_status: "internal_vision",
      prompt_metadata: rendered.metadata,
    };

    return new Response(
      JSON.stringify({ analysis: aggregatedAnalysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error analyzing facial expressions:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
