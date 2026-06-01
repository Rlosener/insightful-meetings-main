import { Link } from "react-router-dom";
import { Mic, History, BarChart3, Target, ArrowRight, Loader2, TrendingUp, Award, Flame, Brain, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

const IndividualHome = () => {
  const [practiceCount, setPracticeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recentPractices, setRecentPractices] = useState<any[]>([]);
  const [todayTraining, setTodayTraining] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, count } = await supabase
          .from("practice_interviews")
          .select("*", { count: "exact" })
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        setPracticeCount(count || 0);
        setRecentPractices(data || []);

        // Check latest training
        const { data: training } = await supabase
          .from("daily_training")
          .select("completed, score, streak_count")
          .eq("user_id", user.id)
          .eq("completed", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setTodayTraining(training);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Calculate trends
  const scoredPractices = recentPractices.filter((p) => p.character_analysis?.overall_score);
  const latestScore = scoredPractices[0]?.character_analysis?.overall_score || 0;
  const prevScore = scoredPractices[1]?.character_analysis?.overall_score || 0;
  const scoreDiff = latestScore && prevScore ? latestScore - prevScore : 0;

  const avgScore = scoredPractices.length > 0
    ? Math.round(scoredPractices.reduce((acc, p) => acc + (p.character_analysis?.overall_score || 0), 0) / scoredPractices.length)
    : 0;

  const avgComm = scoredPractices.filter(p => p.analysis_data?.communication_score).length > 0
    ? Math.round(scoredPractices.filter(p => p.analysis_data?.communication_score).reduce((acc, p) => acc + (p.analysis_data?.communication_score || 0), 0) / scoredPractices.filter(p => p.analysis_data?.communication_score).length)
    : 0;

  const avgConf = scoredPractices.filter(p => p.analysis_data?.confidence_score).length > 0
    ? Math.round(scoredPractices.filter(p => p.analysis_data?.confidence_score).reduce((acc, p) => acc + (p.analysis_data?.confidence_score || 0), 0) / scoredPractices.filter(p => p.analysis_data?.confidence_score).length)
    : 0;

  // Streak calculation (consecutive days with practice)
  const streak = (() => {
    if (recentPractices.length === 0) return 0;
    let count = 1;
    const dates = recentPractices.map(p => new Date(p.created_at).toDateString());
    const uniqueDates = [...new Set(dates)];
    for (let i = 1; i < uniqueDates.length; i++) {
      const curr = new Date(uniqueDates[i - 1]);
      const prev = new Date(uniqueDates[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff <= 1) count++;
      else break;
    }
    return count;
  })();

  // Badges
  const badges = [];
  if (practiceCount >= 1) badges.push({ label: "İlk Adım", icon: "🎯" });
  if (practiceCount >= 5) badges.push({ label: "Kararlı", icon: "💪" });
  if (practiceCount >= 10) badges.push({ label: "Deneyimli", icon: "⭐" });
  if (practiceCount >= 25) badges.push({ label: "Uzman", icon: "🏆" });
  if (latestScore >= 80) badges.push({ label: "Yüksek Skor", icon: "🔥" });
  if (streak >= 3) badges.push({ label: "Seri", icon: "🔥" });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">Mülakat Pratik Merkezi 🎯</h1>
        <p className="text-muted-foreground text-sm sm:text-base">AI kariyer koçunuz ile mülakatlarınıza hazırlanın</p>
      </div>

      {/* Daily Training CTA */}
      <Link to="/individual/daily">
        <div className="rounded-xl border-2 border-accent/30 bg-accent/5 hover:border-accent/50 p-5 transition-all cursor-pointer group">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-accent/10">
              <Zap className="h-6 w-6 text-accent" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-base font-bold flex items-center gap-2">
                Günlük Eğitim
                {todayTraining?.completed && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    Son: {todayTraining.score}/100
                  </span>
                )}
              </h2>
              <p className="text-xs text-muted-foreground">
                10 soru — hedefine özel eğitim ve geçmiş sonuçların
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </Link>

      {/* Quick Start */}
      <Link to="/individual/practice">
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-6 hover:border-primary/40 transition-all cursor-pointer group">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Mic className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-lg font-bold">Yeni Pratik Başlat</h2>
              <p className="text-sm text-muted-foreground">Zorluk seviyesi, mülakat tarzı seçin ve AI mülakatçı ile pratik yapın</p>
            </div>
            <ArrowRight className="h-5 w-5 text-primary group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </Link>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="font-display text-2xl font-bold">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : practiceCount}</div>
          <p className="text-xs text-muted-foreground">Toplam Pratik</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Award className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="font-display text-2xl font-bold text-primary">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : latestScore ? `${latestScore}` : "-"}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            Son Skor
            {scoreDiff !== 0 && (
              <span className={`text-[10px] font-semibold ${scoreDiff > 0 ? "text-primary" : "text-destructive"}`}>
                {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff}
              </span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-accent" />
            </div>
          </div>
          <div className="font-display text-2xl font-bold">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : avgScore || "-"}</div>
          <p className="text-xs text-muted-foreground">Ort. Skor</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Flame className="h-4 w-4 text-destructive" />
            </div>
          </div>
          <div className="font-display text-2xl font-bold">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : streak}</div>
          <p className="text-xs text-muted-foreground">Gün Serisi 🔥</p>
        </div>
      </div>

      {/* Progress Indicators */}
      {!loading && scoredPractices.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" />Performans Özeti</h2>
          <div className="space-y-3">
            {[
              { label: "Genel Skor", value: avgScore, color: "bg-primary" },
              { label: "İletişim", value: avgComm, color: "bg-accent" },
              { label: "Özgüven", value: avgConf, color: "bg-primary" },
            ].map((metric) => (
              <div key={metric.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{metric.label}</span>
                  <span className="font-semibold">{metric.value || "-"}/100</span>
                </div>
                <Progress value={metric.value || 0} className="h-2" />
              </div>
            ))}
          </div>

          {/* Score Trend Mini Chart */}
          {scoredPractices.length >= 2 && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Skor Trendi (son {Math.min(scoredPractices.length, 5)} pratik)</p>
              <div className="flex items-end gap-2 h-16">
                {scoredPractices.slice(0, 5).reverse().map((p, i) => {
                  const score = p.character_analysis?.overall_score || 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] font-semibold">{score}</span>
                      <div className="w-full bg-primary/20 rounded-t" style={{ height: `${Math.max((score / 100) * 48, 4)}px` }}>
                        <div className="w-full h-full bg-primary rounded-t" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Badges */}
      {!loading && badges.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2"><Award className="h-4 w-4 text-primary" />Rozetler</h2>
          <div className="flex flex-wrap gap-2">
            {badges.map((b, i) => (
              <span key={i} className="px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20 text-xs font-medium flex items-center gap-1.5">
                <span>{b.icon}</span>{b.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent Practices */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Son Pratikler</h2>
          <Link to="/individual/history">
            <Button variant="ghost" size="sm">Tümünü Gör <ArrowRight className="ml-1 h-3 w-3" /></Button>
          </Link>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : recentPractices.length === 0 ? (
          <div className="text-center py-8 rounded-xl border border-dashed border-border bg-muted/30">
            <p className="text-muted-foreground text-sm">Henüz pratik yapılmamış. İlk pratiğinizi başlatın!</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {recentPractices.slice(0, 3).map((p) => (
              <Link key={p.id} to={`/individual/history/${p.id}`} className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-sm">{p.position}</h3>
                    <p className="text-xs text-muted-foreground">{p.department || "Genel"} • {p.duration || "-"}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("tr-TR")}</div>
                    {p.character_analysis?.overall_score && (
                      <span className="text-sm font-bold text-primary">{p.character_analysis.overall_score}/100</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IndividualHome;
