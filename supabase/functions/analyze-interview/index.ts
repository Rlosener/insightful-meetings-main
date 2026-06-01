import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, parseAIResponse } from "../_shared/ai-client.ts";
import { buildProperNounGlossary, detectEntities, fetchControlledPublicContext, normalizeTranscriptWithEntities } from "../_shared/b2b-intelligence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_TRANSCRIPT_LENGTH = 50;
const MAX_TRANSCRIPT_LENGTH = 80000;
const SYNTHETIC_TRANSCRIPT_PATTERNS = [
  /\[isim soyisim\]/i,
  /\[şirket adı\]/i,
  /\[üniversite adı\]/i,
  /\[bölüm adı\]/i,
  /\[pozisyon adı\]/i,
];

const hasSyntheticTranscriptPatterns = (transcript: string) =>
  SYNTHETIC_TRANSCRIPT_PATTERNS.some((pattern) => pattern.test(transcript));

// ── Build context strings from recordingInfo ──────────────────────────
function buildInterviewContext(info: any): string {
  const lines: string[] = [];
  if (info.position) lines.push(`Pozisyon: ${info.position}`);
  if (info.department) lines.push(`Departman: ${info.department}`);
  if (info.seniorityLevel) lines.push(`Kıdem: ${info.seniorityLevel}`);
  if (info.candidateName) lines.push(`Aday: ${info.candidateName}`);
  if (info.candidateSummary) lines.push(`Aday Özeti: ${info.candidateSummary}`);
  if (info.requiredSkills?.length) lines.push(`Aranan Beceriler: ${info.requiredSkills.join(", ")}`);
  if (info.evaluationCriteria?.length) lines.push(`Değerlendirme Kriterleri: ${info.evaluationCriteria.join(", ")}`);
  if (info.interviewNotes) lines.push(`Görüşme Notları: ${info.interviewNotes}`);
  if (info.customQuestions?.length) {
    lines.push(`\nReferans Sorular:`);
    info.customQuestions.forEach((q: string, i: number) => lines.push(`${i + 1}. ${q}`));
  }
  // Legacy fields
  if (info.candidateSurname) lines.push(`Aday Soyadı: ${info.candidateSurname}`);
  if (info.candidateCurrentRole) lines.push(`Mevcut Rol: ${info.candidateCurrentRole}`);
  if (info.candidateExperience) lines.push(`Deneyim: ${info.candidateExperience}`);
  if (info.experienceYears) lines.push(`Deneyim Yılı: ${info.experienceYears}`);
  return lines.join("\n");
}

function buildMeetingContext(info: any): string {
  const lines: string[] = [];
  if (info.meetingTopic) lines.push(`Konu: ${info.meetingTopic}`);
  if (info.meetingPurpose) lines.push(`Amaç: ${info.meetingPurpose}`);
  if (info.meetingAgenda || info.agenda) lines.push(`Gündem: ${info.meetingAgenda || info.agenda}`);
  if (info.expectedOutcomes) lines.push(`Beklenen Çıktılar: ${info.expectedOutcomes}`);
  if (info.decisionTopics) lines.push(`Karar Başlıkları: ${info.decisionTopics}`);
  if (info.participants?.length) lines.push(`Katılımcılar: ${info.participants.join(", ")}`);
  if (info.additionalNotes) lines.push(`Ek Notlar: ${info.additionalNotes}`);
  return lines.join("\n");
}

type EvidenceConfidence = "low" | "medium" | "high";
type EvidenceLevel = "insufficient_evidence" | "weak" | "moderate" | "strong";
type ScriptSuspicion = "low" | "medium" | "high" | "insufficient_evidence";

const FILLER_PATTERNS = [
  /\bşey\b/gi,
  /\byani\b/gi,
  /\bıı+\b/gi,
  /\bee+\b/gi,
  /\bhmm+\b/gi,
  /\baslında\b/gi,
  /\bşöyle\b/gi,
  /\bdaha doğrusu\b/gi,
];

const EXAMPLE_PATTERNS = [
  /\börneğin\b/gi,
  /\bmesela\b/gi,
  /\börnek\b/gi,
  /\bgeçen\b/gi,
  /\bbir projede\b/gi,
  /\bbir durumda\b/gi,
  /\bhatırladığım kadarıyla\b/gi,
];

const clampScore = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

const countPatternHits = (text: string, patterns: RegExp[]) =>
  patterns.reduce((total, pattern) => total + (text.match(pattern)?.length || 0), 0);

function analyzeTranscriptDelivery(transcript: string) {
  const normalized = transcript.toLowerCase();
  const words = normalized.match(/\p{L}+/gu) || [];
  const wordCount = words.length;
  const sentences = transcript
    .split(/[.!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  const sentenceLengths = sentences.map((sentence) => (sentence.match(/\p{L}+/gu) || []).length).filter(Boolean);
  const avgSentenceLength = sentenceLengths.length
    ? sentenceLengths.reduce((sum, value) => sum + value, 0) / sentenceLengths.length
    : 0;
  const sentenceVariance = sentenceLengths.length
    ? sentenceLengths.reduce((sum, value) => sum + Math.pow(value - avgSentenceLength, 2), 0) / sentenceLengths.length
    : 0;
  const sentenceStdDev = Math.sqrt(sentenceVariance);
  const fillerCount = countPatternHits(normalized, FILLER_PATTERNS);
  const exampleCount = countPatternHits(normalized, EXAMPLE_PATTERNS);
  const hesitationCount = fillerCount + (normalized.match(/\.{3}|--|—/g)?.length || 0);
  const repeatedLeadIns = normalized.match(/\b(bence|aslında|yani|şöyle)\b/gi)?.length || 0;
  const fillerRate = wordCount > 0 ? fillerCount / wordCount : 0;

  let spontaneityProxy = 52;
  if (exampleCount >= 2) spontaneityProxy += 10;
  if (sentenceStdDev >= 6) spontaneityProxy += 8;
  if (hesitationCount >= 1 && hesitationCount <= 8) spontaneityProxy += 4;
  if (avgSentenceLength > 24 && sentenceStdDev < 5) spontaneityProxy -= 12;
  if (fillerRate > 0.08) spontaneityProxy -= 10;
  if (repeatedLeadIns > 6) spontaneityProxy -= 6;

  const spontaneityConfidence: EvidenceConfidence =
    wordCount < 80 ? "low" : wordCount < 180 ? "medium" : "high";

  return {
    wordCount,
    avgSentenceLength,
    sentenceStdDev,
    fillerCount,
    fillerRate,
    exampleCount,
    hesitationCount,
    repeatedLeadIns,
    spontaneityProxy: clampScore(spontaneityProxy, 25, 85),
    spontaneityConfidence,
  };
}

function calibrateScriptReading(
  deliverySignals: ReturnType<typeof analyzeTranscriptDelivery>,
  facialAnalysis: any,
): { suspicion: ScriptSuspicion; naturalDeliveryScore: number; notes: string[] } {
  const notes: string[] = [];
  const gazeEvidence: EvidenceLevel = facialAnalysis?.gaze_evidence || "insufficient_evidence";
  const cameraFacing: string = facialAnalysis?.camera_facing || "medium";

  if (deliverySignals.wordCount < 80) {
    return {
      suspicion: "insufficient_evidence",
      naturalDeliveryScore: clampScore(50, 30, 75),
      notes: ["Teslim biçimini okumaya bağlamak için yeterli transkript verisi yok."],
    };
  }

  let suspicionScore = 0;
  if (deliverySignals.avgSentenceLength > 24 && deliverySignals.sentenceStdDev < 5) {
    suspicionScore += 2;
    notes.push("Cümleler uzun ve ritim aşırı düzenli görünüyor.");
  }
  if (deliverySignals.exampleCount === 0) {
    suspicionScore += 1;
    notes.push("Spontane örnek veya somut vaka referansı zayıf.");
  }
  if (deliverySignals.hesitationCount === 0) {
    suspicionScore += 1;
    notes.push("Doğal duraksama izleri sınırlı.");
  }
  if ((gazeEvidence === "weak" || gazeEvidence === "insufficient_evidence") && cameraFacing === "high") {
    suspicionScore += 2;
    notes.push("Kameraya dönüklük yüksek olsa da gerçek gaze kanıtı zayıf.");
  }
  if (deliverySignals.spontaneityProxy < 45) {
    suspicionScore += 1;
  }

  const suspicion: ScriptSuspicion =
    suspicionScore >= 5 ? "high" :
    suspicionScore >= 3 ? "medium" :
    "low";

  let naturalDeliveryScore = 68;
  naturalDeliveryScore += deliverySignals.exampleCount >= 2 ? 6 : 0;
  naturalDeliveryScore += deliverySignals.sentenceStdDev >= 6 ? 5 : 0;
  naturalDeliveryScore -= suspicion === "high" ? 18 : suspicion === "medium" ? 10 : 0;
  naturalDeliveryScore -= deliverySignals.fillerRate > 0.08 ? 8 : 0;
  naturalDeliveryScore -= deliverySignals.repeatedLeadIns > 6 ? 5 : 0;

  return {
    suspicion,
    naturalDeliveryScore: clampScore(naturalDeliveryScore, 30, 84),
    notes,
  };
}

function calibrateBehavioralOutput(
  analysis: any,
  transcript: string,
  facialAnalysis: any,
  options: { isTranscriptOnly: boolean; isAudioOnly: boolean; isInterview: boolean },
) {
  const calibrated = { ...analysis };
  const deliverySignals = analyzeTranscriptDelivery(transcript);
  const scriptSignals = calibrateScriptReading(deliverySignals, facialAnalysis);
  const visualConfidence: EvidenceConfidence =
    facialAnalysis?.eye_contact_confidence || facialAnalysis?.visual_commentary_confidence || "low";
  const gazeEvidence: EvidenceLevel = facialAnalysis?.gaze_evidence || "insufficient_evidence";
  const faceVisibility: string = facialAnalysis?.face_visibility || "medium";
  const cameraFacing: string = facialAnalysis?.camera_facing || "medium";

  if (!calibrated.visual_analysis && !options.isTranscriptOnly && !options.isAudioOnly) {
    calibrated.visual_analysis = {};
  }

  if (calibrated.visual_analysis) {
    const rawEyeContact = calibrated.visual_analysis.eye_contact;
    let eyeContact = rawEyeContact;

    if (!facialAnalysis || faceVisibility === "low" || gazeEvidence === "insufficient_evidence") {
      eyeContact = "insufficient_evidence";
    } else if (gazeEvidence === "weak" && rawEyeContact === "high") {
      eyeContact = "medium";
    } else if (scriptSignals.suspicion === "high" && rawEyeContact === "high") {
      eyeContact = "medium";
    }

    calibrated.visual_analysis = {
      ...calibrated.visual_analysis,
      eye_contact: eyeContact || "insufficient_evidence",
      eye_contact_confidence: visualConfidence,
      camera_facing: cameraFacing,
      gaze_evidence: gazeEvidence,
      script_reading_suspicion: scriptSignals.suspicion,
      natural_delivery_score: scriptSignals.naturalDeliveryScore,
      spontaneity_proxy: deliverySignals.spontaneityProxy,
      delivery_authenticity_notes: scriptSignals.notes.join(" "),
      confidence: visualConfidence,
    };

    if (eyeContact === "insufficient_evidence") {
      calibrated.visual_analysis.eye_contact_description =
        "Gaze kanıtı yetersiz olduğu için yüzün kameraya dönük olması tek başına göz teması olarak puanlanmadı.";
    } else if (gazeEvidence === "weak") {
      calibrated.visual_analysis.eye_contact_description =
        "Kamera yönelimi gözlense de gerçek gaze kanıtı zayıf olduğu için göz teması temkinli değerlendirildi.";
    } else if (scriptSignals.suspicion === "high") {
      calibrated.visual_analysis.eye_contact_description =
        "Bakış düzeni görece sabit olsa da teslim akışı okuma şüphesini artırdığı için eye contact skoru sınırlı tutuldu.";
    }

    if (!facialAnalysis || facialAnalysis.visual_commentary_confidence === "low") {
      calibrated.visual_analysis.engagement_description =
        "Görsel kanıt sınırlı; katılım yorumu temkinli tutuldu.";
      calibrated.visual_analysis.presence_description =
        calibrated.visual_analysis.presence_description || "Görsel veri sınırlı.";
      calibrated.visual_analysis.attention_description =
        "Dikkat tutarlılığı için görsel kanıt yetersiz.";
    } else if (scriptSignals.suspicion === "medium" || scriptSignals.suspicion === "high") {
      calibrated.visual_analysis.attention_description =
        "Dikkat yorumu, düzenli bakış paterni ile teslim akışı birlikte değerlendirilerek temkinli kuruldu.";
    }
  }

  calibrated.behavioral_profile = {
    ...(calibrated.behavioral_profile || {}),
    eye_contact_confidence: visualConfidence,
    script_reading_suspicion: scriptSignals.suspicion,
    natural_delivery_score: scriptSignals.naturalDeliveryScore,
    spontaneity_proxy: deliverySignals.spontaneityProxy,
    delivery_authenticity_notes: scriptSignals.notes.join(" "),
    confidence: deliverySignals.spontaneityConfidence,
  };

  calibrated.behavioral_interpretation =
    visualConfidence === "low"
      ? "Davranışsal yorum, sınırlı görsel kanıt ve transcript akışı birlikte değerlendirilerek temkinli tutuldu."
      : scriptSignals.suspicion === "high"
      ? "Teslim akışı düzenli ancak spontane örnek ve doğal kırılmalar sınırlı; bu nedenle okuma/teleprompter şüphesi kesin yargıya dönüştürülmeden not edildi."
      : calibrated.behavioral_interpretation;

  if (options.isInterview) {
    calibrated.eye_contact_confidence = visualConfidence;
    calibrated.script_reading_suspicion = scriptSignals.suspicion;
    calibrated.natural_delivery_score = scriptSignals.naturalDeliveryScore;
    calibrated.spontaneity_proxy = deliverySignals.spontaneityProxy;
    calibrated.delivery_authenticity_notes = scriptSignals.notes.join(" ");
  }

  calibrated.data_quality = {
    ...(calibrated.data_quality || {}),
    transcript_delivery_confidence: deliverySignals.spontaneityConfidence,
  };

  return calibrated;
}

const SHALLOW_PATTERNS = [
  /genel olarak/gi,
  /daha iyi ifade edebil/i,
  /iletişimi iyiydi/gi,
  /biraz daha geliştir/i,
  /kendini geliştirebilir/gi,
  /iyi bir izlenim/gi,
  /fena değil/gi,
];

const dedupeStrings = (items: string[] = []) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const tightenInsightList = (items: any, maxItems = 4) =>
  dedupeStrings((Array.isArray(items) ? items : []).filter((item) =>
    typeof item === "string" &&
    item.trim().length > 20 &&
    !SHALLOW_PATTERNS.some((pattern) => pattern.test(item))
  )).slice(0, maxItems);

function tightenAnalysisOutput(analysis: any, isInterview: boolean) {
  const tightened = { ...analysis };

  tightened.top_insights = tightenInsightList(tightened.top_insights, 3);
  tightened.critical_3_insights = tightenInsightList(tightened.critical_3_insights, 3);
  tightened.strengths = tightenInsightList(tightened.strengths, 4);
  tightened.weaknesses = tightenInsightList(tightened.weaknesses, 4);
  tightened.risk_areas = tightenInsightList(tightened.risk_areas, 4);
  tightened.strongest_evidence_backed_strengths = tightenInsightList(tightened.strongest_evidence_backed_strengths, 4);
  tightened.highest_risk_concerns = tightenInsightList(tightened.highest_risk_concerns, 4);
  tightened.follow_up_questions = tightenInsightList(tightened.follow_up_questions, 4);
  tightened.recommendations = tightenInsightList(tightened.recommendations, isInterview ? 4 : 5);
  tightened.follow_up_recommendations = tightenInsightList(tightened.follow_up_recommendations, 4);
  tightened.next_step_recommendations = tightenInsightList(tightened.next_step_recommendations, 4);
  tightened.unresolved_topics = tightenInsightList(tightened.unresolved_topics, 4);
  tightened.unresolved_issues = tightenInsightList(tightened.unresolved_issues, 4);

  if (tightened.facial_analysis?.common_expressions) {
    tightened.facial_analysis.common_expressions = dedupeStrings(tightened.facial_analysis.common_expressions)
      .filter((item) => !/ağzı açık|hafif gülümseme|nötr/gi.test(item))
      .slice(0, 2);
  }

  if (tightened.visual_analysis?.confidence === "low") {
    tightened.visual_analysis.eye_contact_description =
      tightened.visual_analysis.eye_contact_description || "Görsel kanıt sınırlı olduğu için göz teması yorumu temkinli tutuldu.";
    tightened.visual_analysis.engagement_description =
      "Tekrarlayan mimik varsayımları yerine gözlenebilir kanıtlarla sınırlı yorum yapıldı.";
  }

  if (isInterview && tightened.executive_summary?.overall_evaluation) {
    tightened.executive_summary.overall_evaluation = tightened.executive_summary.overall_evaluation
      .replace(/Genel olarak/gi, "")
      .trim();
  }

  return tightened;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transcript, recordingInfo, facialAnalysis, behavioralAnalysis, interviewQuestions } = await req.json();

    // ── CREDIT PROTECTION: Validate transcript ──
    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "Transcript gereklidir. Transkript olmadan analiz yapılamaz." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const trimmedTranscript = transcript.trim();
    if (hasSyntheticTranscriptPatterns(trimmedTranscript)) {
      return new Response(JSON.stringify({ error: "Transcript doğrulanamadı. Placeholder/örnek içerik tespit edildiği için analiz durduruldu." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (trimmedTranscript.length < MIN_TRANSCRIPT_LENGTH) {
      return new Response(JSON.stringify({ error: `Transkript çok kısa (${trimmedTranscript.length} karakter). En az ${MIN_TRANSCRIPT_LENGTH} karakter gerekli.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const detectedEntities = detectEntities(recordingInfo || {}, interviewQuestions || []);
    const normalizedTranscript = normalizeTranscriptWithEntities(trimmedTranscript, recordingInfo || {}, interviewQuestions || []);
    const properNounGlossary = buildProperNounGlossary(recordingInfo || {}, interviewQuestions || []);
    const publicContext = await fetchControlledPublicContext(recordingInfo || {});
    const transcriptForAnalysis = normalizedTranscript.transcript;
    const safeTranscript = transcriptForAnalysis.length > MAX_TRANSCRIPT_LENGTH
      ? transcriptForAnalysis.substring(0, MAX_TRANSCRIPT_LENGTH) + "\n\n[... transkriptin geri kalanı kırpıldı ...]"
      : transcriptForAnalysis;

    const isInterview = recordingInfo?.type === "mülakat";
    const isBehavioralEnabled = behavioralAnalysis !== false && (behavioralAnalysis === true || isInterview);
    const sourceType = recordingInfo?.sourceType || "upload_video";
    const isTranscriptOnly = sourceType === "upload_transcript";
    const isAudioOnly = sourceType === "upload_audio";

    const localEmotionObservation = facialAnalysis?.local_emotion_observation;
    const localEmotionCtx = localEmotionObservation
      ? `\nYerel Ortalama Duygu Yorumu: ${localEmotionObservation.label || "Veri sınırlı"}\nYerel Yorum Notu: ${localEmotionObservation.note || "Yeterli örnek yok."}\nYerel Dikkat Notu: ${localEmotionObservation.attention || "Tek başına karar ölçütü olarak kullanılmamalı."}\nYerel Örnek Sayısı: ${localEmotionObservation.total || 0}`
      : "";
    const facialCtx = facialAnalysis
      ? `\n[MİMİK ANALİZİ VERİLERİ]\nBaskın Duygu: ${facialAnalysis.dominant_mood}\nGüven Seviyesi: ${facialAnalysis.average_confidence}\nKatılım: ${facialAnalysis.average_engagement}\nSık İfadeler: ${(facialAnalysis.common_expressions || []).join(", ")}\nDuygu Seyri: ${facialAnalysis.mood_progression || "Belirsiz"}${localEmotionCtx}`
      : "";

    const properNounCtx = properNounGlossary.length > 0
      ? `\n[PROPER NOUN GLOSSARY]\n${properNounGlossary.join(", ")}\nÖNEMLİ: Bu özel isimleri koru. Benzer yazılan yakın eşleşmeleri normalize edebilirsin ama transcriptte olmayan yeni içerik ekleme.`
      : "";

    const publicContextCtx = publicContext.items.length > 0
      ? `\n[KONTROLLÜ PUBLIC CONTEXT]\n${publicContext.items.map((item) => `- ${item.entity}: ${item.summary} (Kaynak: ${item.source})`).join("\n")}\nÖNEMLİ: Bu bağlam sadece değerlendirme perspektifi içindir. Transkriptte söylenmeyen hiçbir şeyi söylenmiş gibi yazma.`
      : "";

    const questionsCtx = interviewQuestions?.length > 0
      ? `\n[MÜLAKAT SORULARI]\n${interviewQuestions.map((q: any, i: number) => `${i + 1}. [${q.category}] ${q.question}`).join("\n")}`
      : "";

    // ── ANTI-HALLUCINATION GUARDRAILS ──
    const evidenceWarning = `
KRİTİK KURALLAR - MUTLAKA UYULMALIDIR:
1. HALLUCINATION KESİNLİKLE YASAK: Transkriptte GEÇMEYEN hiçbir bilgi, konu, deneyim, olay, beceri veya örneği UYDURMA. Transkriptte ne yazıyorsa YALNIZCA ondan analiz yap.
2. Her bulgu, skor ve yorum için transkriptten doğrudan alıntı veya referans VER. Alıntısız bulgu YAZMA.
3. Transkriptte bahsedilmeyen konularda yorum YAPMA. "yetersiz veri" veya "insufficient_evidence" yaz.
4. ${isTranscriptOnly ? 'Bu bir METIN transkript dosyası. Ses/görsel analiz verileri YOK. voice_analysis ve visual_analysis alanlarını null yap.' : isAudioOnly ? 'Bu bir SES dosyası. Görsel veri YOK. visual_analysis alanını null yap.' : 'Ses ve görsel veriler mevcut olabilir.'}
5. inference_type her alanda ZORUNLU: "direct_transcript_evidence" | "linguistic_inference" | "acoustic_signal_inference" | "insufficient_evidence"
6. Generic/şablon cümleler KESİNLİKLE YASAK. "Genel olarak iyi" veya "Kendinizi daha iyi ifade edebilirsiniz" gibi boş ifadeler KULLANMA.
7. Her skor için: (a) neden bu skor verildi, (b) transkriptten hangi cümle/bölüm bunu destekliyor, (c) nasıl geliştirilebilir açıkla.
8. Gerçekçi puanlama: 85+ çok nadir. Çoğu kişi 50-75 bandında.
9. Eğer transkript kısa veya düşük kaliteli ise bunu açıkça belirt ve skorları düşük güvenle ver.
10. TRANSCRIPT DIŞINDAKİ HİÇBİR BİLGİYİ RAPORA KOYMA. Sadece ve sadece aşağıdaki transkripti analiz et.
11. Yüz görünürlüğü, kameraya dönüklük ve göz teması aynı şey değildir. Gerçek gaze kanıtı zayıfsa yüksek eye contact verme.
12. Ekrandan okuma / teleprompter şüphesi varsa bunu kesin yargı gibi değil, "suspicion" olarak ve düşük/orta güvenle ifade et.
13. Görsel kanıt zayıfsa emotion/mimik yorumlarında insufficient_evidence veya not_available kullan.
14. Pozitif/olumlu varsayılan yorum üretme; yorumlar gerçekçi, ölçülü ve kanıt ağırlıklı olsun. Kanıt yoksa "yetersiz veri" yaz.`;

    let systemPrompt: string;
    let userPrompt: string;

    if (isInterview) {
      // ── MÜLAKAT ANALİZİ ──
      const contextBlock = buildInterviewContext(recordingInfo || {});
      const hasContext = contextBlock.length > 20;

      systemPrompt = `Sen Donebird platformu için çalışan uzman bir mülakat analisti ve davranışsal değerlendirme koçusun.

GÖREV: Aşağıdaki mülakat transkriptini derinlemesine analiz et ve yapılandırılmış bir değerlendirme raporu üret.

${hasContext ? `[MÜLAKAT BAĞLAMI]
${contextBlock}

ÖNEMLİ: Yukarıdaki bağlam bilgilerini analiz çerçevesi olarak kullan. Adayın cevaplarını bu pozisyon, departman ve yetkinlik beklentileri açısından değerlendir. ANCAK bağlamda verilen bilgileri transkriptte geçmiyormuş gibi rapora koyma. Bağlam sadece değerlendirme perspektifini belirler.` : ''}

${properNounCtx}${publicContextCtx}${evidenceWarning}

RAPOR YAKLAŞIMI:
- Yüzeysel "iletişim iyiydi" tipi boş değerlendirmeler YAPMA
- Her bulgu için transkriptten somut alıntı ve kanıt göster
- İşe alım kararını doğrudan etkileyecek net öneriler ver
- Risk alanlarını somut örneklerle açıkla
- Kanıtlı güçlü yönleri spesifik cevap örnekleriyle destekle
- Adayı olduğundan iyi gösteren pozitif/olumlu dil kullanma; güçlü yönleri de sınırlılıklarıyla birlikte yaz
- Takip soruları ve ikinci görüşme önerileri sun
- Public context varsa bunu yalnızca program/kurum/sektör fit perspektifi için kullan
- Genel geçer tavsiye yazma; her ana yorumda transcript veya behavioral evidence dayanağı olsun
- Aynı anlamı tekrar eden 2 cümle yazma; az ama kanıtlı içgörü üret
- Behavioral yorumlarda "nötr", "hafif gülümseme", "ağzı açık" gibi jenerik tekrarları azalt
${hasContext && recordingInfo.evaluationCriteria?.length ? `- Özellikle şu kriterleri değerlendir: ${recordingInfo.evaluationCriteria.join(", ")}` : ''}

Türkçe JSON döndür. Markdown veya açıklama ekleme.`;

      const behavioralFields = isBehavioralEnabled && !isTranscriptOnly ? `,
  "behavioral_profile": {
    "confidence_level": "string (yüksek/orta/düşük + kanıt cümlesi)",
    "stress_management": "string (gözlem + kanıt)",
    "communication_patterns": ["string"],
    "emotional_indicators": ["string"],
    "leadership_signals": "string",
    "adaptability": "string",
    "eye_contact_confidence": "low|medium|high",
    "script_reading_suspicion": "low|medium|high|insufficient_evidence",
    "natural_delivery_score": number,
    "spontaneity_proxy": number,
    "delivery_authenticity_notes": "string",
    "confidence": "low|medium|high",
    "inference_type": "linguistic_inference"
  },
  "voice_analysis": {
    "tone": "confident|neutral|nervous",
    "tone_description": "string",
    "speech_speed": "slow|normal|fast",
    "hesitation_level": "low|medium|high",
    "filler_words_usage": "low|medium|high",
    "energy_level": "low|medium|high",
    "voice_score": number,
    "inference_type": "${isAudioOnly ? 'acoustic_signal_inference' : 'linguistic_inference'}"
  },
  "visual_analysis": ${isTranscriptOnly || isAudioOnly ? 'null' : `{
    "eye_contact": "low|medium|high|insufficient_evidence",
    "eye_contact_confidence": "low|medium|high",
    "camera_facing": "low|medium|high",
    "gaze_evidence": "insufficient_evidence|weak|moderate|strong",
    "script_reading_suspicion": "low|medium|high|insufficient_evidence",
    "natural_delivery_score": number,
    "spontaneity_proxy": number,
    "delivery_authenticity_notes": "string",
    "confidence": "low|medium|high",
    "engagement_level": "low|medium|high|insufficient_evidence",
    "presence": "active|inactive",
    "visual_score": number,
    "inference_type": "acoustic_signal_inference|insufficient_evidence"
  }`},
  "behavior_score": number,
  "eye_contact_confidence": "low|medium|high",
  "script_reading_suspicion": "low|medium|high|insufficient_evidence",
  "natural_delivery_score": number,
  "spontaneity_proxy": number,
  "delivery_authenticity_notes": "string",
  "behavioral_interpretation": "string (transkriptten kanıtla)"` : "";

      userPrompt = `${properNounCtx}${publicContextCtx}${facialCtx}${questionsCtx}

[TRANSKRİPT BAŞLANGIÇ]
${safeTranscript}
[TRANSKRİPT BİTİŞ]

UYARI: Yukarıdaki transkriptin dışında HİÇBİR bilgi KULLANMA. Sadece transkriptte geçen konuları analiz et.

JSON şeması:
{
  "top_insights": ["string (tam olarak en kritik 3 bulgu, her birinde transkriptten alıntı)"],
  "executive_summary": {
    "overall_evaluation": "string (3-4 cümle, transkriptten somut gözlemlerle)",
    "key_strength": "string (transkriptten alıntıyla)",
    "key_risk": "string (transkriptten alıntıyla)",
    "final_recommendation": "string (net işe alım önerisi)",
    "second_interview_recommendation": "string|null (ikinci görüşme önerisi varsa)"
  },
  "critical_3_insights": ["string (en kritik 3 karar verdirici içgörü, kanıtla)"],
  "content_analysis": {
    "relevance": {"score": number, "description": "string", "evidence": "transkriptten alıntı", "inference_type": "direct_transcript_evidence"},
    "specificity": {"score": number, "description": "string", "evidence": "string", "inference_type": "direct_transcript_evidence"},
    "depth": {"score": number, "description": "string", "evidence": "string", "inference_type": "direct_transcript_evidence"},
    "logical_flow": {"score": number, "description": "string", "evidence": "string", "inference_type": "direct_transcript_evidence"},
    "examples_given": {"score": number, "description": "string", "evidence": "string", "inference_type": "direct_transcript_evidence"},
    "problem_solving": {"score": number, "description": "string", "evidence": "string", "inference_type": "direct_transcript_evidence"},
    "repetition_level": "low|medium|high",
    "filler_usage": "low|medium|high"
  },
  "communication_analysis": {
    "clarity": {"score": number, "description": "string", "evidence": "string", "inference_type": "direct_transcript_evidence"},
    "fluency": {"score": number, "description": "string", "evidence": "string", "inference_type": "linguistic_inference"},
    "confidence": {"score": number, "description": "string", "evidence": "string", "inference_type": "linguistic_inference"},
    "professional_tone": {"score": number, "description": "string", "evidence": "string", "inference_type": "linguistic_inference"},
    "persuasion": {"score": number, "description": "string", "evidence": "string", "inference_type": "linguistic_inference"},
    "structure_quality": {"score": number, "description": "string", "evidence": "string", "inference_type": "direct_transcript_evidence"},
    "expressiveness": {"score": number, "description": "string", "evidence": "string", "inference_type": "linguistic_inference"},
    "communication_style": "string (analitik/empatik/direktif/anlatımcı)"
  },
  "role_fit_analysis": {
    "overall_fit": number,
    "fit_assessment": "string (pozisyona uyum değerlendirmesi, somut kanıtlarla)",
    "technical_alignment": "string (teknik/fonksiyonel yeterlilik sinyalleri)",
    "culture_alignment": "string (kültür uyumu sinyalleri)",
    "growth_potential": "string (gelişim potansiyeli)",
    "inference_type": "direct_transcript_evidence"
  },
  "program_fit_analysis": {
    "program_or_company_context": "string (public context varsa belirt, yoksa insufficient_evidence)",
    "sector_fit": "string (savunma/AI/dual-use vb. bağlama göre temkinli değerlendirme)",
    "fit_rationale": "string (transkript ve public context ayrımını koruyarak)"
  },
  "scores": {
    "relevance_score": {"value": number, "reason": "string", "evidence": "transkriptten alıntı", "improvement": "string"},
    "clarity_score": {"value": number, "reason": "string", "evidence": "string", "improvement": "string"},
    "confidence_score": {"value": number, "reason": "string", "evidence": "string", "improvement": "string"},
    "communication_score": {"value": number, "reason": "string", "evidence": "string", "improvement": "string"},
    "structure_score": {"value": number, "reason": "string", "evidence": "string", "improvement": "string"},
    "behavioral_impression_score": {"value": number, "reason": "string", "evidence": "string", "improvement": "string"}
  },
  "overall_score": number,
  "position_fit": number,
  "communication_clarity": number,
  "confidence_level": number,
  "structured_thinking": number,
  "answer_relevance": number,
  "answer_depth": number,
  "consistency": number,
  "problem_solving_signals": number,
  "leadership_signals": number,
  "creativity_signals": number,
  "engagement_score": number,
  "hesitation_level": "string",
  "filler_words_level": "string",
  "categories": {
    "technical_skills": {"score": number, "description": "string (transkriptten kanıtla)", "strengths": ["string"], "weaknesses": ["string"]},
    "communication": {"score": number, "description": "string", "strengths": ["string"], "weaknesses": ["string"]},
    "problem_solving": {"score": number, "description": "string", "strengths": ["string"], "weaknesses": ["string"]},
    "cultural_fit": {"score": number, "description": "string", "strengths": ["string"], "weaknesses": ["string"]}
  },
  "strengths": ["string (somut gözlem + transkriptten alıntı, kanıtı en net olan 3-4 adet)"],
  "weaknesses": ["string (somut gözlem + transkriptten alıntı, en kritik 3-4 adet)"],
  "risk_areas": ["string (net risk + kanıt, 3-5 adet)"],
  "strongest_evidence_backed_strengths": ["string (kanıtı en net güçlü yön + transcript kanıtı)"],
  "highest_risk_concerns": ["string (kararı etkileyen en yüksek riskler, alıntıyla)"],
  "hiring_recommendation": {
    "decision": "strongly_recommend|recommend|consider|not_recommend",
    "confidence": number,
    "summary": "string (transkriptten kanıtlarla)",
    "conditions": ["string"],
    "follow_up_questions": ["string (ikinci görüşmede sorulması önerilen 3-5 soru)"]
  },
  "critical_moments": [
    {
      "timestamp_hint": "string (başlangıç/orta/son)",
      "description": "string (ne oldu)",
      "significance": "string (neden önemli)",
      "transcript_excerpt": "string (ilgili alıntı)",
      "impact": "positive|negative|neutral"
    }
  ],
  "important_moments": [
    {
      "moment": "string",
      "why_it_matters": "string",
      "transcript_excerpt": "string",
      "impact": "positive|negative|neutral"
    }
  ],
  "answer_by_answer": [
    {
      "question": "string",
      "answer_summary": "string",
      "quality_score": number,
      "clarity_score": number,
      "depth_score": number,
      "relevance_score": number,
      "communication_score": number,
      "observed_behavior": "string",
      "communication_pattern": "string",
      "interviewer_perception": "string",
      "ai_feedback": "string",
      "suggested_improvement": "string",
      "transcript_excerpt": "string (cevaptan kısa alıntı)",
      "inference_type": "direct_transcript_evidence"
    }
  ],
  "speech_insights": [{"type": "string", "title": "string", "description": "string", "severity": "info|warning|success"}],
  "follow_up_questions": ["string (karar vermek için sorulması gereken net sorular)"],
  "improvement_plan": [
    {"area": "string", "current_level": "string", "target": "string", "action": "string (somut ve uygulanabilir)", "priority": "high|medium|low"}
  ],
  "summary": "string (max 100 kelime, transkriptten somut bulgular)",
  "interview_summary": "string (max 150 kelime)",
  "recommendations": ["string (aksiyon odaklı, 3-5 adet)"],
  "general_comment": "string (max 200 kelime, transkriptten referanslarla)"${behavioralFields},
  "data_quality": {
    "transcript_available": true,
    "transcript_length": ${safeTranscript.length},
    "audio_analysis_available": ${!isTranscriptOnly},
    "visual_analysis_available": ${!isTranscriptOnly && !isAudioOnly && !!facialAnalysis},
    "context_provided": ${contextBlock.length > 20},
    "public_context_used": ${publicContext.items.length > 0},
    "overall_confidence": "${safeTranscript.length < 500 ? 'low' : isTranscriptOnly ? 'medium' : 'high'}",
    "limitations": ["${isTranscriptOnly ? 'Yalnızca metin transkript. Ses ve görsel analiz yapılamadı.' : isAudioOnly ? 'Yalnızca ses dosyası. Görsel analiz yapılamadı.' : ''}"]
  },
  "biveyos_enabled": ${isBehavioralEnabled && !isTranscriptOnly}
}`;
    } else {
      // ── TOPLANTI ANALİZİ ──
      const contextBlock = buildMeetingContext(recordingInfo || {});
      const hasContext = contextBlock.length > 20;

      systemPrompt = `Sen Donebird platformu için çalışan uzman bir toplantı analisti ve iletişim koçusun.

GÖREV: Aşağıdaki toplantı transkriptini derinlemesine analiz et.

${hasContext ? `[TOPLANTI BAĞLAMI]
${contextBlock}

ÖNEMLİ: Yukarıdaki bağlam bilgilerini analiz çerçevesi olarak kullan. Toplantının belirtilen amaca, gündeme ve beklenen çıktılara ne kadar ulaştığını değerlendir. ANCAK bağlamda verilen bilgileri transkriptte geçmiyormuş gibi rapora koyma. Bağlam sadece değerlendirme perspektifini belirler.` : ''}

${properNounCtx}${publicContextCtx}${evidenceWarning}

RAPOR YAKLAŞIMI:
- Yüzeysel "toplantı verimliydi" tipi boş değerlendirmeler YAPMA
- Her karar ve aksiyon maddesi için transkriptten somut alıntı göster
- Toplantı verimliliğini somut metriklere dayandır
- Baskın ve pasif konuşmacıları net şekilde belirle
- Gündem takibini ve sapmaları somut örneklerle göster
- Karar alma kalitesini değerlendir
- Sonraki adımlar için net ve uygulanabilir öneriler ver
- Public context varsa bunu yalnızca kurum/ürün/sektör bağlamı perspektifi için kullan
- Boş cümlelerden kaçın; her ana görüş transcript veya davranışsal kanıtla bağlansın
- Aynı anlamı tekrar eden yorumları temizle; 3-4 kanıtlı içgörüye öncelik ver
${hasContext && recordingInfo.decisionTopics ? `- Özellikle şu karar başlıklarını değerlendir: ${recordingInfo.decisionTopics}` : ''}

Türkçe JSON döndür.`;

      const behavFields = isBehavioralEnabled && !isTranscriptOnly ? `,
  "voice_analysis": {
    "tone": "string", "tone_description": "string",
    "speech_speed": "string",
    "hesitation_level": "string",
    "filler_words_usage": "string",
    "energy_level": "string",
    "voice_score": number, "inference_type": "linguistic_inference"
  },
  "visual_analysis": ${isTranscriptOnly || isAudioOnly ? 'null' : '{"eye_contact":"low|medium|high|insufficient_evidence","eye_contact_confidence":"low|medium|high","camera_facing":"low|medium|high","gaze_evidence":"insufficient_evidence|weak|moderate|strong","script_reading_suspicion":"low|medium|high|insufficient_evidence","natural_delivery_score":number,"spontaneity_proxy":number,"delivery_authenticity_notes":"string","confidence":"low|medium|high","engagement_level":"low|medium|high|insufficient_evidence","presence":"active|inactive","visual_score":number,"inference_type":"acoustic_signal_inference|insufficient_evidence"}'},
  "behavior_score": number,
  "behavioral_interpretation": "string"` : "";

      userPrompt = `${properNounCtx}${publicContextCtx}${facialCtx}

[TRANSKRİPT BAŞLANGIÇ]
${safeTranscript}
[TRANSKRİPT BİTİŞ]

UYARI: Yukarıdaki transkriptin dışında HİÇBİR bilgi KULLANMA. Sadece transkriptte geçen konuları analiz et.

JSON:
{
  "top_insights": ["string (tam olarak 3 adet, transkriptten somut alıntıyla)"],
  "executive_summary": {
    "overall_evaluation": "string (3-4 cümle, somut gözlemlerle)",
    "key_strength": "string (transkriptten alıntıyla)",
    "key_risk": "string (transkriptten alıntıyla)",
    "final_recommendation": "string (net sonraki adım önerisi)"
  },
  "critical_3_insights": ["string (toplantının kaderini etkileyen 3 içgörü)"],
  "meeting_verdict": {
    "quality": "high|moderate|low",
    "confidence": number,
    "main_issue": "string",
    "improvement_suggestion": "string",
    "agenda_coverage": "string (gündem ne kadar takip edildi)",
    "time_efficiency": "string (zaman ne kadar verimli kullanıldı)"
  },
  "overall_score": number,
  "meeting_quality": number,
  "content_analysis": {
    "topic_coverage": {"score": number, "description": "string", "inference_type": "direct_transcript_evidence"},
    "discussion_depth": {"score": number, "description": "string", "inference_type": "direct_transcript_evidence"},
    "decision_clarity": {"score": number, "description": "string", "inference_type": "direct_transcript_evidence"},
    "focus_adherence": {"score": number, "description": "string (konu odaklılık)", "inference_type": "direct_transcript_evidence"}
  },
  "communication_analysis": {
    "overall_clarity": {"score": number, "description": "string"},
    "constructiveness": {"score": number, "description": "string"},
    "participation_quality": {"score": number, "description": "string"}
  },
  "participants_analysis": [
    {
      "name": "string",
      "contribution_score": number,
      "communication_style": "string",
      "behavioral_insights": "string",
      "strengths": ["string"],
      "areas_for_improvement": ["string"],
      "transcript_excerpt": "string",
      "speaking_balance": "dominant|balanced|passive",
      "key_contributions": ["string (somut katkıları)"]
    }
  ],
  "meeting_effectiveness": {
    "agenda_adherence": number,
    "time_management": number,
    "decision_making": number,
    "participation_balance": number
  },
  "agenda_adherence_analysis": "string (gündem ne kadar izlendi, kanıtla)",
  "decision_quality_analysis": "string (kararlar ne kadar net ve uygulanabilir)",
  "action_ownership_analysis": "string (sorumlulukların ne kadar net atandığı)",
  "participation_balance_analysis": "string (kim baskın/pasif ve etkisi)",
  "key_topics": ["string"],
  "critical_moments": [
    {
      "moment": "string",
      "why_it_matters": "string",
      "transcript_excerpt": "string",
      "impact": "positive|negative|neutral"
    }
  ],
  "decisions_made": [
    {
      "decision": "string",
      "context": "string (kararın bağlamı)",
      "participants_involved": ["string"],
      "transcript_excerpt": "string",
      "confidence": "high|medium|low"
    }
  ],
  "action_items": [
    {
      "task_description": "string",
      "owner": "string|null",
      "priority": "high|medium|low",
      "deadline": "string|null",
      "ai_suggestion": "string|null",
      "source_excerpt": "string (transkriptten alıntı)"
    }
  ],
  "unresolved_topics": ["string (tartışılıp karara bağlanmamış konular)"],
  "unresolved_issues": ["string (karar riskini artıran açık başlıklar)"],
  "follow_up_recommendations": ["string (sonraki toplantı/adım önerileri)"],
  "next_step_recommendations": ["string (sorumlu ve eylem odaklı öneriler)"],
  "scores": {
    "effectiveness_score": {"value": number, "reason": "string"},
    "communication_score": {"value": number, "reason": "string"},
    "decision_quality_score": {"value": number, "reason": "string"}
  },
  "summary": "string",
  "recommendations": ["string (aksiyon odaklı)"],
  "general_comment": "string",
  "improvement_plan": [{"area":"string","action":"string (somut ve uygulanabilir)","priority":"high|medium|low"}],
  "speech_insights": [{"type":"string","title":"string","description":"string","severity":"info|warning|success"}]${behavFields},
  "behavioral_patterns": {"dominant_speaker":"string|null","passive_participants":["string"]|null,"stress_signals":"string|null"},
  "behavior_timeline": {"start":"string","middle":"string","end":"string"},
  "data_quality": {
    "transcript_available": true,
    "transcript_length": ${safeTranscript.length},
    "audio_analysis_available": ${!isTranscriptOnly},
    "visual_analysis_available": ${!isTranscriptOnly && !isAudioOnly && !!facialAnalysis},
    "context_provided": ${contextBlock.length > 20},
    "public_context_used": ${publicContext.items.length > 0},
    "overall_confidence": "${safeTranscript.length < 500 ? 'low' : isTranscriptOnly ? 'medium' : 'high'}",
    "limitations": ["${isTranscriptOnly ? 'Yalnızca metin transkript' : isAudioOnly ? 'Yalnızca ses dosyası' : ''}"]
  },
  "biveyos_enabled": ${isBehavioralEnabled && !isTranscriptOnly}
}`;
    }

    console.log(`[analyze-interview] type=${isInterview ? 'interview' : 'meeting'} source=${sourceType} behavioral=${isBehavioralEnabled} transcript_len=${safeTranscript.length} has_context=${isInterview ? buildInterviewContext(recordingInfo || {}).length > 20 : buildMeetingContext(recordingInfo || {}).length > 20}`);

    const response = await callAI({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      model: "google/gemini-2.5-flash",
    });

    const { data, error } = await parseAIResponse(response, corsHeaders);
    if (error) return error;

    const calibratedData = data
      ? tightenAnalysisOutput(calibrateBehavioralOutput(data, safeTranscript, facialAnalysis, {
          isTranscriptOnly,
          isAudioOnly,
          isInterview,
        }), isInterview)
      : data;

    if (calibratedData) {
      calibratedData.transcript = safeTranscript;
      calibratedData.transcript_corrections = normalizedTranscript.corrections;
      calibratedData.detected_entities = detectedEntities;
      calibratedData.entity_confidence = detectedEntities.reduce<Record<string, string>>((acc, item) => {
        acc[item.name] = item.confidence;
        return acc;
      }, {});
      calibratedData.public_context = publicContext.items;
      calibratedData.data_quality = {
        ...(calibratedData.data_quality || {}),
        proper_noun_glossary: properNounGlossary,
        transcript_correction_count: normalizedTranscript.corrections.length,
        detected_entity_count: detectedEntities.length,
        public_context_sources: publicContext.sources,
        public_context_used: publicContext.items.length > 0,
      };
    }

    // ── POST-GENERATION VALIDATION ──
    if (calibratedData && safeTranscript.length > 100) {
      const summary = calibratedData.summary || calibratedData.executive_summary?.overall_evaluation || "";
      const transcriptWords = safeTranscript.substring(0, 300).split(/\s+/).filter((w: string) => w.length > 4);
      const hasAnyReference = transcriptWords.some((word: string) => 
        summary.toLowerCase().includes(word.toLowerCase())
      );
      if (!hasAnyReference && summary.length > 50) {
        console.warn("[analyze-interview] WARNING: AI output may not reference transcript content.");
        calibratedData.data_quality = {
          ...(calibratedData.data_quality || {}),
          ai_output_validated: false,
          validation_warning: "AI çıktısı transkript içeriğiyle düşük korelasyon gösteriyor. Raporu dikkatle değerlendirin."
        };
      }
    }

    return new Response(JSON.stringify({ analysis: calibratedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Error analyzing interview:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
