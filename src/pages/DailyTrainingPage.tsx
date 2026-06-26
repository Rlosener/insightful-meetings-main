import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2, Zap, CheckCircle2, ArrowLeft, ArrowRight, Target, TrendingUp,
  Brain, Flame, XCircle, User, Send, Building2, Sparkles, BookOpen, MessageSquare,
  RotateCcw, Plus, Calendar, ChevronDown, ChevronUp, History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { toast } from "sonner";

interface TrainingQuestion {
  id: number;
  type: "mcq" | "text";
  question: string;
  focus_area: string;
  options: string[] | null;
  correct_answer: number | null;
  explanation: string;
}

interface TrainingGoal {
  [key: string]: string | undefined;
  type: "career" | "skill" | "interview";
  company?: string;
  position?: string;
  skillFocus?: string;
}

interface PastSession {
  id: string;
  training_date: string;
  created_at: string;
  score: number | null;
  completed: boolean;
  streak_count: number | null;
  questions: any;
  answers: any;
  feedback: any;
}

type PageStep = "loading" | "no-profile" | "goal-select" | "quiz" | "analyzing" | "results" | "history-detail";

const DailyTrainingPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<PageStep>("loading");
  const [activeTab, setActiveTab] = useState<"training" | "history">("training");
  const [goal, setGoal] = useState<TrainingGoal | null>(null);
  const [companyInput, setCompanyInput] = useState("");
  const [positionInput, setPositionInput] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [motivation, setMotivation] = useState("");
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, number>>({});
  const [textAnswers, setTextAnswers] = useState<Record<number, string>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [answered, setAnswered] = useState<Set<number>>(new Set());
  const [streakCount, setStreakCount] = useState(0);
  const [totalScore, setTotalScore] = useState<number | null>(null);
  const [savedFeedback, setSavedFeedback] = useState<any>(null);
  const [savedAnswers, setSavedAnswers] = useState<any>(null);
  const [detailedAnalysis, setDetailedAnalysis] = useState<any>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [pastSessions, setPastSessions] = useState<PastSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedSession, setSelectedSession] = useState<PastSession | null>(null);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [currentTrainingId, setCurrentTrainingId] = useState<string | null>(null);

  const init = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("career_profiles")
      .select("target_role, skills, career_readiness_score, ai_insights")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile || !profile.target_role) {
      setStep("no-profile");
      return;
    }

    setProfileData(profile);

    // Get last completed score for comparison
    const { data: lastCompleted } = await supabase
      .from("daily_training")
      .select("score")
      .eq("user_id", user.id)
      .eq("completed", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastCompleted) setPreviousScore(lastCompleted.score);

    setStep("goal-select");
  }, []);

  useEffect(() => { void init(); }, [init]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("daily_training")
      .select("*")
      .eq("user_id", user.id)
      .eq("completed", true)
      .order("created_at", { ascending: false })
      .limit(50);

    setPastSessions((data as PastSession[]) || []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    if (activeTab === "history") void loadHistory();
  }, [activeTab, loadHistory]);

  const selectGoal = (type: TrainingGoal["type"]) => {
    if (type === "career") {
      setGoal({ type: "career" });
    } else if (type === "skill") {
      if (!skillInput.trim()) { toast.error("Geliştirmek istediğin yeteneği yaz"); return; }
      setGoal({ type: "skill", skillFocus: skillInput.trim() });
    } else if (type === "interview") {
      if (!companyInput.trim() || !positionInput.trim()) { toast.error("Şirket ve pozisyon bilgisi gerekli"); return; }
      setGoal({ type: "interview", company: companyInput.trim(), position: positionInput.trim() });
    }
  };

  const resetForNewTraining = () => {
    setGoal(null);
    setQuestions([]);
    setCurrentQ(0);
    setMcqAnswers({});
    setTextAnswers({});
    setShowExplanation(false);
    setAnswered(new Set());
    setTotalScore(null);
    setSavedFeedback(null);
    setSavedAnswers(null);
    setDetailedAnalysis(null);
    setCurrentTrainingId(null);
    setCompanyInput("");
    setPositionInput("");
    setSkillInput("");
    setStep("goal-select");
  };

  const retryTraining = () => {
    // Keep same questions, reset answers
    setCurrentQ(0);
    setMcqAnswers({});
    setTextAnswers({});
    setShowExplanation(false);
    setAnswered(new Set());
    setTotalScore(null);
    setSavedFeedback(null);
    setSavedAnswers(null);
    setDetailedAnalysis(null);
    setCurrentTrainingId(null);
    setStep("quiz");
  };

  const generateTraining = useCallback(async (userId: string, profile: any) => {
    try {
      const [practicesRes, streakRes] = await Promise.all([
        supabase.from("practice_interviews").select("character_analysis, analysis_data")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
        supabase.from("daily_training").select("training_date, completed")
          .eq("user_id", userId).eq("completed", true).order("training_date", { ascending: false }).limit(30),
      ]);

      const practices = practicesRes.data || [];
      const pastTrainings = streakRes.data || [];

      let streak = 0;
      for (const t of pastTrainings) {
        const d = new Date(t.training_date);
        const expected = new Date();
        expected.setDate(expected.getDate() - streak - 1);
        if (d.toDateString() === expected.toDateString()) streak++;
        else break;
      }
      setStreakCount(streak);

      const scored = practices.filter((p: any) => p.character_analysis?.overall_score);
      const avgScore = scored.length > 0
        ? Math.round(scored.reduce((a: number, p: any) => a + (p.character_analysis?.overall_score || 0), 0) / scored.length)
        : 0;
      const weaknesses = [...new Set(scored.flatMap((p: any) => p.character_analysis?.weaknesses || []))].slice(0, 5);
      const strengths = [...new Set(scored.flatMap((p: any) => p.character_analysis?.strengths || []))].slice(0, 5);

      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.GENERATE_TRAINING, {
        targetRole: profile.target_role,
        skills: profile.skills,
        weaknesses,
        strengths,
        avgScore,
        practiceCount: practices.length,
        streakCount: streak,
        goal,
      });
      if (result.error) { toast.error(getErrorToastMessage(result.error)); return; }
      const data = result.data;

      setMotivation(data.motivation || "");
      setQuestions(data.questions || []);

      const today = new Date().toISOString().split("T")[0];
      const { data: inserted } = await supabase.from("daily_training").insert([{
        user_id: userId,
        training_date: today,
        daily_task: data.motivation,
        questions: data,
        streak_count: streak,
        answers: { goal: goal as Record<string, string | undefined> },
      }]).select("id").single();

      if (inserted) setCurrentTrainingId(inserted.id);

      setStep("quiz");
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes("Rate limit")) toast.error("İstek limiti aşıldı.");
      else toast.error("Günlük eğitim oluşturulamadı");
      setStep("goal-select");
    }
  }, [goal]);

  const startTraining = useCallback(async () => {
    setStep("loading");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !profileData) return;
    await generateTraining(user.id, profileData);
  }, [generateTraining, profileData]);

  useEffect(() => {
    if (goal && step === "goal-select") {
      void startTraining();
    }
  }, [goal, startTraining, step]);

  const currentQuestion = questions[currentQ];
  const isMcq = currentQuestion?.type === "mcq";
  const isAnswered = answered.has(currentQ);

  const selectMcq = (optionIdx: number) => {
    if (isAnswered) return;
    setMcqAnswers(prev => ({ ...prev, [currentQ]: optionIdx }));
    setAnswered(prev => new Set(prev).add(currentQ));
    setShowExplanation(true);
  };

  const submitText = () => {
    if (!textAnswers[currentQ]?.trim()) { toast.error("Cevabınızı yazın"); return; }
    setAnswered(prev => new Set(prev).add(currentQ));
    setShowExplanation(true);
  };

  const goNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setShowExplanation(answered.has(currentQ + 1));
    }
  };

  const goPrev = () => {
    if (currentQ > 0) {
      setCurrentQ(currentQ - 1);
      setShowExplanation(answered.has(currentQ - 1));
    }
  };

  const finishQuiz = async () => {
    setStep("analyzing");

    let correct = 0;
    let totalMcq = 0;
    questions.forEach((q, i) => {
      if (q.type === "mcq") {
        totalMcq++;
        if (mcqAnswers[i] === q.correct_answer) correct++;
      }
    });
    const score = totalMcq > 0 ? Math.round((correct / totalMcq) * 100) : 0;
    setTotalScore(score);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const fullAnswers = questions.map((q, i) => ({
      question: q.question,
      type: q.type,
      focus_area: q.focus_area,
      user_answer: q.type === "mcq" ? q.options?.[mcqAnswers[i]] || "" : textAnswers[i] || "",
      correct: q.type === "mcq" ? mcqAnswers[i] === q.correct_answer : null,
      correct_answer_text: q.type === "mcq" ? q.options?.[q.correct_answer || 0] || "" : null,
    }));

    try {
      const analysisResult = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_MICRO_TEST, {
        questions,
        answers: fullAnswers,
        targetRole: profileData?.target_role,
        goal,
        score,
        mcqCorrect: correct,
        mcqTotal: totalMcq,
        previousScore,
      });
      setDetailedAnalysis(analysisResult.data);

      const feedbackData = { correct, totalMcq, score, detailed_analysis: analysisResult.data };
      const answerData = { mcq: mcqAnswers, text: textAnswers, goal: goal as Record<string, string | undefined>, fullAnswers } as any;
      setSavedAnswers(answerData);
      setSavedFeedback(feedbackData);

      // Update or insert based on currentTrainingId
      if (currentTrainingId) {
        await supabase.from("daily_training")
          .update({ answers: answerData, feedback: feedbackData, score, completed: true })
          .eq("id", currentTrainingId);
      }

      // Update previousScore for next comparison
      setPreviousScore(score);
    } catch (e) {
      console.error("Analysis error:", e);
      const feedbackData = { correct, totalMcq, score };
      const answerData = { mcq: mcqAnswers, text: textAnswers, goal: goal as Record<string, string | undefined> } as any;
      setSavedAnswers(answerData);
      setSavedFeedback(feedbackData);
      if (currentTrainingId) {
        await supabase.from("daily_training")
          .update({ answers: answerData, feedback: feedbackData, score, completed: true })
          .eq("id", currentTrainingId);
      }
    }

    setStep("results");
    toast.success("Günlük eğitim tamamlandı! 🎉");
  };

  const openHistoryDetail = (session: PastSession) => {
    setSelectedSession(session);
    const q = session.questions;
    setQuestions(q?.questions || []);
    setGoal(session.answers?.goal || null);
    setTotalScore(session.score);
    setSavedFeedback(session.feedback);
    setSavedAnswers(session.answers);
    setDetailedAnalysis(session.feedback?.detailed_analysis);
    setStep("history-detail");
  };

  const allAnswered = answered.size === questions.length;
  const scoreColor = (s: number) => s >= 70 ? "text-primary" : s >= 40 ? "text-accent" : "text-destructive";

  const goalLabel = (g: TrainingGoal | null) => {
    if (!g) return "";
    if (g.type === "career") return "Kariyer Gelişimi";
    if (g.type === "skill") return `Yetenek: ${g.skillFocus}`;
    if (g.type === "interview") return `${g.company} — ${g.position}`;
    return "";
  };

  const scoreDiff = totalScore !== null && previousScore !== null && step === "results"
    ? totalScore - previousScore : null;

  // No Profile Gate
  if (step === "no-profile") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
          <User className="h-8 w-8 text-accent" />
        </div>
        <h1 className="font-display text-2xl font-bold">Kariyer Profilini Oluştur</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Günlük eğitim, hedef rolüne ve yeteneklerine göre kişiselleştirilir.
          <br />Başlamak için kariyer profilini oluşturman gerekiyor.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate("/individual")}>
            <ArrowLeft className="mr-2 h-4 w-4" />Geri
          </Button>
          <Link to="/individual/profile">
            <Button>
              <User className="mr-2 h-4 w-4" />Profil Oluştur
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Loading
  if (step === "loading") {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">Günlük eğitiminiz hazırlanıyor...</p>
      </div>
    );
  }

  // Analyzing
  if (step === "analyzing") {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-20">
        <Brain className="h-10 w-10 animate-pulse text-primary mb-4" />
        <p className="text-sm text-muted-foreground">Cevaplarınız analiz ediliyor...</p>
      </div>
    );
  }

  // History Detail View
  if (step === "history-detail" && selectedSession) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Button variant="outline" size="sm" onClick={() => { setStep("goal-select"); setActiveTab("history"); setSelectedSession(null); }}>
          <ArrowLeft className="mr-2 h-4 w-4" />Geçmişe Dön
        </Button>

        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-6 text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            {new Date(selectedSession.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
          {goal && <p className="text-xs font-medium text-muted-foreground">{goalLabel(goal)}</p>}
          {totalScore !== null && (
            <div className={`font-display text-4xl font-bold ${scoreColor(totalScore)}`}>{totalScore}/100</div>
          )}
          {savedFeedback && (
            <p className="text-sm text-muted-foreground">
              {savedFeedback.correct}/{savedFeedback.totalMcq} test sorusu doğru
            </p>
          )}
        </div>

        {detailedAnalysis && <DetailedAnalysisSection analysis={detailedAnalysis} />}
        <QuestionReview questions={questions} savedAnswers={savedAnswers} />
      </div>
    );
  }

  // Goal Selection + History Tabs
  if (step === "goal-select") {
    return (
      <div className="max-w-xl mx-auto py-4 space-y-4">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Target className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold">Günlük Eğitim</h1>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="training" className="flex-1 gap-1.5">
              <Zap className="h-3.5 w-3.5" />Yeni Eğitim
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-1.5">
              <History className="h-3.5 w-3.5" />Geçmiş
            </TabsTrigger>
          </TabsList>

          <TabsContent value="training" className="space-y-3 mt-4">
            <p className="text-muted-foreground text-sm text-center">Hedefine göre sorular kişiselleştirilecek</p>

            {/* Career Development */}
            <button
              onClick={() => selectGoal("career")}
              className="w-full text-left rounded-xl border-2 border-border bg-card p-5 hover:border-primary/40 hover:bg-primary/5 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold mb-0.5">Kariyerimi ve Kendimi Geliştirmek İstiyorum</h3>
                  <p className="text-xs text-muted-foreground">Genel kariyer yetkinlikleri, iletişim, problem çözme ve liderlik üzerine sorular</p>
                </div>
              </div>
            </button>

            {/* Skill Focus */}
            <div className="rounded-xl border-2 border-border bg-card p-5 space-y-3">
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-sm font-bold mb-0.5">Bir Yeteneğimi Geliştirmek İstiyorum</h3>
                  <p className="text-xs text-muted-foreground mb-2">Belirli bir yetenek alanında derinleşmek için</p>
                  <div className="flex gap-2">
                    <Input
                      value={skillInput}
                      onChange={e => setSkillInput(e.target.value)}
                      placeholder="örn: Veri Analizi, Sunum, Liderlik..."
                      className="text-sm h-9"
                    />
                    <Button size="sm" onClick={() => selectGoal("skill")} disabled={!skillInput.trim()}>
                      Başla
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Interview Prep */}
            <div className="rounded-xl border-2 border-border bg-card p-5 space-y-3">
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-sm font-bold mb-0.5">Bir Şirketin Mülakatını Geçmek İstiyorum</h3>
                  <p className="text-xs text-muted-foreground mb-2">Hedef şirkete ve pozisyona özel sorular</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={companyInput}
                      onChange={e => setCompanyInput(e.target.value)}
                      placeholder="Şirket adı"
                      className="text-sm h-9"
                    />
                    <Input
                      value={positionInput}
                      onChange={e => setPositionInput(e.target.value)}
                      placeholder="Pozisyon"
                      className="text-sm h-9"
                    />
                  </div>
                  <Button size="sm" className="mt-2" onClick={() => selectGoal("interview")} disabled={!companyInput.trim() || !positionInput.trim()}>
                    Mülakata Hazırlan
                  </Button>
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={() => navigate("/individual")} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />Geri Dön
            </Button>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : pastSessions.length === 0 ? (
              <div className="text-center py-12 rounded-xl border border-dashed border-border bg-muted/30">
                <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">Henüz tamamlanmış eğitim yok</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveTab("training")}>
                  İlk Eğitimi Başlat
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Score Trend */}
                {pastSessions.length >= 2 && (
                  <div className="rounded-xl border border-border bg-card p-4 mb-3">
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Skor Trendi (son {Math.min(pastSessions.length, 10)} eğitim)</p>
                    <div className="flex items-end gap-1.5 h-16">
                      {pastSessions.slice(0, 10).reverse().map((s, i) => {
                        const sc = s.score || 0;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                            <span className="text-[9px] font-semibold">{sc}</span>
                            <div className="w-full rounded-t" style={{ height: `${Math.max((sc / 100) * 48, 4)}px`, background: `hsl(var(--primary) / ${0.3 + (sc / 100) * 0.7})` }} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {pastSessions.map((session, idx) => {
                  const prevS = pastSessions[idx + 1]?.score;
                  const diff = session.score !== null && prevS !== null ? (session.score - prevS) : null;
                  const goalData = session.answers?.goal;
                  return (
                    <button
                      key={session.id}
                      onClick={() => openHistoryDetail(session)}
                      className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            {new Date(session.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}
                            <span className="text-xs text-muted-foreground ml-2">
                              {new Date(session.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </p>
                          {goalData && (
                            <p className="text-xs text-muted-foreground mt-0.5">{goalLabel(goalData)}</p>
                          )}
                        </div>
                        <div className="text-right flex items-center gap-2">
                          {session.score !== null && (
                            <span className={`text-lg font-bold ${scoreColor(session.score)}`}>{session.score}</span>
                          )}
                          {diff !== null && diff !== 0 && (
                            <span className={`text-xs font-semibold ${diff > 0 ? "text-primary" : "text-destructive"}`}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            Günlük Eğitim <Zap className="h-5 w-5 text-primary" />
          </h1>
          <p className="text-muted-foreground text-sm">
            {goal ? goalLabel(goal) : "10 soru — her gün biraz daha iyi"}
          </p>
        </div>
        {streakCount > 0 && (
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-bold">
            <Flame className="h-3.5 w-3.5" />{streakCount} gün seri
          </span>
        )}
      </div>

      {/* Quiz Mode */}
      {step === "quiz" && questions.length > 0 && (
        <div className="space-y-4">
          {motivation && currentQ === 0 && !isAnswered && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex items-start gap-3">
              <Flame className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm">{motivation}</p>
            </div>
          )}

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Soru {currentQ + 1} / {questions.length}</span>
              <span>{answered.size} cevaplandı</span>
            </div>
            <Progress value={(answered.size / questions.length) * 100} className="h-2" />
          </div>

          {/* Question Dots */}
          <div className="flex gap-1.5 justify-center flex-wrap">
            {questions.map((q, i) => {
              const isActive = i === currentQ;
              const isDone = answered.has(i);
              let dotColor = "bg-muted";
              if (isDone && q.type === "mcq") {
                dotColor = mcqAnswers[i] === q.correct_answer ? "bg-primary" : "bg-destructive";
              } else if (isDone && q.type === "text") {
                dotColor = "bg-accent";
              }
              return (
                <button
                  key={i}
                  onClick={() => { setCurrentQ(i); setShowExplanation(answered.has(i)); }}
                  className={`h-3 w-3 rounded-full transition-all ${dotColor} ${isActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-125" : "hover:scale-110"}`}
                />
              );
            })}
          </div>

          {/* Question Card */}
          {currentQuestion && (
            <div className="rounded-xl border-2 border-border bg-card p-6 space-y-5 shadow-card">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-display text-sm font-bold text-primary">
                  {currentQ + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                      {currentQuestion.focus_area}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      isMcq ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
                    }`}>
                      {isMcq ? "Çoktan Seçmeli" : "Yorum"}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{currentQuestion.question}</p>
                </div>
              </div>

              {/* MCQ Options */}
              {isMcq && currentQuestion.options && (
                <div className="space-y-2">
                  {currentQuestion.options.map((opt, oi) => {
                    const selected = mcqAnswers[currentQ] === oi;
                    const isCorrectOpt = currentQuestion.correct_answer === oi;
                    let optionStyle = "border-border hover:border-primary/30 hover:bg-primary/5 cursor-pointer";
                    if (isAnswered) {
                      if (isCorrectOpt) optionStyle = "border-primary bg-primary/10 text-primary";
                      else if (selected && !isCorrectOpt) optionStyle = "border-destructive bg-destructive/10 text-destructive";
                      else optionStyle = "border-border opacity-50";
                    } else if (selected) optionStyle = "border-primary bg-primary/5";

                    return (
                      <button
                        key={oi}
                        onClick={() => selectMcq(oi)}
                        disabled={isAnswered}
                        className={`w-full text-left rounded-lg border-2 px-4 py-3 text-sm transition-all flex items-center gap-3 ${optionStyle}`}
                      >
                        <span className={`h-6 w-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                          isAnswered && isCorrectOpt ? "border-primary bg-primary text-primary-foreground" :
                          isAnswered && selected && !isCorrectOpt ? "border-destructive bg-destructive text-destructive-foreground" :
                          "border-muted-foreground/30"
                        }`}>
                          {isAnswered && isCorrectOpt ? "✓" :
                           isAnswered && selected && !isCorrectOpt ? "✗" :
                           String.fromCharCode(65 + oi)}
                        </span>
                        <span className="flex-1">{opt}</span>
                        {isAnswered && isCorrectOpt && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                        {isAnswered && selected && !isCorrectOpt && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Text Answer */}
              {!isMcq && (
                <div className="space-y-3">
                  <textarea
                    value={textAnswers[currentQ] || ""}
                    onChange={(e) => setTextAnswers(prev => ({ ...prev, [currentQ]: e.target.value }))}
                    disabled={isAnswered}
                    placeholder="Cevabınızı buraya yazın..."
                    className="w-full min-h-[120px] rounded-lg border-2 border-border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                  />
                  {!isAnswered && (
                    <Button onClick={submitText} size="sm" disabled={!textAnswers[currentQ]?.trim()}>
                      <Send className="mr-2 h-4 w-4" />Cevabı Gönder
                    </Button>
                  )}
                </div>
              )}

              {/* Explanation */}
              {isAnswered && showExplanation && currentQuestion.explanation && (
                <div className="rounded-lg bg-accent/5 border border-accent/20 p-4 space-y-1">
                  <p className="text-xs font-semibold text-accent flex items-center gap-1">
                    <Brain className="h-3.5 w-3.5" />
                    {isMcq ? "Açıklama" : "İdeal Cevap İpuçları"}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{currentQuestion.explanation}</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={goPrev} disabled={currentQ === 0} className="flex-1">
              <ArrowLeft className="mr-2 h-4 w-4" />Önceki
            </Button>
            {currentQ < questions.length - 1 ? (
              <Button onClick={goNext} className="flex-1">
                Sonraki<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : allAnswered ? (
              <Button onClick={finishQuiz} className="flex-1">
                <CheckCircle2 className="mr-2 h-4 w-4" />Tamamla
              </Button>
            ) : (
              <Button variant="outline" disabled className="flex-1 opacity-50">
                Tüm soruları cevaplayın
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {step === "results" && (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-8 text-center space-y-3">
            {goal && <p className="text-xs text-muted-foreground font-medium">{goalLabel(goal)}</p>}
            {totalScore !== null && (
              <>
                <div className={`font-display text-6xl font-bold ${scoreColor(totalScore)}`}>
                  {totalScore}/100
                </div>
                <p className="text-sm text-muted-foreground">
                  {savedFeedback?.correct}/{savedFeedback?.totalMcq} test sorusu doğru
                </p>
                {/* Progression Comparison */}
                {scoreDiff !== null && scoreDiff !== 0 && (
                  <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                    scoreDiff > 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                  }`}>
                    {scoreDiff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingUp className="h-3 w-3 rotate-180" />}
                    Önceki eğitime göre {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff} puan
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detailed Analysis */}
          {detailedAnalysis && <DetailedAnalysisSection analysis={detailedAnalysis} />}

          {/* Review Each Question */}
          <QuestionReview questions={questions} savedAnswers={{ mcq: mcqAnswers, text: textAnswers }} />

          {/* AI Coach CTA */}
          <div className="rounded-xl border-2 border-accent/30 bg-accent/5 p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <MessageSquare className="h-5 w-5 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-sm font-bold">Sonuçları AI Kariyer Koçu ile Değerlendir</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {detailedAnalysis?.coach_suggestion || "Zayıf alanlarını koçunla konuş ve kişisel gelişim planı oluştur"}
                </p>
              </div>
            </div>
            <Link to="/individual/coach">
              <Button size="sm" className="w-full mt-3">
                <Brain className="mr-2 h-4 w-4" />AI Koça Danış
              </Button>
            </Link>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={retryTraining} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />Tekrar Dene
            </Button>
            <Button onClick={resetForNewTraining} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />Yeni Eğitim
            </Button>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => navigate("/individual")} variant="outline" className="flex-1">
              <ArrowLeft className="mr-2 h-4 w-4" />Panel
            </Button>
            <Button onClick={() => navigate("/individual/practice")} className="flex-1">
              <TrendingUp className="mr-2 h-4 w-4" />Tam Pratik Yap
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// Detailed Analysis Component
const DetailedAnalysisSection = ({ analysis }: { analysis: any }) => {
  if (!analysis) return null;

  return (
    <div className="space-y-3">
      {analysis.summary && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="font-display text-sm font-bold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />Genel Değerlendirme
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {analysis.strengths?.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <h4 className="text-xs font-bold text-primary flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />Güçlü Yönler
            </h4>
            <ul className="space-y-1">
              {analysis.strengths.map((s: string, i: number) => (
                <li key={i} className="text-xs text-muted-foreground">• {s}</li>
              ))}
            </ul>
          </div>
        )}
        {analysis.weaknesses?.length > 0 && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-2">
            <h4 className="text-xs font-bold text-destructive flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5" />Gelişim Alanları
            </h4>
            <ul className="space-y-1">
              {analysis.weaknesses.map((w: string, i: number) => (
                <li key={i} className="text-xs text-muted-foreground">• {w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {analysis.focus_breakdown?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h4 className="text-xs font-bold text-muted-foreground">Alan Bazlı Performans</h4>
          {analysis.focus_breakdown.map((fb: any, i: number) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{fb.area}</span>
                <span className="font-semibold">{fb.score}/100</span>
              </div>
              <Progress value={fb.score} className="h-1.5" />
              {fb.note && <p className="text-[10px] text-muted-foreground">{fb.note}</p>}
            </div>
          ))}
        </div>
      )}

      {analysis.improvement_tips?.length > 0 && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-2">
          <h4 className="text-xs font-bold text-accent flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" />Yapman Gerekenler
          </h4>
          {analysis.improvement_tips.map((tip: string, i: number) => (
            <p key={i} className="text-xs text-muted-foreground">→ {tip}</p>
          ))}
        </div>
      )}

      {analysis.progress_note && (
        <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-center">
          <p className="text-xs text-primary font-medium">📈 {analysis.progress_note}</p>
        </div>
      )}
    </div>
  );
};

// Question Review Component
const QuestionReview = ({ questions, savedAnswers }: { questions: TrainingQuestion[], savedAnswers: any }) => {
  const [expanded, setExpanded] = useState(false);
  if (!questions?.length) return null;

  const displayQuestions = expanded ? questions : questions.slice(0, 3);

  return (
    <div className="space-y-3">
      <h3 className="font-display text-sm font-bold text-muted-foreground">Soru İnceleme</h3>
      {displayQuestions.map((q, i) => {
        const isCorrect = q.type === "mcq" && savedAnswers?.mcq?.[i] === q.correct_answer;
        const selectedIdx = savedAnswers?.mcq?.[i];
        return (
          <div key={i} className={`rounded-xl border p-4 space-y-2 ${
            q.type === "mcq"
              ? isCorrect ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"
              : "border-accent/30 bg-accent/5"
          }`}>
            <div className="flex items-start gap-2">
              <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground">{q.focus_area}</p>
                <p className="text-sm font-medium">{q.question}</p>
              </div>
              {q.type === "mcq" && (
                isCorrect
                  ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  : <XCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
            </div>
            {q.type === "mcq" && q.options && (
              <div className="grid grid-cols-1 gap-1 ml-7">
                {q.options.map((opt, oi) => (
                  <div key={oi} className={`text-xs px-3 py-1.5 rounded-lg ${
                    oi === q.correct_answer ? "bg-primary/10 text-primary font-semibold" :
                    oi === selectedIdx && oi !== q.correct_answer ? "bg-destructive/10 text-destructive line-through" :
                    "bg-muted/30 text-muted-foreground"
                  }`}>
                    {String.fromCharCode(65 + oi)}) {opt}
                  </div>
                ))}
              </div>
            )}
            {q.type === "text" && savedAnswers?.text?.[i] && (
              <p className="text-xs text-muted-foreground italic ml-7 bg-muted/30 rounded p-2">"{savedAnswers.text[i]}"</p>
            )}
            <p className="text-xs text-accent ml-7">💡 {q.explanation}</p>
          </div>
        );
      })}
      {questions.length > 3 && (
        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="w-full gap-1">
          {expanded ? <><ChevronUp className="h-3.5 w-3.5" />Daha az göster</> : <><ChevronDown className="h-3.5 w-3.5" />Tüm soruları göster ({questions.length})</>}
        </Button>
      )}
    </div>
  );
};

export default DailyTrainingPage;
