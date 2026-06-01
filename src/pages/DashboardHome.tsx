import { Link } from "react-router-dom";
import { Video, Users, TrendingUp, Clock, ArrowRight, Loader2, Mic, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import EmptyState from "@/components/dashboard/EmptyState";
import LoadingState from "@/components/dashboard/LoadingState";
import MeetingCard from "@/components/MeetingCard";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Tables } from "@/integrations/supabase/types";

type Recording = Tables<"recordings">;

const DashboardHome = () => {
  const [recentRecordings, setRecentRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ meetings: 0, interviews: 0, analyzed: 0, avgScore: 0 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [recordingsRes, practicesRes] = await Promise.all([
          supabase.from("recordings").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("practice_interviews").select("id", { count: "exact" }).eq("user_id", user.id),
        ]);

        const recordings = recordingsRes.data || [];
        setRecentRecordings(recordings.slice(0, 4));

        const analyzed = recordings.filter(r => r.analysis_data !== null);
        const scores = analyzed.map(r => (r.analysis_data as any)?.overall_score).filter(Boolean);
        const avg = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;

        setStats({
          meetings: recordings.length,
          interviews: practicesRes.count || 0,
          analyzed: analyzed.length,
          avgScore: avg,
        });
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <LoadingState message="Panel yükleniyor..." />;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Panel"
        description="Toplantı ve mülakat analizlerinizin genel görünümü"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Video} label="Toplam Toplantı" value={stats.meetings} change={`${stats.analyzed} analiz edildi`} trend="up" />
        <StatCard icon={Mic} label="Pratik Mülakat" value={stats.interviews} />
        <StatCard icon={TrendingUp} label="Ort. Skor" value={stats.avgScore || "—"} trend={stats.avgScore >= 70 ? "up" : "neutral"} />
        <StatCard icon={Users} label="Analiz Edilen" value={stats.analyzed} iconColor="bg-accent/10 text-accent" />
      </div>

      {/* Quick Actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Link to="/dashboard/record" className="group">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card hover:shadow-card-md hover:border-primary/30 transition-all">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                <Video className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-sm font-semibold">Yeni Kayıt Başlat</h3>
                <p className="text-xs text-muted-foreground">Anlık toplantı veya mülakat kaydı</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        </Link>
        <Link to="/dashboard/record" className="group">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card hover:shadow-card-md hover:border-primary/30 transition-all">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/15 transition-colors">
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-sm font-semibold">Dosya ile Analiz Et</h3>
                <p className="text-xs text-muted-foreground">Video, ses veya transkript dosyası yükleyin</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        </Link>
      </div>

      {/* AI Summary - placeholder */}
      {stats.analyzed > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold mb-1">AI Özet</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Toplam {stats.meetings} toplantı kaydınız var, bunların {stats.analyzed} tanesi analiz edildi.
                {stats.avgScore > 0 && ` Ortalama performans skorunuz ${stats.avgScore}/100.`}
                {stats.avgScore >= 80 && " Harika bir performans gösteriyorsunuz! 🎉"}
                {stats.avgScore >= 60 && stats.avgScore < 80 && " Gelişim alanlarınızı keşfetmek için raporları inceleyin."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Meetings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-semibold">Son Toplantılar</h2>
          <Link to="/dashboard/meetings">
            <Button variant="ghost" size="sm" className="text-xs">
              Tümünü Gör <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>

        {recentRecordings.length === 0 ? (
          <EmptyState
            icon={Video}
            title="Henüz kayıt yok"
            description="İlk toplantı veya mülakatınızı kaydedin, AI analizini görün."
            action={{ label: "Kayıt Başlat", onClick: () => window.location.href = "/dashboard/record" }}
          />
        ) : (
          <div className="grid gap-3">
            {recentRecordings.map((recording) => (
              <MeetingCard key={recording.id} recording={recording} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardHome;
