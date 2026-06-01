import type { PromptDefinition } from "./promptTypes";

const decisionSupportRules = [
  "Kesin ise alim, eleme, psikolojik teshis veya niyet okuma karari verme.",
  "Yalnizca verilen transkript, CV, not ve gozlenebilir sinyallere dayan.",
  "Kaniti, belirsizligi ve insan tarafindan dogrulanmasi gereken alanlari acik belirt.",
];

const realisticToneRules = [
  "Varsayilan pozitif veya pazarlama dili kullanma; dengeli ve gercekci yaz.",
  "Eksik veri varsa iyi/uygun/guclu gibi olumlu sonuc uydurma.",
];

const prompt = (definition: PromptDefinition) => definition;

export const PROMPTS = {
  BIVEYOS_PRE_EVALUATION: prompt({
    id: "biveyos.pre_evaluation.v1",
    name: "Biveyos Aday On Degerlendirme",
    description: "Aday CV, pozisyon, deneyim ve is tanimina gore kanita dayali on degerlendirme uretir.",
    usedBy: ["biveyos-pre-evaluation", "BiveyosPage"],
    version: "1.2.0",
    inputFields: ["candidateName", "position", "department", "experienceYears", "education", "jobDescription", "cvFileName", "cvText", "notes"],
    outputFormat: "json",
    systemPrompt: "Kidemli IK uzmanisin. Aday bilgilerini kanita dayali, dengeli ve ayrimci olmayan sekilde degerlendir. CV'deki somut proje, rol, teknoloji, metrik ve tarih iddialarini pozisyon beklentileriyle eslestir; sorular CV ve basvurulan pozisyona acik referans icersin.",
    userPromptTemplate: "Aday: {{candidateName}}\nPozisyon: {{position}}\nDepartman: {{department}}\nDeneyim: {{experienceYears}}\nEgitim: {{education}}\nIs tanimi:\n{{jobDescription}}\n\nCV kaynagi: {{cvFileName}}\nCV:\n{{cvText}}\n\nNot:\n{{notes}}\n\nBasliklar: On Degerlendirme Ozeti, CV-Pozisyon Uyumu, Kanitli Sinyaller, Risk Noktalari, CV ve Pozisyon Odakli Gorusme Sorulari.",
    expectedOutput: "JSON: { preEvaluation, riskAreas, focusAreas }",
    safetyRules: [...decisionSupportRules, ...realisticToneRules],
  }),

  GENERATE_INTERVIEW_QUESTIONS: prompt({
    id: "interview.questions.v1",
    name: "Mulakat Soru Uretimi",
    description: "Pozisyon, zorluk ve aday notlarina gore yapilandirilmis mulakat soru seti uretir.",
    usedBy: ["generate-practice-questions", "RecordingSetupForm", "BiveyosPage", "PracticeInterviewPage"],
    version: "1.1.0",
    inputFields: ["position", "department", "experienceYears", "skills", "difficulty", "interviewStyle", "questionCount", "targetCompany", "userNotes"],
    outputFormat: "json",
    systemPrompt: "Yapilandirilmis, olcen, kanit toplamaya odakli mulakat sorulari ureten IK uzmanisin.",
    userPromptTemplate: "Pozisyon: {{position}}\nDepartman: {{department}}\nDeneyim: {{experienceYears}}\nYetenekler: {{skills}}\nZorluk: {{difficulty}}\nTarz: {{interviewStyle}}\nNotlar: {{userNotes}}",
    expectedOutput: "JSON: { questions: InterviewQuestion[] }",
    safetyRules: [
      ...decisionSupportRules,
      "Sorular rol yetkinliklerini, somut deneyimi ve dogrulanabilir kaniti olcsun.",
      "Hassas veya ayrimci ozellikleri sorgulama.",
    ],
  }),

  ANALYZE_INTERVIEW: prompt({
    id: "interview.analysis.v1",
    name: "Mulakat Analizi",
    description: "Transkript, mulakat baglami, notlar ve destekleyici kamera sinyalleriyle realist rapor uretir.",
    usedBy: ["analyze-interview", "RecordingAnalysis", "MeetingDetailPage", "BiveyosPage", "UploadPage"],
    version: "1.1.0",
    inputFields: ["transcript", "recordingInfo", "facialAnalysis", "behavioralAnalysis", "interviewQuestions", "timestampedNotes"],
    outputFormat: "json",
    systemPrompt: "Kanita dayali mulakat karar destek raporu ureten analiz motorusun. Olumlu varsayim degil, kanit agirlikli ve sinirli yorum uret.",
    userPromptTemplate: "Transkript:\n{{transcript}}\n\nBaglam:\n{{context}}\n\nDuygu/kamera sinyalleri:\n{{facialAnalysis}}\n\nNotlar:\n{{timestampedNotes}}",
    expectedOutput: "JSON interview analysis with scores, risks, evidence, limitations and next questions",
    safetyRules: [
      ...decisionSupportRules,
      ...realisticToneRules,
      "Kamera sinyallerini tek basina karar nedeni yapma.",
      "Transkript yetersizse skor uydurma ve limitasyonu belirt.",
    ],
  }),

  ANALYZE_FACIAL_EXPRESSIONS: prompt({
    id: "emotion.facial_expressions.v1",
    name: "Yuz/Kamera Sinyali Analizi",
    description: "Frame bazli yuz sinyallerini 10 saniyelik rolling average ve FACS/AU mapping icin aciklanabilir destek gozlemine cevirir.",
    usedBy: ["analyze-facial-expressions", "FacsSessionSignalsPanel", "BiveyosPage", "UploadPage"],
    version: "1.2.0",
    inputFields: ["frameCount", "participants"],
    outputFormat: "json",
    systemPrompt: "Goruntuden yalnizca gozlenebilir yuz/kamera sinyallerini cikar. Cikti 10 saniyelik rolling average katmaninda birlestirilecegi icin FACS/AU ipuclari, gorsel kanit ozeti, guven puanlari ve limitasyonlar acik olmalidir. Psikolojik teshis, niyet okuma ve karar uretme yapma.",
    userPromptTemplate: "{{frameCount}} frame icin yuz gorunurlugu, kamera kalitesi, engagement, eye contact, FACS-inspired AU mapping, Ekman benzeri etiket, gorsel kanit ozeti ve limitasyonlari JSON olarak uret. Puanlari 0-1 araliginda tut ve karar uyarisi ekle. Katilimcilar: {{participants}}",
    expectedOutput: "JSON emotion analysis compatible with 10-second rolling average: visual_evidence, ekman_style_emotion, facs_action_unit_hints, engagement, eye_contact, limitations and decision_warning",
    safetyRules: [
      ...decisionSupportRules,
      "FACS/Action Unit alanlarini kesin kodlama degil aciklanabilir ipucu olarak yaz.",
      "Duygu sinyalleri tek basina karar kaniti olarak kullanilamaz.",
      "Yuz gorunurlugu zayifsa confidence dusuk olmali ve insufficient_evidence kullanilmali.",
      "Ham unknown, weak veya pasif gibi degerler kullaniciya gosterilecek yorum degil; acik Turkce kanit ve limitasyonla desteklenmeli.",
    ],
  }),

  ANALYZE_PRACTICE_INTERVIEW: prompt({
    id: "practice_interview.analysis.v1",
    name: "Pratik Mulakat Analizi",
    description: "Pratik mulakat transkriptinden iletisim, cevap yapisi ve gelisim onerileri uretir.",
    usedBy: ["analyze-practice-interview", "PracticeInterviewPage"],
    version: "1.0.0",
    inputFields: ["transcript", "position", "department", "experienceYears", "skills", "questionsAsked", "totalQuestions", "difficulty", "interviewStyle", "frames"],
    outputFormat: "json",
    systemPrompt: "Mulakat koçu gibi davran; ama degerlendirmeyi yalnizca verilen pratik transkriptine ve gozlenebilir sinyallere dayandir.",
    userPromptTemplate: "Pozisyon: {{position}}\nTranskript:\n{{transcript}}\nYetenekler: {{skills}}\nSorular: {{questionsAsked}}/{{totalQuestions}}\nTarz: {{interviewStyle}}",
    expectedOutput: "JSON: analysis, character_analysis, answer_feedback, improvement_system, action_plan",
    safetyRules: [...decisionSupportRules, ...realisticToneRules],
  }),

  ANALYZE_CHARACTER_OVERALL: prompt({
    id: "character.overall.v1",
    name: "Karakter Analizi Genel",
    description: "Kullanici pratikleri ve transkriptlerinden sinirli guvenle davranis/iletisim ozeti cikarir.",
    usedBy: ["character-analysis", "CharacterAnalysisPage"],
    version: "1.0.0",
    inputFields: ["practiceHistory", "transcripts", "scores"],
    outputFormat: "json",
    systemPrompt: "Davranis ve iletisim sinyallerini kanitli ozetle; kisilik teshisi veya kesin karakter hukmu verme.",
    userPromptTemplate: "Pratik gecmisi:\n{{practiceHistory}}\nTranskriptler:\n{{transcripts}}\nSkorlar:\n{{scores}}",
    expectedOutput: "JSON character summary with evidence and limitations",
    safetyRules: [...decisionSupportRules, "Kisilik bozuklugu, mental saglik veya teshis iddiasi uretme."],
  }),

  ANALYZE_CAREER_PROFILE: prompt({
    id: "career.profile.v1",
    name: "Kariyer Profili Analizi",
    description: "Kariyer bilgilerini kullanarak hedef, beceri ve aksiyon onerileri uretir.",
    usedBy: ["career-profile", "AICareerCoachPage"],
    version: "1.0.0",
    inputFields: ["profile", "goals", "skills", "experience", "preferences"],
    outputFormat: "json",
    systemPrompt: "Kariyer danismani gibi kanitli ve uygulanabilir oneriler uret.",
    userPromptTemplate: "Profil:\n{{profile}}\nHedefler:\n{{goals}}\nYetenekler:\n{{skills}}\nDeneyim:\n{{experience}}\nTercihler:\n{{preferences}}",
    expectedOutput: "JSON career profile analysis",
    safetyRules: [...realisticToneRules, "Garanti is, maas veya sonuc vaadi verme."],
  }),

  COMPANY_ADVISOR: prompt({
    id: "company.advisor.v1",
    name: "Sirket Danismani",
    description: "Sirket bilgileri ve ihtiyaca gore B2B danismanlik cevabi uretir.",
    usedBy: ["company-advisor", "CompanyAdvisorPage"],
    version: "1.0.0",
    inputFields: ["company", "question", "context"],
    outputFormat: "text",
    systemPrompt: "B2B sirket danismani gibi net, kanitli ve uygulanabilir cevap ver. Bilmedigin noktayi varsayma.",
    userPromptTemplate: "Sirket:\n{{company}}\nSoru:\n{{question}}\nBaglam:\n{{context}}",
    safetyRules: [...realisticToneRules, "Finansal, hukuki veya ticari garantiler verme."],
  }),

  ANALYZE_COMPANY: prompt({
    id: "company.analysis.v1",
    name: "Sirket Analizi",
    description: "Sirket profilinden risk, firsat, sektor ve aksiyon ozeti uretir.",
    usedBy: ["analyze-company", "CompanyPage", "CompanyProfilePage"],
    version: "1.0.0",
    inputFields: ["companyProfile", "sectorSignals", "notes"],
    outputFormat: "json",
    systemPrompt: "Sirket analisti gibi kanita dayali, realist ve riskleri acik rapor uret.",
    userPromptTemplate: "Sirket profili:\n{{companyProfile}}\nSektor sinyalleri:\n{{sectorSignals}}\nNotlar:\n{{notes}}",
    expectedOutput: "JSON company analysis",
    safetyRules: [...realisticToneRules, "Kaynak yoksa guncel veri varmis gibi davranma."],
  }),

  ANALYZE_MEMBER_PROFILE: prompt({
    id: "member.profile.v1",
    name: "Uye Profili Analizi",
    description: "Uye/kullanici verisinden takim, rol ve gelisim ozeti cikarir.",
    usedBy: ["member-profile", "MemberDetailPage"],
    version: "1.0.0",
    inputFields: ["memberProfile", "activity", "notes"],
    outputFormat: "json",
    systemPrompt: "Uye profilini verilen kanita gore ozetle; hassas veya ayrimci cikarim yapma.",
    userPromptTemplate: "Uye profili:\n{{memberProfile}}\nAktivite:\n{{activity}}\nNotlar:\n{{notes}}",
    expectedOutput: "JSON member profile analysis",
    safetyRules: [...decisionSupportRules],
  }),

  TRANSCRIPTION_CLEANUP: prompt({
    id: "transcription.cleanup.v1",
    name: "Transkript Temizleme",
    description: "Ham transkripti anlam bozmadan Turkce noktalama, konusmaci ve okunabilirlik icin temizler.",
    usedBy: ["transcribe-recording"],
    version: "1.0.0",
    inputFields: ["rawTranscript", "participants", "recordingInfo"],
    outputFormat: "json",
    systemPrompt: "Ham transkripti temizle; yeni bilgi, isim, deneyim veya cevap uydurma.",
    userPromptTemplate: "Ham transkript:\n{{rawTranscript}}\nKatilimcilar: {{participants}}\nBaglam:\n{{recordingInfo}}",
    expectedOutput: "JSON: { transcript, segments, warnings }",
    safetyRules: [
      "Duyulmayan veya verilmeyen cumleleri ekleme.",
      "Placeholder veya ornek icerigi gercek transkript gibi sunma.",
      "Degisiklik varsa warnings alaninda belirt.",
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
    throw new Error(`Prompt bulunamadi: ${key}`);
  }
  return resolved as PromptKey;
};

export const getPrompt = (key: string) => PROMPTS[assertPromptExists(key)];
