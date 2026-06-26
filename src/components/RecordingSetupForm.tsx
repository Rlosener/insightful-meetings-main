import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RecordingInfo, InterviewQuestion, InterviewSetupConfig } from "@/types/recording";
import { Users, Briefcase, ArrowRight, Plus, X, Sparkles, Loader2, UserCheck, MonitorPlay, Camera, Video, FileText, Play, BarChart3, AlertCircle, Upload, Brain, Settings2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import CustomQuestionsManager from "@/components/CustomQuestionsManager";
import ZoomImportSection from "@/components/ZoomImportSection";

const QUESTION_BANK: Record<string, string[]> = {
  genel: [
    "Kendinizi kısaca tanıtır mısınız?",
    "Bu pozisyona neden başvurdunuz?",
    "5 yıl içinde kendinizi nerede görüyorsunuz?",
    "En büyük güçlü ve zayıf yönleriniz nelerdir?",
    "Stresli durumlarda nasıl çalışırsınız?",
    "Ekip çalışmasına yaklaşımınız nedir?",
  ],
  teknik: [
    "Daha önce çalıştığınız en karmaşık projeyi anlatır mısınız?",
    "Problem çözme yaklaşımınızı bir örnekle açıklar mısınız?",
    "Bu alandaki son teknolojik gelişmeleri nasıl takip ediyorsunuz?",
    "Daha önce karşılaştığınız en zor teknik sorunu nasıl çözdünüz?",
  ],
  davranışsal: [
    "Bir ekip arkadaşınızla anlaşmazlık yaşadığınız bir durumu anlatır mısınız?",
    "Baskı altında verdiğiniz en iyi kararı paylaşır mısınız?",
    "Başarısız olduğunuz bir projeyi ve çıkardığınız dersleri anlatır mısınız?",
    "Liderlik deneyiminizden bir örnek paylaşır mısınız?",
  ],
  yönetici: [
    "Ekibinizi nasıl motive edersiniz?",
    "Performans değerlendirmesine yaklaşımınız nedir?",
    "Zor bir çalışanla nasıl başa çıkarsınız?",
  ],
  frontend: [
    "React ve state management yaklaşımınız nedir?",
    "Performans optimizasyonu için hangi teknikleri kullanırsınız?",
    "Component mimarisi konusundaki yaklaşımınız nedir?",
  ],
  backend: [
    "API tasarım prensipleriniz nelerdir?",
    "Veritabanı optimizasyonu konusundaki deneyiminiz nedir?",
    "Microservices mimarisine yaklaşımınız nedir?",
  ],
  tasarım: [
    "Kullanıcı araştırma sürecinizi anlatır mısınız?",
    "Design system oluşturma deneyiminiz var mı?",
    "Bir projenin UX sürecini baştan sona anlatır mısınız?",
  ],
};

function generateQuestions(position: string, department: string, skills: string[]): InterviewQuestion[] {
  const combined = (position + " " + department + " " + skills.join(" ")).toLowerCase();
  const questions: InterviewQuestion[] = [];

  QUESTION_BANK.genel.forEach((q) => questions.push({ category: "Genel", question: q }));

  if (combined.match(/frontend|react|vue|angular|css|html|ui|arayüz/)) {
    QUESTION_BANK.frontend.forEach((q) => questions.push({ category: "Frontend", question: q }));
  }
  if (combined.match(/backend|api|node|java|python|php|sunucu|server/)) {
    QUESTION_BANK.backend.forEach((q) => questions.push({ category: "Backend", question: q }));
  }
  if (combined.match(/tasarım|design|ux|ui|grafik|figma/)) {
    QUESTION_BANK.tasarım.forEach((q) => questions.push({ category: "Tasarım", question: q }));
  }
  if (combined.match(/müdür|yönetici|lead|manager|direktör|başkan/)) {
    QUESTION_BANK.yönetici.forEach((q) => questions.push({ category: "Yöneticilik", question: q }));
  }

  QUESTION_BANK.teknik.forEach((q) => questions.push({ category: "Teknik", question: q }));
  QUESTION_BANK.davranışsal.forEach((q) => questions.push({ category: "Davranışsal", question: q }));

  questions.push({ category: "Pozisyona Özel", question: `${position} pozisyonunda en çok hangi zorluklarla karşılaşmayı bekliyorsunuz?` });
  questions.push({ category: "Pozisyona Özel", question: `${position} rolünde başarılı olmak için en kritik yetkinlik nedir sizce?` });
  if (skills.length > 0) {
    questions.push({ category: "Pozisyona Özel", question: `${skills[0]} konusundaki deneyiminizi somut bir projeyle anlatır mısınız?` });
  }
  if (skills.length > 1) {
    questions.push({ category: "Pozisyona Özel", question: `${skills[1]} ile ilgili karşılaştığınız en zorlu problemi nasıl çözdünüz?` });
  }

  return questions;
}

interface CompanyMember {
  id: string;
  full_name: string;
  position: string | null;
  department: string | null;
}

interface Props {
  onSubmit: (info: RecordingInfo) => void;
}

const RecordingSetupForm = ({ onSubmit }: Props) => {
  const navigate = useNavigate();
  const [type, setType] = useState<"mülakat" | "toplantı" | null>(null);
  const [source, setSource] = useState<"live" | "zoom" | "google-meet" | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [behavioralAnalysis, setBehavioralAnalysis] = useState<boolean | null>(null);

  // Company members
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Toplantı state
  const [meetingTopic, setMeetingTopic] = useState("");
  const [meetingAgenda, setMeetingAgenda] = useState("");
  const [participantInput, setParticipantInput] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);

  // Mülakat state
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateSurname, setCandidateSurname] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [candidateCurrentRole, setCandidateCurrentRole] = useState("");
  const [candidateExperience, setCandidateExperience] = useState("");
  const [candidateEducation, setCandidateEducation] = useState("");
  const [candidateNotes, setCandidateNotes] = useState("");

  // Interview config state
  const [difficultyLevel, setDifficultyLevel] = useState<"easy" | "medium" | "hard">("medium");
  const [interviewStyle, setInterviewStyle] = useState<"formal" | "conversational" | "challenging" | "executive">("formal");
  const [aiQuestionCount, setAiQuestionCount] = useState(12);
  const [includeCustomQuestions, setIncludeCustomQuestions] = useState(false);
  const [customQuestions, setCustomQuestions] = useState<InterviewQuestion[]>([]);
  const [useAIQuestions, setUseAIQuestions] = useState(true);
  // Google Meet state
  const [gmeetTranscript, setGmeetTranscript] = useState("");
  const [gmeetTopic, setGmeetTopic] = useState("");
  const [gmeetFile, setGmeetFile] = useState<File | null>(null);
  const [gmeetFileUploading, setGmeetFileUploading] = useState(false);
  const [gmeetAnalyzing, setGmeetAnalyzing] = useState(false);
  const [gmeetParticipantInput, setGmeetParticipantInput] = useState("");
  const [gmeetParticipants, setGmeetParticipants] = useState<string[]>([]);
  const [gmeetDuration, setGmeetDuration] = useState("");
  const [gmeetTranscriptFile, setGmeetTranscriptFile] = useState<File | null>(null);

  useEffect(() => {
    if (type === "toplantı") {
      fetchCompanyMembers();
    }
  }, [type]);

  const fetchCompanyMembers = async () => {
    setMembersLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("company_members")
        .select("id, full_name, position, department")
        .eq("user_id", user.id)
        .order("full_name");
      setCompanyMembers(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setMembersLoading(false);
    }
  };

  const toggleMember = (id: string, name: string) => {
    if (selectedMemberIds.includes(id)) {
      setSelectedMemberIds(prev => prev.filter(m => m !== id));
      setParticipants(prev => prev.filter(p => p !== name));
    } else {
      setSelectedMemberIds(prev => [...prev, id]);
      if (!participants.includes(name)) {
        setParticipants(prev => [...prev, name]);
      }
    }
  };

  const addParticipant = () => {
    if (participantInput.trim()) {
      setParticipants([...participants, participantInput.trim()]);
      setParticipantInput("");
    }
  };

  const addSkill = () => {
    if (skillInput.trim()) {
      setRequiredSkills([...requiredSkills, skillInput.trim()]);
      setSkillInput("");
    }
  };

  const removeParticipant = (index: number) => {
    const name = participants[index];
    setParticipants(participants.filter((_, j) => j !== index));
    // Also deselect from company members if matching
    const member = companyMembers.find(m => m.full_name === name);
    if (member) {
      setSelectedMemberIds(prev => prev.filter(id => id !== member.id));
    }
  };

  const isBehavioralEnabled = behavioralAnalysis ?? (type === "mülakat");

  const handleSubmit = async () => {
    if (type === "toplantı") {
      onSubmit({ type, meetingTopic, meetingAgenda, participants, behavioralAnalysis: isBehavioralEnabled });
    } else if (type === "mülakat") {
      setIsAnalyzing(true);
      try {
        let allQuestions: InterviewQuestion[] = [];
        
        if (useAIQuestions) {
          // Call AI to generate questions
          const result = await invokeEdgeFunction(EDGE_FUNCTIONS.GENERATE_QUESTIONS, {
            position,
            department,
            experienceYears,
            skills: requiredSkills,
            difficulty: difficultyLevel,
            interviewStyle,
            questionCount: aiQuestionCount,
          });
          
          if (result.error) {
            toast.error(getErrorToastMessage(result.error));
            setIsAnalyzing(false);
            return;
          }
          if (result.data?.questions) {
            allQuestions = result.data.questions.map((q: InterviewQuestion) => ({
              ...q,
              isCustom: false,
            }));
          }
        }

        // Merge custom questions
        if (includeCustomQuestions && customQuestions.length > 0) {
          allQuestions = [...allQuestions, ...customQuestions];
        }
        
        // Fallback to local generation if AI fails
        if (allQuestions.length === 0) {
          allQuestions = generateQuestions(position, department, requiredSkills);
        }

        const config: InterviewSetupConfig = {
          difficultyLevel,
          interviewStyle,
          aiQuestionCount,
          includeCustomQuestions,
        };

        onSubmit({
          type,
          position,
          department,
          requiredSkills,
          experienceYears,
          candidateName,
          candidateSurname,
          candidateEmail,
          candidatePhone,
          candidateCurrentRole,
          candidateExperience,
          candidateEducation,
          candidateNotes,
          suggestedQuestions: allQuestions,
          behavioralAnalysis: isBehavioralEnabled,
          interviewConfig: config,
        });
      } catch (error: unknown) {
        console.error("Question generation error:", error);
        toast.error("AI soruları üretilirken hata oluştu, yerel sorular kullanılıyor");
        const fallbackQuestions = generateQuestions(position, department, requiredSkills);
        onSubmit({
          type,
          position,
          department,
          requiredSkills,
          experienceYears,
          candidateName,
          candidateSurname,
          candidateEmail,
          candidatePhone,
          candidateCurrentRole,
          candidateExperience,
          candidateEducation,
          candidateNotes,
          suggestedQuestions: fallbackQuestions,
          behavioralAnalysis: isBehavioralEnabled,
        });
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const isValid =
    type === "toplantı"
      ? meetingTopic.trim()
      : type === "mülakat"
        ? position.trim() && candidateName.trim()
        : false;

  // Google Meet helpers
  const parseVttToText = (vtt: string): string => {
    const lines = vtt.split("\n");
    const textLines: string[] = [];
    let currentSpeaker = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "WEBVTT" || trimmed.match(/^\d{2}:\d{2}/) || trimmed.match(/^NOTE/)) continue;
      if (/^\d+$/.test(trimmed)) continue;
      const speakerMatch = trimmed.match(/^(.+?):\s*(.*)$/);
      if (speakerMatch) {
        const speaker = speakerMatch[1];
        const text = speakerMatch[2];
        if (speaker !== currentSpeaker) {
          currentSpeaker = speaker;
          textLines.push(`\n[${speaker}]: ${text}`);
        } else {
          textLines.push(text);
        }
      } else {
        textLines.push(trimmed);
      }
    }
    return textLines.join(" ").replace(/\s+/g, " ").trim();
  };

  const handleGmeetTranscriptFile = async (file: File) => {
    setGmeetTranscriptFile(file);
    const text = await file.text();
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "vtt" || ext === "srt") {
      setGmeetTranscript(parseVttToText(text));
    } else {
      setGmeetTranscript(text);
    }
    toast.success("Transkript dosyası yüklendi!");
  };

  const handleGmeetVideoFile = (file: File) => {
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      toast.error("Dosya boyutu 50MB'dan büyük olamaz");
      return;
    }
    setGmeetFile(file);
    toast.success(`${file.name} seçildi`);
  };

  const addGmeetParticipant = () => {
    if (gmeetParticipantInput.trim()) {
      setGmeetParticipants(prev => [...prev, gmeetParticipantInput.trim()]);
      setGmeetParticipantInput("");
    }
  };

  const analyzeGmeetAndSave = async () => {
    if (!gmeetTranscript.trim()) {
      toast.error("Lütfen bir transkript girin veya yükleyin");
      return;
    }
    setGmeetAnalyzing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");

      let videoUrl: string | null = null;
      // Upload video file if exists
      if (gmeetFile) {
        setGmeetFileUploading(true);
        const filePath = `${user.id}/${Date.now()}_${gmeetFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("recordings")
          .upload(filePath, gmeetFile);
        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.warning("Video yüklenemedi, analiz transkript ile devam edecek");
        } else {
          videoUrl = filePath;
        }
        setGmeetFileUploading(false);
      }

      const { data: recording, error: saveError } = await supabase
        .from("recordings")
        .insert({
          title: gmeetTopic || "Google Meet Toplantısı",
          type: type || "toplantı",
          transcript: gmeetTranscript,
          user_id: user.id,
          duration: gmeetDuration || null,
          video_url: videoUrl,
          summary: `Google Meet'ten içe aktarıldı. Katılımcı: ${gmeetParticipants.length}`,
        })
        .select()
        .single();
      if (saveError) throw saveError;

      const recordingInfo = type === "mülakat"
        ? { type: "mülakat" }
        : { type: "toplantı", meetingTopic: gmeetTopic, participants: gmeetParticipants };

      const { data: analysisData, error: analysisError } = await invokeEdgeFunction(
        EDGE_FUNCTIONS.ANALYZE_INTERVIEW,
        { transcript: gmeetTranscript, recordingInfo },
      );
      if (analysisError) throw new Error(getErrorToastMessage(analysisError));
      if (analysisData?.error) throw new Error(analysisData.error);

      await supabase.from("recordings").update({ analysis_data: analysisData.analysis }).eq("id", recording.id);
      toast.success("Analiz tamamlandı!");
      navigate(`/dashboard/meetings/${recording.id}`);
    } catch (error: unknown) {
      console.error("Google Meet analysis error:", error);
      toast.error(error instanceof Error ? error.message : "Analiz sırasında hata oluştu");
    } finally {
      setGmeetAnalyzing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  if (!type) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-semibold mb-2">Kayıt Türü Seçin</h2>
          <p className="text-sm text-muted-foreground">Yapacağınız kaydın türünü seçin, buna göre analiz yapılacak</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => setType("toplantı")}
            className="group rounded-xl border-2 border-border bg-card p-8 text-left hover:border-primary/50 transition-all duration-200"
          >
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:shadow-glow transition-shadow">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-display text-lg font-semibold mb-1">Toplantı</h3>
            <p className="text-sm text-muted-foreground">Ekip toplantısı, sprint değerlendirmesi, proje toplantısı vb.</p>
          </button>
          <button
            onClick={() => setType("mülakat")}
            className="group rounded-xl border-2 border-border bg-card p-8 text-left hover:border-accent/50 transition-all duration-200"
          >
            <div className="h-14 w-14 rounded-xl bg-accent/10 flex items-center justify-center mb-4 group-hover:shadow-glow transition-shadow">
              <Briefcase className="h-7 w-7 text-accent" />
            </div>
            <h3 className="font-display text-lg font-semibold mb-1">Mülakat</h3>
            <p className="text-sm text-muted-foreground">İş görüşmesi, aday değerlendirmesi, teknik mülakat vb.</p>
          </button>
        </div>
      </div>
    );
  }

  // Source selection: Live recording or Zoom import
  if (!source) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold mb-1">Kaynak Seçin</h2>
            <p className="text-sm text-muted-foreground">
              {type === "toplantı" ? "Toplantı" : "Mülakat"} kaydını nasıl eklemek istiyorsunuz?
            </p>
          </div>
          <button onClick={() => { setType(null); setSource(null); }} className="text-sm text-muted-foreground hover:text-foreground">
            ← Tür Değiştir
          </button>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <button
            onClick={() => setSource("live")}
            className="group rounded-xl border-2 border-border bg-card p-6 text-left hover:border-primary/50 transition-all duration-200"
          >
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:shadow-glow transition-shadow">
              <Camera className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-display text-base font-semibold mb-1">Anlık Kayıt</h3>
            <p className="text-xs text-muted-foreground">Kamera ile canlı kayıt yapın</p>
          </button>
          <button
            onClick={() => setSource("zoom")}
            className="group rounded-xl border-2 border-border bg-card p-6 text-left hover:border-accent/50 transition-all duration-200"
          >
            <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center mb-3 group-hover:shadow-glow transition-shadow">
              <MonitorPlay className="h-6 w-6 text-accent" />
            </div>
            <h3 className="font-display text-base font-semibold mb-1">Zoom</h3>
            <p className="text-xs text-muted-foreground">Kayıt ve transkript yükleyin</p>
          </button>
          <button
            onClick={() => setSource("google-meet")}
            className="group rounded-xl border-2 border-border bg-card p-6 text-left hover:border-primary/50 transition-all duration-200"
          >
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:shadow-glow transition-shadow">
              <Video className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-display text-base font-semibold mb-1">Google Meet</h3>
            <p className="text-xs text-muted-foreground">Kayıt ve transkript yükleyin</p>
          </button>
        </div>
      </div>
    );
  }

  // Zoom import UI
  if (source === "zoom") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold mb-1">Zoom'dan İçe Aktar</h2>
            <p className="text-sm text-muted-foreground">
              Zoom {type === "toplantı" ? "toplantı" : "mülakat"} kayıt ve transkript dosyasını yükleyip AI ile analiz edin
            </p>
          </div>
          <button onClick={() => setSource(null)} className="text-sm text-muted-foreground hover:text-foreground">
            ← Kaynak Değiştir
          </button>
        </div>
        <ZoomImportSection />
      </div>
    );
  }

  // Google Meet import UI
  if (source === "google-meet") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold mb-1">Google Meet'ten İçe Aktar</h2>
            <p className="text-sm text-muted-foreground">
              Google Meet {type === "toplantı" ? "toplantı" : "mülakat"} kaydını yükleyin ve AI ile analiz edin
            </p>
          </div>
          <button onClick={() => setSource(null)} className="text-sm text-muted-foreground hover:text-foreground">
            ← Kaynak Değiştir
          </button>
        </div>

        {/* Meeting Info */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" />
            Toplantı Bilgileri
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Toplantı Başlığı</Label>
              <Input
                placeholder="örn. Haftalık Sprint Toplantısı"
                value={gmeetTopic}
                onChange={(e) => setGmeetTopic(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Süre</Label>
              <Input
                placeholder="örn. 45 dk"
                value={gmeetDuration}
                onChange={(e) => setGmeetDuration(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Katılımcılar</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Katılımcı adı"
                value={gmeetParticipantInput}
                onChange={(e) => setGmeetParticipantInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addGmeetParticipant())}
              />
              <Button variant="secondary" size="icon" onClick={addGmeetParticipant} type="button">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {gmeetParticipants.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {gmeetParticipants.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-secondary text-secondary-foreground px-3 py-1 rounded-full">
                    {p}
                    <button onClick={() => setGmeetParticipants(prev => prev.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Video Upload */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Kayıt Dosyası (Opsiyonel)
          </h3>
          <p className="text-xs text-muted-foreground">
            Google Meet kaydını Google Drive'dan indirip buraya yükleyebilirsiniz. Maksimum 50MB.
          </p>
          <div className="relative">
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={(e) => e.target.files?.[0] && handleGmeetVideoFile(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${gmeetFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
              {gmeetFile ? (
                <div className="flex items-center justify-center gap-2">
                  <Play className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{gmeetFile.name}</span>
                  <span className="text-xs text-muted-foreground">({formatFileSize(gmeetFile.size)})</span>
                </div>
              ) : (
                <div>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Video veya ses dosyası sürükleyin veya tıklayın</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Transkript *
          </h3>

          <div className="space-y-2">
            <Label>Transkript Dosyası Yükle (VTT, SRT veya TXT)</Label>
            <p className="text-xs text-muted-foreground">
              Google Meet transkriptini Google Drive'daki "Meet Recordings" klasöründe bulabilirsiniz.
            </p>
            <div className="relative">
              <input
                type="file"
                accept=".vtt,.srt,.txt,.doc,.docx"
                onChange={(e) => e.target.files?.[0] && handleGmeetTranscriptFile(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <Button variant="outline" className="w-full">
                <Upload className="h-4 w-4 mr-2" />
                {gmeetTranscriptFile ? gmeetTranscriptFile.name : "Transkript Dosyası Seç"}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">veya</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-2">
            <Label>Manuel Transkript Yapıştır</Label>
            <Textarea
              placeholder={"Toplantı transkriptini buraya yapıştırın...\n\n[Konuşmacı 1]: Merhaba, toplantıya hoş geldiniz...\n[Konuşmacı 2]: Teşekkürler, bugünkü gündemimiz..."}
              value={gmeetTranscript}
              onChange={(e) => setGmeetTranscript(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          {gmeetTranscript && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <FileText className="h-4 w-4" />
              <span>Transkript hazır ({gmeetTranscript.length} karakter)</span>
            </div>
          )}
        </div>

        <Button
          variant="hero"
          className="w-full"
          onClick={analyzeGmeetAndSave}
          disabled={gmeetAnalyzing || !gmeetTranscript.trim() || gmeetFileUploading}
        >
          {gmeetFileUploading ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Dosya Yükleniyor...</>
          ) : gmeetAnalyzing ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analiz Ediliyor...</>
          ) : (
            <><BarChart3 className="h-4 w-4 mr-2" /> Donebird AI ile Analiz Et</>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold mb-1">
            {type === "toplantı" ? "Toplantı Bilgileri" : "Mülakat Bilgileri"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {type === "toplantı" ? "Toplantı detaylarını girin" : "Pozisyon ve aday bilgilerini girin, AI sorularını hazırlasın"}
          </p>
        </div>
        <button onClick={() => { setType(null); setSource(null); }} className="text-sm text-muted-foreground hover:text-foreground">
          ← Tür Değiştir
        </button>
      </div>

      {type === "toplantı" ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-card">
          <div className="space-y-2">
            <Label>Toplantı Konusu *</Label>
            <Input placeholder="örn. Haftalık Sprint Değerlendirmesi" value={meetingTopic} onChange={(e) => setMeetingTopic(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Gündem</Label>
            <Textarea placeholder="Toplantıda konuşulacak konuları yazın..." value={meetingAgenda} onChange={(e) => setMeetingAgenda(e.target.value)} rows={3} />
          </div>

          {/* Company Members Selection */}
          {companyMembers.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" />
                Şirket Personelinden Seç
              </Label>
              <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-48 overflow-y-auto space-y-1">
                {membersLoading ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  companyMembers.map(member => (
                    <label
                      key={member.id}
                      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60 transition-colors cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedMemberIds.includes(member.id)}
                        onCheckedChange={() => toggleMember(member.id, member.full_name)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{member.full_name}</span>
                        {member.position && (
                          <span className="text-xs text-muted-foreground ml-2">• {member.position}</span>
                        )}
                      </div>
                      {member.department && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground shrink-0">
                          {member.department}
                        </span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Manuel Katılımcı Ekle</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Katılımcı adı"
                value={participantInput}
                onChange={(e) => setParticipantInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addParticipant())}
              />
              <Button variant="secondary" size="icon" onClick={addParticipant} type="button">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {participants.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {participants.map((p, i) => {
                  const isFromCompany = companyMembers.some(m => m.full_name === p);
                  return (
                    <span key={i} className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full ${isFromCompany ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                      {isFromCompany && <UserCheck className="h-3 w-3" />}
                      {p}
                      <button onClick={() => removeParticipant(i)}>
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pozisyon Bilgileri */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
            <h3 className="font-display font-semibold text-primary flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Pozisyon Bilgileri
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Aranan Pozisyon *</Label>
                <Input placeholder="örn. Kıdemli Frontend Geliştirici" value={position} onChange={(e) => setPosition(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Departman</Label>
                <Input placeholder="örn. Yazılım Geliştirme" value={department} onChange={(e) => setDepartment(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Aranan Minimum Deneyim</Label>
              <Input placeholder="örn. 3 yıl" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Aranan Yetenekler</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Yetenek ekleyin"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                />
                <Button variant="secondary" size="icon" onClick={addSkill} type="button">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {requiredSkills.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {requiredSkills.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-3 py-1 rounded-full">
                      {s}
                      <button onClick={() => setRequiredSkills(requiredSkills.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Aday Bilgileri */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
            <h3 className="font-display font-semibold text-accent flex items-center gap-2">
              <Users className="h-4 w-4" /> Aday Bilgileri
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ad *</Label>
                <Input placeholder="Adayın adı" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Soyad</Label>
                <Input placeholder="Adayın soyadı" value={candidateSurname} onChange={(e) => setCandidateSurname(e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-posta</Label>
                <Input type="email" placeholder="aday@email.com" value={candidateEmail} onChange={(e) => setCandidateEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input placeholder="+90 5XX XXX XX XX" value={candidatePhone} onChange={(e) => setCandidatePhone(e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mevcut Pozisyon</Label>
                <Input placeholder="Şu anki rolü" value={candidateCurrentRole} onChange={(e) => setCandidateCurrentRole(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Deneyim Süresi</Label>
                <Input placeholder="örn. 5 yıl" value={candidateExperience} onChange={(e) => setCandidateExperience(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Eğitim</Label>
              <Input placeholder="örn. Bilgisayar Mühendisliği - İTÜ" value={candidateEducation} onChange={(e) => setCandidateEducation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ek Notlar</Label>
              <Textarea placeholder="Aday hakkında ek bilgiler, referanslar, portfolyo linki vb." value={candidateNotes} onChange={(e) => setCandidateNotes(e.target.value)} rows={3} />
            </div>
          </div>

          {/* Interview Configuration */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
            <h3 className="font-display font-semibold text-primary flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Mülakat Ayarları
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Zorluk Seviyesi</Label>
                <Select value={difficultyLevel} onValueChange={(v) => setDifficultyLevel(v as "easy" | "medium" | "hard")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Kolay — Giriş seviyesi</SelectItem>
                    <SelectItem value="medium">Orta — Deneyimli adaylar</SelectItem>
                    <SelectItem value="hard">Zor — Üst düzey pozisyonlar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mülakat Tarzı</Label>
                <Select value={interviewStyle} onValueChange={(v) => setInterviewStyle(v as "formal" | "conversational" | "challenging" | "executive")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">Resmi & Profesyonel</SelectItem>
                    <SelectItem value="conversational">Samimi & Doğal</SelectItem>
                    <SelectItem value="challenging">Zorlayıcı & Provokatif</SelectItem>
                    <SelectItem value="executive">Üst Yönetim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>AI Soru Sayısı</Label>
                <Select value={String(aiQuestionCount)} onValueChange={(v) => setAiQuestionCount(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[8, 10, 12, 15, 20].map(n => (
                      <SelectItem key={n} value={String(n)}>{n} soru</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">AI ile Soru Üret</Label>
                  <Switch checked={useAIQuestions} onCheckedChange={setUseAIQuestions} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Özel Soruları Dahil Et</Label>
                  <Switch checked={includeCustomQuestions} onCheckedChange={setIncludeCustomQuestions} />
                </div>
              </div>
            </div>
          </div>

          {/* Custom Questions */}
          {includeCustomQuestions && (
            <CustomQuestionsManager
              customQuestions={customQuestions}
              onQuestionsChange={setCustomQuestions}
            />
          )}
        </div>
      )}

      {/* BİVEYOS Toggle — Premium */}
      <div className="relative rounded-xl overflow-hidden">
        <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-primary/40 via-accent/40 to-primary/40 opacity-70" />
        <div className="relative rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.03] via-card to-accent/[0.03] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 shadow-lg">
                <Brain className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-display font-semibold text-sm">BİVEYOS — Davranış Analizi</span>
                  <Badge className="text-[9px] px-1.5 py-0 bg-gradient-to-r from-primary to-accent text-primary-foreground border-0 shadow-sm">
                    Premium Analiz
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ses tonu, beden dili, güven seviyesi ve duygusal göstergeleri gelişmiş AI ile analiz eder.
                  {isBehavioralEnabled && (
                    <span className="text-primary font-medium"> Aktif — gelişmiş davranışsal analiz çalışacak.</span>
                  )}
                </p>
                {/* Usage indicator + tooltip */}
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/50 border border-border">
                    <Sparkles className="h-3 w-3 text-accent" />
                    <span className="text-[10px] text-muted-foreground font-medium">Bu ay: <span className="text-foreground font-bold">3</span> / 10 analiz</span>
                  </div>
                  <div className="group relative">
                    <div className="flex items-center gap-1 cursor-help">
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Nedir?</span>
                    </div>
                    <div className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg bg-popover border border-border shadow-lg text-[11px] text-popover-foreground w-64 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                      <p className="font-semibold mb-1">BİVEYOS Premium Analiz</p>
                      <p className="text-muted-foreground">Gelişmiş AI modelleri kullanarak ses tonu, konuşma hızı, beden dili, göz teması ve duygusal göstergeleri analiz eder. Standart analizden çok daha derin içgörüler sunar.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <Switch
              checked={isBehavioralEnabled}
              onCheckedChange={(checked) => setBehavioralAnalysis(checked)}
            />
          </div>
        </div>
      </div>

      <Button variant="hero" size="lg" onClick={handleSubmit} disabled={!isValid || isAnalyzing} className="w-full">
        {isAnalyzing ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> AI Soruları Hazırlıyor...
          </>
        ) : type === "mülakat" ? (
          <>
            <Sparkles className="mr-2 h-5 w-5" /> Analiz Et ve Soruları Hazırla
          </>
        ) : (
          <>
            Kayda Geç
            <ArrowRight className="ml-2 h-5 w-5" />
          </>
        )}
      </Button>
    </div>
  );
};

export default RecordingSetupForm;
