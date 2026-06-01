import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Download, BarChart3, TrendingUp, Video, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import EmptyState from "@/components/dashboard/EmptyState";
import LoadingState from "@/components/dashboard/LoadingState";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

type Recording = Tables<"recordings">;

const ReportsPage = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("recordings")
          .select("*")
          .eq("user_id", user.id)
          .not("analysis_data", "is", null)
          .order("created_at", { ascending: false });
        setRecordings(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) return <LoadingState message="Raporlar yükleniyor..." />;

  const scores = recordings.map(r => (r.analysis_data as any)?.overall_score).filter(Boolean);
  const avgScore = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
  const highScoreCount = scores.filter((s: number) => s >= 80).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raporlar"
        description="Tamamlanan analizlerin detaylı raporları"
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={FileText} label="Toplam Rapor" value={recordings.length} />
        <StatCard icon={TrendingUp} label="Ort. Skor" value={avgScore || "—"} trend={avgScore >= 70 ? "up" : "neutral"} />
        <StatCard icon={BarChart3} label="Yüksek Skor (80+)" value={highScoreCount} iconColor="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" />
      </div>

      {/* Report List */}
      {recordings.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Henüz rapor yok"
          description="Toplantılarınız analiz edildikçe raporlar burada görünecek."
        />
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Başlık</span>
            <span className="hidden sm:block">Tür</span>
            <span>Skor</span>
            <span className="w-4" />
          </div>
          {recordings.map((r) => {
            const score = (r.analysis_data as any)?.overall_score;
            return (
              <Link
                key={r.id}
                to={`/dashboard/meetings/${r.id}`}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3.5 border-b border-border last:border-0 hover:bg-muted/30 transition-colors items-center"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-[11px] text-muted-foreground">{format(new Date(r.date), "d MMM yyyy", { locale: tr })}</p>
                </div>
                <span className="hidden sm:block text-[11px] px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">{r.type}</span>
                <span className={`font-display text-sm font-bold ${
                  score >= 80 ? "text-[hsl(var(--success))]" : score >= 60 ? "text-[hsl(var(--warning))]" : "text-destructive"
                }`}>{score || "—"}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
