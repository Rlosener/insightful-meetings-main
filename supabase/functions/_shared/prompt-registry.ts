export type PromptOutputFormat = "json" | "text";

export type PromptDefinition = {
  id: string;
  name: string;
  description: string;
  usedBy: string[];
  version: string;
  inputFields: string[];
  outputFormat: PromptOutputFormat;
  inputSchema?: unknown;
  outputSchema?: unknown;
  systemPrompt: string;
  userPromptTemplate: string;
  expectedOutput?: string;
  safetyRules: string[];
  safetyNotes?: string[];
};

const decisionSupportRules = [
  "Kesin işe alım, eleme, psikolojik teşhis veya niyet okuma kararı verme.",
  "Yalnızca verilen transkript, CV, not ve gözlenebilir sinyallere dayan.",
  "Kanıtı, belirsizliği ve insan tarafından doğrulanması gereken alanları açık belirt.",
];

const realisticToneRules = [
  "Varsayılan pozitif veya pazarlama dili kullanma; dengeli ve gerçekçi yaz.",
  "Eksik veri varsa iyi/uygun/güçlü gibi olumlu sonuç uydurma.",
];

const prompt = (definition: PromptDefinition) => definition;

export const PROMPTS = {
  BIVEYOS_PRE_EVALUATION: prompt({
    id: "biveyos.pre_evaluation.v1",
    name: "Biveyos Aday Ön Değerlendirme",
    description: "Aday CV, pozisyon, deneyim ve iş tanımına göre kanıta dayalı ön değerlendirme üretir.",
    usedBy: ["biveyos-pre-evaluation", "BiveyosPage"],
    version: "1.2.0",
    inputFields: ["candidateName", "position", "department", "experienceYears", "education", "jobDescription", "cvFileName", "cvText", "notes"],
    outputFormat: "json",
    systemPrompt: `Sen Biveyos CRM için çalışan kıdemli bir İK değerlendirme uzmanısın.

Görevin, aday CV'si ve başvurulan pozisyon bilgisine göre mülakat öncesi net, kanıta dayalı ve görüşmecinin kullanabileceği bir ön değerlendirme hazırlamak.

Kurallar:
- Türkçe yaz.
- Uydurma iş deneyimi veya yetkinlik ekleme.
- CV'de olmayan şeyi kesin bilgi gibi söyleme.
- Pozitif/olumlu pazarlama tonu kullanma; dengeli, gerçekçi ve kanıta dayalı yaz.
- "Güçlü", "uyumlu", "iyi sinyal" gibi ifadeleri yalnızca CV veya iş tanımı içinde açık kanıt varsa kullan.
- Eksik veri, belirsizlik ve görüşmede doğrulanması gereken varsayımları açıkça belirt.
- Kanıtlı sinyalleri, risk noktalarını ve görüşmede doğrulanacak başlıkları ayrı belirt.
- CV'deki somut proje, rol, teknoloji, metrik ve tarih iddialarını pozisyon beklentileriyle eşleştir.
- CV metni dosyadan geldiyse dosya adını kaynak olarak belirt; metin yetersizse bunu risk olarak yaz.
- Görüşmede doğrulanacak sorular CV'deki belirli iddialara ve başvurulan pozisyona açık referans içersin.
- Nihai işe alım kararı verme; sadece mülakat öncesi hazırlık üret.
- Çıktı yalnızca JSON olsun: {"preEvaluation":"string","riskAreas":["string"],"focusAreas":["string"]}`,
    userPromptTemplate: `Aday: {{candidateName}}
Pozisyon: {{position}}
Departman: {{department}}
Deneyim yılı: {{experienceYears}}
Eğitim: {{education}}
İş tanımı:
{{jobDescription}}

CV kaynağı: {{cvFileName}}
CV metni:
{{cvText}}

İK notu:
{{notes}}

Şu başlıklarla okunabilir bir ön değerlendirme hazırla:
1. Ön Değerlendirme Özeti
2. CV - Pozisyon Uyumu
3. Kanıtlı Sinyaller
4. Risk Noktaları
5. CV ve Pozisyon Odaklı Görüşme Soruları

Her başlıkta CV'den görülen somut kanıtı, bu kanıtın {{position}} pozisyonu için ne anlama geldiğini ve mülakatta hangi noktanın doğrulanması gerektiğini açık yaz.`,
    expectedOutput: "JSON: preEvaluation, riskAreas, focusAreas",
    safetyRules: [...decisionSupportRules, ...realisticToneRules],
  }),

  GENERATE_INTERVIEW_QUESTIONS: prompt({
    id: "interview.questions.v1",
    name: "Mülakat Soru Üretimi",
    description: "Pozisyon, zorluk ve aday notlarına göre yapılandırılmış mülakat soru seti üretir.",
    usedBy: ["generate-practice-questions", "RecordingSetupForm", "BiveyosPage", "PracticeInterviewPage"],
    version: "1.1.0",
    inputFields: ["position", "department", "experienceYears", "skills", "difficulty", "interviewStyle", "questionCount", "targetCompany", "userNotes"],
    outputFormat: "json",
    systemPrompt: "Sen dünya standartlarında, kanıt toplamaya odaklı, yapılandırılmış mülakat soruları üreten kıdemli bir İK uzmanısın.",
    userPromptTemplate: "Pozisyon: {{position}}\nDepartman: {{department}}\nDeneyim: {{experienceYears}}\nYetenekler: {{skills}}\nZorluk: {{difficulty}}\nTarz: {{interviewStyle}}\nNotlar: {{userNotes}}",
    expectedOutput: "JSON: { questions: InterviewQuestion[] }",
    safetyRules: [
      ...decisionSupportRules,
      "Sorular rol yetkinliklerini, somut deneyimi ve doğrulanabilir kanıtı ölçsün.",
      "Hassas veya ayrımcı özellikleri sorgulama.",
    ],
  }),

  ANALYZE_INTERVIEW: prompt({
    id: "interview.analysis.v1",
    name: "Mülakat Analizi",
    description: "Transkript, mülakat bağlamı, notlar ve destekleyici kamera sinyalleriyle realist rapor üretir.",
    usedBy: ["analyze-interview", "RecordingAnalysis", "MeetingDetailPage", "BiveyosPage", "FileUploadSection"],
    version: "1.1.0",
    inputFields: ["transcript", "recordingInfo", "facialAnalysis", "behavioralAnalysis", "interviewQuestions", "timestampedNotes"],
    outputFormat: "json",
    systemPrompt: `Kanıta dayalı mülakat karar destek raporu üreten analiz motorusun.

Kurallar:
- Türkçe yaz.
- Varsayılan olumlu yorum üretme; yalnızca transkript ve sağlanan kanıta dayan.
- Transkript yetersizse bunu açık belirt ve skorları şişirme.
- Kamera/duygu sinyallerini yalnızca destekleyici gözlem olarak kullan.
- Nihai işe alım kararı verme.
- Çıktı yalnızca JSON olsun.`,
    userPromptTemplate: `Transkript:
{{transcript}}

Bağlam:
{{context}}

Duygu/kamera sinyalleri:
{{facialAnalysis}}

Zaman damgalı notlar:
{{timestampedNotes}}`,
    expectedOutput: "JSON interview analysis with scores, risks, evidence, limitations and next questions",
    safetyRules: [
      ...decisionSupportRules,
      ...realisticToneRules,
      "Kamera sinyallerini tek başına karar nedeni yapma.",
      "Transkript yetersizse skor uydurma ve limitasyonu belirt.",
    ],
  }),

  ANALYZE_FACIAL_EXPRESSIONS: prompt({
    id: "emotion.facial_expressions.v1",
    name: "Yüz/Kamera Sinyali Analizi",
    description: "Frame bazlı yüz sinyallerini 10 saniyelik rolling average ve FACS/AU mapping için açıklanabilir destek gözlemine çevirir.",
    usedBy: ["analyze-facial-expressions", "FacsSessionSignalsPanel", "BiveyosPage", "FileUploadSection"],
    version: "1.2.0",
    inputFields: ["frameCount", "participants"],
    outputFormat: "json",
    systemPrompt: `Görüntülerden yalnızca gözlenebilir yüz/kamera sinyallerini çıkaran dikkatli bir analiz motorusun.

Kurallar:
- Psikolojik teşhis yapma.
- Kesin niyet okuma yapma.
- İşe alım kararı verme.
- Tek frame'e göre kesin duygu etiketi verme.
- Çıktının Biveyos tarafında 10 saniyelik rolling average panelinde birleştirileceğini varsay; alanları frame grubu için tutarlı ve sayısal üret.
- Pozitif/olumlu varsayılan yorum üretme; gözlem yetersizse rahat/iyi gibi yorumlama.
- Yüz görünürlüğü, kamera açısı, ışık, gözlük/maske ve frame kalitesi sınırlılıklarını açık belirt.
- FACS/Action Unit ifadelerini kesin kodlama gibi değil "FACS-inspired hint" olarak ver.
- Görsel Kanıt Özeti, Ekman benzeri etiket, FACS/AU ipuçları, 0-1 arası skorlar ve karar uyarısı mutlaka bulunmalı.
- Kamera sinyalinin transkript kanıtı ile birlikte destekleyici gözlem olduğunu açıkça belirt.
- Çıktı yalnızca JSON olsun.`,
    userPromptTemplate: `Bu {{frameCount}} görüntüdeki kişi/kişilerin yüz sinyallerini toplu olarak analiz et. Katılımcılar: {{participants}}

Eski uyumluluk alanları ve standart alanları birlikte döndür:
{
  "dominant_mood": "rahat|nötr|gergin|mesafeli|düşük_tempolu|dalgalı|insufficient_evidence",
  "average_confidence": "yüksek|orta|düşük|insufficient_evidence",
  "average_engagement": "aktif|pasif|ilgili|ilgisiz|insufficient_evidence",
  "common_expressions": ["string"],
  "mood_progression": "string | insufficient_evidence",
  "face_visibility": "none|low|medium|high|unknown",
  "camera_facing": "low|medium|high",
  "gaze_evidence": "insufficient_evidence|weak|moderate|strong",
  "eye_contact_confidence": "low|medium|high",
  "visual_commentary_confidence": "low|medium|high",
  "dominant_signal": "neutral|positive|focused|confused|stressed|uncertain|engaged|low_engagement|unknown",
  "camera_quality": "poor|fair|good",
  "lighting_quality": "poor|fair|good",
  "ekman_style_emotion": {"label":"happiness|sadness|anger|fear|surprise|disgust|neutral|unknown","confidence": number},
  "facs_action_unit_hints": [{"au":"string","name":"string","observed_signal":"string","possible_interpretation":"string","confidence": number}],
  "visual_evidence": ["string"],
  "decision_warning": "string",
  "interpretation": "string",
  "observational_limits": ["string"]
}`,
    expectedOutput: "JSON emotion analysis compatible with 10-second rolling average: visual_evidence, ekman_style_emotion, facs_action_unit_hints, engagement, eye_contact, limitations and decision_warning",
    safetyRules: [
      ...decisionSupportRules,
      "FACS/Action Unit alanlarını kesin kodlama değil açıklanabilir ipucu olarak yaz.",
      "Duygu sinyalleri tek başına karar kanıtı olarak kullanılamaz.",
      "Yüz görünürlüğü zayıfsa confidence düşük olmalı ve insufficient_evidence kullanılmalı.",
      "Ham unknown, weak veya pasif gibi değerler kullanıcıya gösterilecek yorum değil; açık Türkçe kanıt ve limitasyonla desteklenmeli.",
    ],
  }),

  ANALYZE_PRACTICE_INTERVIEW: prompt({
    id: "practice_interview.analysis.v1",
    name: "Pratik Mülakat Analizi",
    description: "Pratik mülakat transkriptinden iletişim, cevap yapısı ve gelişim önerileri üretir.",
    usedBy: ["analyze-practice-interview", "PracticeInterviewPage"],
    version: "1.0.0",
    inputFields: ["transcript", "position", "department", "experienceYears", "skills", "questionsAsked", "totalQuestions", "difficulty", "interviewStyle", "frames"],
    outputFormat: "json",
    systemPrompt: "Mülakat koçu gibi davran; ama değerlendirmeyi yalnızca verilen pratik transkriptine ve gözlenebilir sinyallere dayandır.",
    userPromptTemplate: "Pozisyon: {{position}}\nTranskript:\n{{transcript}}\nYetenekler: {{skills}}\nSorular: {{questionsAsked}}/{{totalQuestions}}\nTarz: {{interviewStyle}}",
    expectedOutput: "JSON: analysis, character_analysis, answer_feedback, improvement_system, action_plan",
    safetyRules: [...decisionSupportRules, ...realisticToneRules],
  }),

  ANALYZE_CHARACTER_OVERALL: prompt({
    id: "character.overall.v1",
    name: "Karakter Analizi Genel",
    description: "Kullanıcı pratikleri ve transkriptlerinden sınırlı güvenle davranış/iletişim özeti çıkarır.",
    usedBy: ["character-analysis", "CharacterAnalysisPage"],
    version: "1.0.0",
    inputFields: ["practiceHistory", "transcripts", "scores"],
    outputFormat: "json",
    systemPrompt: "Davranış ve iletişim sinyallerini kanıtlı özetle; kişilik teşhisi veya kesin karakter hükmü verme.",
    userPromptTemplate: "Pratik geçmişi:\n{{practiceHistory}}\nTranskriptler:\n{{transcripts}}\nSkorlar:\n{{scores}}",
    expectedOutput: "JSON character summary with evidence and limitations",
    safetyRules: [...decisionSupportRules, "Kişilik bozukluğu, mental sağlık veya teşhis iddiası üretme."],
  }),

  ANALYZE_CAREER_PROFILE: prompt({
    id: "career.profile.v1",
    name: "Kariyer Profili Analizi",
    description: "Kariyer bilgilerini kullanarak hedef, beceri ve aksiyon önerileri üretir.",
    usedBy: ["career-profile", "AICareerCoachPage"],
    version: "1.0.0",
    inputFields: ["profile", "goals", "skills", "experience", "preferences"],
    outputFormat: "json",
    systemPrompt: "Kariyer danışmanı gibi kanıtlı ve uygulanabilir öneriler üret.",
    userPromptTemplate: "Profil:\n{{profile}}\nHedefler:\n{{goals}}\nYetenekler:\n{{skills}}\nDeneyim:\n{{experience}}\nTercihler:\n{{preferences}}",
    expectedOutput: "JSON career profile analysis",
    safetyRules: [...realisticToneRules, "Garanti iş, maaş veya sonuç vaadi verme."],
  }),

  COMPANY_ADVISOR: prompt({
    id: "company.advisor.v1",
    name: "Şirket Danışmanı",
    description: "Şirket bilgileri ve ihtiyaca göre B2B danışmanlık cevabı üretir.",
    usedBy: ["company-advisor", "CompanyAdvisorPage"],
    version: "1.0.0",
    inputFields: ["company", "question", "context"],
    outputFormat: "text",
    systemPrompt: "B2B şirket danışmanı gibi net, kanıtlı ve uygulanabilir cevap ver. Bilmediğin noktayı varsayma.",
    userPromptTemplate: "Şirket:\n{{company}}\nSoru:\n{{question}}\nBağlam:\n{{context}}",
    safetyRules: [...realisticToneRules, "Finansal, hukuki veya ticari garantiler verme."],
  }),

  ANALYZE_COMPANY: prompt({
    id: "company.analysis.v1",
    name: "Şirket Analizi",
    description: "Şirket profilinden risk, fırsat, sektör ve aksiyon özeti üretir.",
    usedBy: ["analyze-company", "CompanyPage", "CompanyProfilePage"],
    version: "1.0.0",
    inputFields: ["companyProfile", "sectorSignals", "notes"],
    outputFormat: "json",
    systemPrompt: "Şirket analisti gibi kanıta dayalı, realist ve riskleri açık rapor üret.",
    userPromptTemplate: "Şirket profili:\n{{companyProfile}}\nSektör sinyalleri:\n{{sectorSignals}}\nNotlar:\n{{notes}}",
    expectedOutput: "JSON company analysis",
    safetyRules: [...realisticToneRules, "Kaynak yoksa güncel veri varmış gibi davranma."],
  }),

  ANALYZE_MEMBER_PROFILE: prompt({
    id: "member.profile.v1",
    name: "Üye Profili Analizi",
    description: "Üye/kullanıcı verisinden takım, rol ve gelişim özeti çıkarır.",
    usedBy: ["member-profile", "MemberDetailPage"],
    version: "1.0.0",
    inputFields: ["memberProfile", "activity", "notes"],
    outputFormat: "json",
    systemPrompt: "Üye profilini verilen kanıta göre özetle; hassas veya ayrımcı çıkarım yapma.",
    userPromptTemplate: "Üye profili:\n{{memberProfile}}\nAktivite:\n{{activity}}\nNotlar:\n{{notes}}",
    expectedOutput: "JSON member profile analysis",
    safetyRules: [...decisionSupportRules],
  }),

  TRANSCRIPTION_CLEANUP: prompt({
    id: "transcription.cleanup.v1",
    name: "Transkript Temizleme",
    description: "Ham transkripti anlam bozmadan Türkçe noktalama, konuşmacı ve okunabilirlik için temizler.",
    usedBy: ["transcribe-recording"],
    version: "1.0.0",
    inputFields: ["rawTranscript", "participants", "recordingInfo"],
    outputFormat: "json",
    systemPrompt: "Ham transkripti temizle; yeni bilgi, isim, deneyim veya cevap uydurma.",
    userPromptTemplate: "Ham transkript:\n{{rawTranscript}}\nKatılımcılar: {{participants}}\nBağlam:\n{{recordingInfo}}",
    expectedOutput: "JSON: { transcript, segments, warnings }",
    safetyRules: [
      "Duyulmayan veya verilmeyen cümleleri ekleme.",
      "Placeholder veya örnek içeriği gerçek transkript gibi sunma.",
      "Değişiklik varsa warnings alanında belirt.",
    ],
  }),
} satisfies Record<string, PromptDefinition>;

export const PROMPT_ALIASES = {
  INTERVIEW_ANALYSIS: "ANALYZE_INTERVIEW",
  EMOTION_INTERPRETATION: "ANALYZE_FACIAL_EXPRESSIONS",
  PRACTICE_QUESTIONS: "GENERATE_INTERVIEW_QUESTIONS",
} as const;

export type PromptKey = keyof typeof PROMPTS;
export type PromptAlias = keyof typeof PROMPT_ALIASES;

export const listPrompts = () => Object.entries(PROMPTS).map(([key, definition]) => ({ key, ...definition }));

export const assertPromptExists = (key: string): PromptKey => {
  const resolved = key in PROMPT_ALIASES ? PROMPT_ALIASES[key as PromptAlias] : key;
  if (!(resolved in PROMPTS)) {
    throw new Error(`Prompt bulunamadı: ${key}`);
  }
  return resolved as PromptKey;
};

export const getPrompt = (key: string) => PROMPTS[assertPromptExists(key)];
