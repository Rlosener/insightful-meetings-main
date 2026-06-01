import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Brain, Zap, Target, TrendingUp, CalendarDays, Flame, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { toast } from "sonner";
import CoachChat from "@/components/coach/CoachChat";
import ImprovementSection from "@/components/coach/ImprovementSection";
import SmartRecommendations from "@/components/coach/SmartRecommendations";
import OneLineTruth from "@/components/coach/OneLineTruth";
import PerformanceSignals from "@/components/coach/PerformanceSignals";
import CareerTrajectory from "@/components/coach/CareerTrajectory";
import PatternDetection from "@/components/coach/PatternDetection";

const AICareerCoachPage = () => {
  const [practices, setPractices] = useState<any[]>([]);
  const [trainings, setTrainings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [careerProfile, setCareerProfile] = useState<any>(null);
  const [lastDataHash, setLastDataHash] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [practicesRes, profileRes, trainingsRes] = await Promise.all([
        supabase
          .from("practice_interviews")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("career_profiles")
          .select("target_role, skills, career_readiness_score")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("daily_training")
          .select("*")
          .eq("user_id", user.id)
          .eq("completed", true)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      setPractices(practicesRes.data || []);
      setCareerProfile(profileRes.data);
      setTrainings(trainingsRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  // Practice-based stats
  const scored = practices.filter((p) => p.character_analysis?.overall_score);
  const lastScore = scored[0]?.character_analysis?.overall_score || 0;
  const prevScore = scored[1]?.character_analysis?.overall_score || 0;
  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((a, p) => a + (p.character_analysis?.overall_score || 0), 0) / scored.length)
    : 0;
  const avgComm = scored.filter(p => p.analysis_data?.communication_score).length > 0
    ? Math.round(scored.filter(p => p.analysis_data?.communication_score).reduce((a, p) => a + (p.analysis_data?.communication_score || 0), 0) / scored.filter(p => p.analysis_data?.communication_score).length)
    : 0;
  const avgConf = scored.filter(p => p.analysis_data?.confidence_score).length > 0
    ? Math.round(scored.filter(p => p.analysis_data?.confidence_score).reduce((a, p) => a + (p.analysis_data?.confidence_score || 0), 0) / scored.filter(p => p.analysis_data?.confidence_score).length)
    : 0;

  const allStrengths = scored.flatMap(p => p.character_analysis?.strengths || []);
  const allWeaknesses = scored.flatMap(p => p.character_analysis?.weaknesses || []);

  // Training-based stats
  const trainingScores = trainings.filter(t => t.score !== null).map(t => t.score as number);
  const avgTrainingScore = trainingScores.length > 0
    ? Math.round(trainingScores.reduce((a, s) => a + s, 0) / trainingScores.length)
    : 0;
  const trainingWeaknesses = trainings
    .flatMap(t => t.feedback?.detailed_analysis?.weaknesses || [])
    .filter(Boolean);
  const trainingStrengths = trainings
    .flatMap(t => t.feedback?.detailed_analysis?.strengths || [])
    .filter(Boolean);

  const hasData = practices.length > 0 || trainings.length > 0;

  const chatContext = {
    practiceCount: practices.length,
    trainingCount: trainings.length,
    lastScore,
    avgScore,
    avgComm,
    avgConf,
    avgTrainingScore,
    weaknesses: [...new Set([...allWeaknesses, ...trainingWeaknesses])].slice(0, 6),
    strengths: [...new Set([...allStrengths, ...trainingStrengths])].slice(0, 6),
    patterns: insights?.pattern_detection || [],
    recentTrainingGoal: trainings[0]?.answers?.goal || null,
    recentTrainingScore: trainings[0]?.score || null,
  };

  // Simple hash to detect data changes
  const computeDataHash = () => {
    const key = `${practices.length}-${trainings.length}-${practices[0]?.id || ""}-${trainings[0]?.id || ""}-${trainings[0]?.score || ""}`;
    return key;
  };

  const generateInsights = async () => {
    if (!hasData) { toast.error("En az 1 eğitim veya pratik gerekli"); return; }

    // Skip if data hasn't changed and we already have insights
    const currentHash = computeDataHash();
    if (insights && currentHash === lastDataHash) {
      toast.info("Veriler değişmedi, mevcut analiz kullanılıyor.");
      return;
    }

    setAnalyzing(true);
    try {
      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.CAREER_COACH_INSIGHTS, {
        practices: practices.slice(0, 5).map((p) => ({
          position: p.position,
          character_analysis: { overall_score: p.character_analysis?.overall_score, strengths: p.character_analysis?.strengths?.slice(0, 3), weaknesses: p.character_analysis?.weaknesses?.slice(0, 3) },
          analysis_data: { communication_score: p.analysis_data?.communication_score, confidence_score: p.analysis_data?.confidence_score },
        })),
        trainings: trainings.slice(0, 5).map((t) => ({
          score: t.score,
          feedback: { detailed_analysis: { strengths: t.feedback?.detailed_analysis?.strengths?.slice(0, 2), weaknesses: t.feedback?.detailed_analysis?.weaknesses?.slice(0, 2) } },
          answers: { goal: t.answers?.goal },
          training_date: t.training_date,
        })),
        careerProfile: careerProfile ? { target_role: careerProfile.target_role, skills: careerProfile.skills?.slice(0, 5), career_readiness_score: careerProfile.career_readiness_score } : null,
      });
      if (result.error) { toast.error(getErrorToastMessage(result.error)); setAnalyzing(false); return; }
      const data = result.data;
      setInsights(data);
      setLastDataHash(currentHash);
      toast.success("AI koç analizi tamamlandı!");
    } catch (e: any) {
      if (e.message?.includes("Rate limit")) toast.error("İstek limiti aşıldı, biraz bekleyin.");
      else if (e.message?.includes("Payment")) toast.error("AI kredisi tükendi.");
      else toast.error("Analiz hatası");
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">AI Kariyer Koçu 🧠</h1>
        <p className="text-muted-foreground text-sm">Keskin, dürüst ve kişisel — gerçek bir koç deneyimi</p>
      </div>

      {/* Generate Button */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Brain className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-sm font-bold">Derin Analiz & Koçluk</h3>
          <p className="text-[11px] text-muted-foreground">
            {trainings.length > 0 && `${trainings.length} eğitim`}
            {trainings.length > 0 && practices.length > 0 && " + "}
            {practices.length > 0 && `${practices.length} pratik`}
            {careerProfile ? " + profil" : ""}
            {!hasData && "Günlük eğitim veya pratik yaparak başlayın"}
          </p>
        </div>
        <Button onClick={generateInsights} variant="hero" size="sm" disabled={analyzing || !hasData}>
          {analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analiz Ediliyor</> : <><Zap className="mr-2 h-4 w-4" />Analiz Başlat</>}
        </Button>
      </div>

      {/* One Line Truth - WOW moment */}
      <OneLineTruth truth={insights?.one_line_truth || ""} />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Insights */}
        <div className="lg:col-span-3 space-y-4">
          {/* Performance Signals */}
          <PerformanceSignals signals={insights?.performance_signals || null} />

          {/* Daily Focus */}
          {insights?.daily_focus && (
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold text-primary">Bugünkü Odak</h3>
              </div>
              <p className="text-sm leading-relaxed">{insights.daily_focus}</p>
            </div>
          )}

          {/* Comparative Feedback */}
          {insights?.comparative_feedback && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">📊</span>
                <h3 className="font-display text-sm font-bold">Diğer Adaylarla Karşılaştırma</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{insights.comparative_feedback}</p>
            </div>
          )}

          {/* Career Trajectory */}
          <CareerTrajectory trajectory={insights?.career_trajectory || null} />

          {/* Pattern Detection */}
          <PatternDetection patterns={insights?.pattern_detection || null} />

          {/* Weekly Focus */}
          {insights?.weekly_focus?.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-accent" />
                <h3 className="font-display text-sm font-bold">Bu Hafta Odaklanın</h3>
              </div>
              <div className="space-y-2">
                {insights.weekly_focus.map((item: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-accent/5">
                    <span className="h-5 w-5 rounded-full bg-accent/10 text-accent text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                    <p className="text-sm text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Note */}
          {insights?.progress_note && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold">Gelişim Notu</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{insights.progress_note}</p>
            </div>
          )}

          {/* Next Actions */}
          {insights?.next_actions?.length > 0 && (
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 shadow-card space-y-3">
              <h3 className="font-display text-sm font-bold flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Sonraki Adımlar
              </h3>
              <div className="space-y-2">
                {insights.next_actions.map((step: any, i: number) => (
                  <div key={i} className={`p-3 rounded-lg border space-y-1 ${
                    step.priority === "high" ? "border-destructive/30 bg-destructive/5" :
                    step.priority === "medium" ? "border-accent/30 bg-accent/5" :
                    "border-border bg-muted/30"
                  }`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{step.action}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        step.priority === "high" ? "bg-destructive/10 text-destructive" :
                        step.priority === "medium" ? "bg-accent/10 text-accent" :
                        "bg-muted text-muted-foreground"
                      }`}>{step.priority === "high" ? "Yüksek" : step.priority === "medium" ? "Orta" : "Düşük"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">📈 {step.estimated_impact}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Smart Recommendations */}
          <SmartRecommendations recommendations={insights?.smart_recommendations || null} />

          {/* Training Performance */}
          {trainingScores.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
              <h3 className="font-display text-sm font-bold flex items-center gap-2">
                <Zap className="h-4 w-4 text-accent" />Günlük Eğitim Performansı
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Ort. Eğitim Skoru</span>
                  <span className="font-semibold">{avgTrainingScore}/100</span>
                </div>
                <Progress value={avgTrainingScore} className="h-2" />
              </div>
              {trainingScores.length >= 2 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Son {Math.min(trainingScores.length, 8)} eğitim trendi</p>
                  <div className="flex items-end gap-1.5 h-12">
                    {trainings.slice(0, 8).reverse().map((t, i) => {
                      const sc = t.score || 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <span className="text-[8px] font-semibold">{sc}</span>
                          <div className="w-full rounded-t" style={{ height: `${Math.max((sc / 100) * 36, 3)}px`, background: `hsl(var(--accent) / ${0.3 + (sc / 100) * 0.7})` }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <Link to="/individual/daily">
                <Button variant="outline" size="sm" className="w-full gap-2 mt-1">
                  <Flame className="h-3.5 w-3.5" />Günlük Eğitime Git
                </Button>
              </Link>
            </div>
          )}

          {/* Interview Performance */}
          {scored.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
              <h3 className="font-display text-sm font-bold">📊 Mülakat Pratik Performansı</h3>
              <div className="space-y-2.5">
                {[
                  { label: "İletişim", value: avgComm, prev: scored[1]?.analysis_data?.communication_score },
                  { label: "Özgüven", value: avgConf, prev: scored[1]?.analysis_data?.confidence_score },
                  { label: "Genel", value: avgScore, prev: prevScore },
                ].map((m) => {
                  const diff = m.value && m.prev ? m.value - m.prev : 0;
                  return (
                    <div key={m.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="font-semibold flex items-center gap-1">
                          {m.value || "-"}/100
                          {diff !== 0 && (
                            <span className={`text-[10px] ${diff > 0 ? "text-primary" : "text-destructive"}`}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </span>
                      </div>
                      <Progress value={m.value || 0} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Improvement Section */}
          <ImprovementSection
            weaknesses={insights?.top_weaknesses || []}
            personalAdvice={insights?.personal_advice || null}
          />
        </div>

        {/* Right: Chat */}
        <div className="lg:col-span-2">
          <CoachChat context={chatContext} />
        </div>
      </div>

      {/* Empty state */}
      {!hasData && !insights && (
        <div className="text-center py-8 rounded-xl border border-dashed border-border bg-muted/30 space-y-3">
          <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">AI kariyer koçu için günlük eğitim veya pratik yaparak başlayın.</p>
          <div className="flex gap-3 justify-center">
            <Link to="/individual/daily">
              <Button size="sm" variant="outline" className="gap-2">
                <Zap className="h-4 w-4" />Günlük Eğitim
              </Button>
            </Link>
            <Link to="/individual/practice">
              <Button size="sm" className="gap-2">
                <ArrowRight className="h-4 w-4" />Pratik Başlat
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default AICareerCoachPage;
