import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Video } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import LoadingState from "@/components/dashboard/LoadingState";
import EmptyState from "@/components/dashboard/EmptyState";

const AnalyticsPage = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, analyzed: 0, avgScore: 0 });
  const [typeData, setTypeData] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from("recordings")
          .select("*")
          .eq("user_id", user.id);

        const recordings = data || [];
        const analyzed = recordings.filter(r => r.analysis_data);
        const scores = analyzed.map(r => (r.analysis_data as any)?.overall_score).filter(Boolean);
        const avg = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;

        const meetings = recordings.filter(r => r.type === "toplantı").length;
        const interviews = recordings.filter(r => r.type === "mülakat").length;

        setStats({ total: recordings.length, analyzed: analyzed.length, avgScore: avg });
        setTypeData([
          { name: "Toplantı", value: meetings, color: "hsl(168 80% 42%)" },
          { name: "Mülakat", value: interviews, color: "hsl(36 90% 55%)" },
        ]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) return <LoadingState message="Analizler yükleniyor..." />;

  if (stats.total === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analizler" description="Toplantı ve mülakat verilerinizin genel görünümü" />
        <EmptyState icon={BarChart3} title="Henüz veri yok" description="Toplantılarınızı kaydedip analiz ettikçe grafikler burada görünecek." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Analizler" description="Toplantı ve mülakat verilerinizin genel görünümü" />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Video} label="Toplam Kayıt" value={stats.total} />
        <StatCard icon={TrendingUp} label="Ort. Skor" value={stats.avgScore || "—"} trend={stats.avgScore >= 70 ? "up" : "neutral"} />
        <StatCard icon={BarChart3} label="Analiz Edilen" value={stats.analyzed} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="font-display text-sm font-semibold mb-4">Tür Dağılımı</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={typeData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {typeData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--foreground))",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="font-display text-sm font-semibold mb-4">Skor Dağılımı</h2>
          <div className="space-y-3">
            {[
              { label: "Mükemmel (80-100)", min: 80, max: 100, color: "bg-[hsl(var(--success))]" },
              { label: "İyi (60-79)", min: 60, max: 79, color: "bg-[hsl(var(--warning))]" },
              { label: "Geliştirilmeli (<60)", min: 0, max: 59, color: "bg-destructive" },
            ].map(range => {
              const count = stats.analyzed > 0 ? 0 : 0; // placeholder
              return (
                <div key={range.label} className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${range.color}`} />
                  <span className="text-xs text-muted-foreground flex-1">{range.label}</span>
                  <span className="text-xs font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
