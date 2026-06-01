import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Brain, AlertTriangle, CheckCircle2, Clock, Users, FileText,
  TrendingUp, Briefcase, Target, ArrowRight, Loader2, Activity,
  Shield, Zap, BarChart3, Eye, ChevronRight, RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface OverviewStats {
  totalMeetings: number;
  totalInterviews: number;
  analyzedMeetings: number;
  avgScore: number;
  totalMembers: number;
  totalActions: number;
  pendingActions: number;
  overdueActions: number;
  completedActions: number;
  practiceInterviews: number;
  recentSectorDevs: number;
  highRiskDevs: number;
}

interface OverdueAction {
  task: string;
  owner: string | null;
  priority: string;
  deadline: string | null;
}

interface RecentMeeting {
  id: string;
  title: string;
  date: string;
  type: string;
  score: number | null;
}

interface RecurringIssue {
  topic: string;
  count: number;
}

interface RecordingAnalysis {
  overall_score?: number;
  key_topics?: unknown;
  unresolved_topics?: unknown;
}

const asAnalysis = (value: Json | null): RecordingAnalysis => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as RecordingAnalysis;
  }
  return {};
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

const ExecutiveOverviewPage = () => {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [overdueActions, setOverdueActions] = useState<OverdueAction[]>([]);
  const [recentMeetings, setRecentMeetings] = useState<RecentMeeting[]>([]);
  const [recurringIssues, setRecurringIssues] = useState<RecurringIssue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [recordingsRes, actionsRes, membersRes, practiceRes, sectorRes] = await Promise.all([
        supabase.from("recordings").select("*").eq("user_id", user.id).order("date", { ascending: false }),
        supabase.from("action_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("company_members").select("id").eq("user_id", user.id),
        supabase.from("practice_interviews").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase.from("sector_developments").select("risk_level").eq("user_id", user.id),
      ]);

      const recordings = recordingsRes.data || [];
      const actions = actionsRes.data || [];
      const members = membersRes.data || [];
      const sectorDevs = sectorRes.data || [];

      const analyzed = recordings.filter((r) => r.analysis_data !== null);
      const scores = analyzed
        .map((r) => asAnalysis(r.analysis_data).overall_score)
        .filter((score): score is number => typeof score === "number");
      const avg = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;

      const meetings = recordings.filter((r) => r.type === "toplantı");
      const interviews = recordings.filter((r) => r.type === "mülakat");

      const pending = actions.filter((a) => a.status !== "completed");
      const overdue = pending.filter((a) => a.deadline && new Date(a.deadline) < new Date());

      // Recurring topics
      const topicMap: Record<string, number> = {};
      recordings.slice(0, 20).forEach((r) => {
        const analysis = asAnalysis(r.analysis_data);
        const topics = [
          ...asStringArray(analysis.key_topics),
          ...asStringArray(analysis.unresolved_topics),
        ];
        topics.forEach((t: string) => {
          const key = t.toLowerCase().trim();
          if (key.length > 2) topicMap[key] = (topicMap[key] || 0) + 1;
        });
      });
      const recurring = Object.entries(topicMap)
        .filter(([, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([topic, count]) => ({ topic, count }));

      setStats({
        totalMeetings: meetings.length,
        totalInterviews: interviews.length,
        analyzedMeetings: analyzed.length,
        avgScore: avg,
        totalMembers: members.length,
        totalActions: actions.length,
        pendingActions: pending.length,
        overdueActions: overdue.length,
        completedActions: actions.filter((a) => a.status === "completed").length,
        practiceInterviews: practiceRes.count || 0,
        recentSectorDevs: sectorDevs.length,
        highRiskDevs: sectorDevs.filter((d) => d.risk_level === "high").length,
      });

      setOverdueActions(overdue.slice(0, 5).map((a) => ({
        task: a.task_description, owner: a.owner, priority: a.priority, deadline: a.deadline,
      })));

      setRecentMeetings(recordings.slice(0, 5).map((r) => ({
        id: r.id, title: r.title, date: r.date, type: r.type,
        score: asAnalysis(r.analysis_data).overall_score ?? null,
      })));

      setRecurringIssues(recurring);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (!stats) return null;

  const hasData = stats.totalMeetings + stats.totalInterviews > 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-card">
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">Yönetici Özeti</h1>
              <p className="text-xs text-muted-foreground">Yönetim zekası ve karar destek paneli</p>
            </div>
          </div>
        </div>
      </div>

      {/* Priority Signals */}
      {hasData && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Overdue Actions - Critical */}
          <div className={`rounded-xl border p-4 ${stats.overdueActions > 0 ? "border-destructive/20 bg-destructive/5" : "border-border bg-card"}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className={`h-4 w-4 ${stats.overdueActions > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Geciken</span>
            </div>
            <p className={`font-display text-2xl font-bold ${stats.overdueActions > 0 ? "text-destructive" : "text-foreground"}`}>{stats.overdueActions}</p>
            <p className="text-[10px] text-muted-foreground">son tarihi geçen aksiyon</p>
          </div>

          {/* Pending Actions */}
          <div className="rounded-xl border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning))]/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bekleyen</span>
            </div>
            <p className="font-display text-2xl font-bold text-foreground">{stats.pendingActions}</p>
            <p className="text-[10px] text-muted-foreground">açık aksiyon maddesi</p>
          </div>

          {/* Avg Score */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ort. Skor</span>
            </div>
            <p className="font-display text-2xl font-bold text-foreground">{stats.avgScore || "—"}</p>
            <p className="text-[10px] text-muted-foreground">{stats.analyzedMeetings} analiz genelinde</p>
          </div>

          {/* High Risk Sector Devs */}
          <div className={`rounded-xl border p-4 ${stats.highRiskDevs > 0 ? "border-destructive/15 bg-destructive/5" : "border-border bg-card"}`}>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sektör Riskleri</span>
            </div>
            <p className="font-display text-2xl font-bold text-foreground">{stats.highRiskDevs}</p>
            <p className="text-[10px] text-muted-foreground">yüksek riskli gelişme</p>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Overdue Actions Detail */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Öncelikli Aksiyonlar
            </h2>
            <Link to="/dashboard/meetings" className="text-[11px] text-primary hover:underline flex items-center gap-1">
              Tümünü Gör <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {overdueActions.length > 0 ? (
            <div className="space-y-2">
              {overdueActions.map((a, i) => (
                <div key={i} className="rounded-lg border border-destructive/10 bg-destructive/5 p-3 flex items-start gap-3">
                  <div className={`h-6 w-6 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                    a.priority === "high" ? "bg-destructive/10" : "bg-[hsl(var(--warning))]/10"
                  }`}>
                    <span className={`text-[10px] font-bold ${
                      a.priority === "high" ? "text-destructive" : "text-[hsl(var(--warning))]"
                    }`}>{a.priority === "high" ? "!" : "•"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{a.task}</p>
                    <p className="text-[10px] text-muted-foreground">{a.owner || "Atanmamış"} · {a.deadline || "Son tarih yok"}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))]/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Geciken aksiyon yok</p>
            </div>
          )}
        </div>

        {/* Recurring Issues */}
        <div className="rounded-2xl border border-border bg-card shadow-card p-5">
          <h2 className="font-display text-sm font-semibold flex items-center gap-2 mb-4">
            <RefreshCw className="h-4 w-4 text-[hsl(var(--warning))]" /> Tekrarlayan Örüntüler
          </h2>
          {recurringIssues.length > 0 ? (
            <div className="space-y-2">
              {recurringIssues.map((issue, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <span className="text-xs font-medium truncate">{issue.topic}</span>
                  <Badge variant="secondary" className="text-[9px] shrink-0">{issue.count}x</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Henüz tekrarlayan örüntü algılanmadı.</p>
          )}
        </div>
      </div>

      {/* Activity Summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard icon={FileText} label="Toplantılar" value={stats.totalMeetings} link="/dashboard/meetings" />
        <MetricCard icon={Briefcase} label="Mülakatlar" value={stats.totalInterviews} link="/dashboard/meetings" />
        <MetricCard icon={Users} label="Ekip Üyeleri" value={stats.totalMembers} link="/dashboard/company" />
        <MetricCard icon={BarChart3} label="Sektör Gelişmeleri" value={stats.recentSectorDevs} link="/dashboard/company/radar" />
        <MetricCard icon={CheckCircle2} label="Tamamlanan" value={stats.completedActions} color="success" />
      </div>

      {/* Recent Analyses */}
      <div className="rounded-2xl border border-border bg-card shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-sm font-semibold flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" /> Son Analizler
          </h2>
          <Link to="/dashboard/meetings" className="text-[11px] text-primary hover:underline flex items-center gap-1">
            Tümünü Gör <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {recentMeetings.length > 0 ? (
          <div className="space-y-2">
            {recentMeetings.map((m) => (
              <Link key={m.id} to={`/dashboard/meetings/${m.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    m.type === "mülakat" ? "bg-accent/10" : "bg-primary/10"
                  }`}>
                    {m.type === "mülakat" ? <Briefcase className="h-4 w-4 text-accent" /> : <FileText className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(m.date).toLocaleDateString("tr-TR")}</p>
                  </div>
                </div>
                {m.score !== null && (
                  <span className={`font-display text-sm font-bold shrink-0 ${
                    m.score >= 80 ? "text-[hsl(var(--success))]" : m.score >= 60 ? "text-[hsl(var(--warning))]" : "text-destructive"
                  }`}>{m.score}</span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-muted-foreground">Henüz analiz yok</p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link to="/dashboard/record">Kayıt Başlat <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </div>
        )}
      </div>

      {/* Quick Navigation */}
      <div className="grid sm:grid-cols-3 gap-3">
        <QuickNav icon={Brain} title="AI Şirket Danışmanı" desc="İş problemlerini teşhis edin" link="/dashboard/advisor" />
        <QuickNav icon={Target} title="Sektör Radarı" desc="Dış çevre istihbaratı" link="/dashboard/company/radar" />
        <QuickNav icon={Users} title="Ekip ve Şirket" desc="Kişiler ve organizasyon" link="/dashboard/company" />
      </div>

      {/* No Data State */}
      {!hasData && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Activity className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
          <h2 className="font-display text-lg font-semibold mb-2">Donebird'e hoş geldiniz</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Bir toplantı kaydı başlatarak veya mülakat yükleyerek başlayın. Veriler geldikçe yönetici özeti otomatik dolacaktır.
          </p>
          <Button variant="hero" asChild>
            <Link to="/dashboard/record">Kayıt Başlat <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
        </div>
      )}
    </div>
  );
};

/* ── Sub-components ── */

const MetricCard = ({ icon: Icon, label, value, link, color }: {
  icon: typeof FileText; label: string; value: number; link?: string; color?: string;
}) => {
  const content = (
    <div className="rounded-xl border border-border bg-card p-4 hover:border-primary/20 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`h-4 w-4 ${color === "success" ? "text-[hsl(var(--success))]" : "text-primary"}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="font-display text-xl font-bold">{value}</p>
    </div>
  );
  return link ? <Link to={link}>{content}</Link> : content;
};

const QuickNav = ({ icon: Icon, title, desc, link }: {
  icon: typeof Brain; title: string; desc: string; link: string;
}) => (
  <Link to={link} className="group rounded-xl border border-border bg-card p-5 shadow-card hover:shadow-card-md hover:border-primary/20 transition-all flex items-center gap-4">
    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
      <Icon className="h-5 w-5 text-primary" />
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="font-display text-sm font-semibold">{title}</h3>
      <p className="text-[11px] text-muted-foreground">{desc}</p>
    </div>
    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
  </Link>
);

export default ExecutiveOverviewPage;
