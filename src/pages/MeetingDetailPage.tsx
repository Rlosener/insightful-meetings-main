import { useParams, Link } from "react-router-dom";
import { useCallback, useEffect, useState, useMemo, type ReactNode } from "react";
import {
  ArrowLeft, Calendar, Clock, Users, CheckCircle2, AlertCircle, Target,
  TrendingUp, Loader2, User, Download, Brain, Smile, Frown, Meh, Eye,
  Activity, FileText, MessageSquare, BarChart3, ListChecks, Sparkles,
  RefreshCw, Share2, File, Mic, Signal, Volume2, Crown, Video, Upload, MonitorPlay,
  Lightbulb, AlertTriangle, Timer, UserX, ThumbsDown, HelpCircle,
  Gauge, Zap, PauseCircle, MessageCircle, ScanEye, Move, Radio, Focus,
} from "lucide-react";
import ActionItemsList from "@/components/ActionItemsList";
import SmartTranscriptViewer from "@/components/SmartTranscriptViewer";
import SpeechInsightsSection from "@/components/SpeechInsightsSection";
import { Button } from "@/components/ui/button";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
// Tabs removed — all sections visible by default
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { toast } from "sonner";
import { getMeetingSource } from "@/components/MeetingCard";
import { getRecordingFileName } from "@/lib/storagePaths";

const sourceDisplay = {
  zoom: { label: "Zoom", icon: Video, cls: "bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]" },
  "google-meet": { label: "Google Meet", icon: MonitorPlay, cls: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" },
  upload: { label: "Yükleme", icon: Upload, cls: "bg-accent/10 text-accent" },
  live: { label: "Canlı Kayıt", icon: Video, cls: "bg-primary/10 text-primary" },
} as const;

type Recording = Tables<"recordings">;

/* ── Reusable sub-components ── */

const ScoreBar = ({ label, value }: { label: string; value: number }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5 text-xs sm:text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-display font-bold text-foreground">{value}</span>
    </div>
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${value}%`,
          background: value >= 80 ? "hsl(var(--success))" : value >= 60 ? "hsl(var(--warning))" : "hsl(var(--destructive))",
        }}
      />
    </div>
  </div>
);

const SpeakingTimeBar = ({ name, percentage, isDominant }: { name: string; percentage: number; isDominant?: boolean }) => (
  <div className="flex items-center gap-3">
    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${isDominant ? "bg-accent/10" : "bg-primary/10"}`}>
      {isDominant ? <Crown className="h-4 w-4 text-accent" /> : <User className="h-4 w-4 text-primary" />}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{name}</span>
          {isDominant && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-accent/30 text-accent">Baskın</Badge>}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{percentage}%</span>
      </div>
      <Progress value={percentage} className="h-1.5" />
    </div>
  </div>
);

const MoodIcon = ({ mood }: { mood: string }) => {
  const m = mood?.toLowerCase() || "";
  if (m.includes("pozitif") || m.includes("rahat") || m.includes("mutlu")) return <Smile className="h-5 w-5 text-[hsl(var(--success))]" />;
  if (m.includes("negatif") || m.includes("stresli") || m.includes("endişeli")) return <Frown className="h-5 w-5 text-destructive" />;
  return <Meh className="h-5 w-5 text-[hsl(var(--warning))]" />;
};

const SectionCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-border bg-card p-5 shadow-card ${className}`}>{children}</div>
);

const SectionTitle = ({ icon: Icon, children }: { icon: typeof Brain; children: React.ReactNode }) => (
  <h3 className="font-display text-sm sm:text-base font-semibold mb-4 flex items-center gap-2">
    <Icon className="h-4 w-4 text-primary" /> {children}
  </h3>
);

const InsightMetric = ({ icon: Icon, label, value, description, color = "text-primary" }: {
  icon: typeof Signal; label: string; value: string | number; description: string; color?: string;
}) => (
  <div className="rounded-xl border border-border bg-card p-4 shadow-card">
    <div className="flex items-center gap-2 mb-2">
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
    <p className="font-display text-xl font-bold mb-0.5">{value}</p>
    <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
  </div>
);

type VoiceValueMapping = { label: string; color: string; bg: string; pct: number };

const VoiceMetricCard = ({ icon: Icon, label, value, description, valueMap }: {
  icon: typeof Mic;
  label: string;
  value: string;
  description?: string;
  valueMap: Record<string, VoiceValueMapping>;
}) => {
  const mapping = valueMap[value?.toLowerCase()] || { label: value || "—", color: "text-muted-foreground", bg: "bg-muted", pct: 50 };
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-7 w-7 rounded-lg ${mapping.bg} flex items-center justify-center`}>
            <Icon className={`h-3.5 w-3.5 ${mapping.color}`} />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <span className={`text-xs font-bold ${mapping.color}`}>{mapping.label}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${mapping.pct}%`,
            background: mapping.color.includes("success") ? "hsl(var(--success))"
              : mapping.color.includes("warning") ? "hsl(var(--warning))"
              : mapping.color.includes("info") ? "hsl(var(--info))"
              : mapping.color.includes("destructive") ? "hsl(var(--destructive))"
              : "hsl(var(--primary))",
          }}
        />
      </div>
      {description && <p className="text-[10px] text-muted-foreground leading-snug">{description}</p>}
    </div>
  );
};

/* ── Smart AI Recommendation types ── */

const formatBehavioralLabel = (value?: string | number | null) => {
  if (value === undefined || value === null || value === "") return "—";

  if (typeof value === "number") return `${Math.round(value)}/100`;

  const normalized = value.toLowerCase();
  const labels: Record<string, string> = {
    low: "Düşük",
    medium: "Orta",
    high: "Yüksek",
    active: "Aktif",
    inactive: "Pasif",
    weak: "Zayıf",
    moderate: "Orta",
    strong: "Güçlü",
    insufficient_evidence: "Yetersiz Kanıt",
  };

  return labels[normalized] || value;
};

const behavioralToneClass = (value?: string | null) => {
  switch (value?.toLowerCase()) {
    case "high":
    case "strong":
      return "text-[hsl(var(--success))]";
    case "medium":
    case "moderate":
      return "text-[hsl(var(--warning))]";
    case "low":
    case "weak":
    case "insufficient_evidence":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
};

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeInlineText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  return "";
};

const joinTextArray = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => safeInlineText(item)).filter(Boolean).join(", ") : "";

const getStructuredTitle = (item: unknown) => {
  if (!isRecord(item)) return safeInlineText(item);
  return (
    safeInlineText(item.title) ||
    safeInlineText(item.decision) ||
    safeInlineText(item.moment) ||
    safeInlineText(item.question) ||
    safeInlineText(item.issue) ||
    safeInlineText(item.name) ||
    safeInlineText(item.description) ||
    safeInlineText(item.task_description) ||
    safeInlineText(item.summary)
  );
};

const getStructuredContext = (item: unknown) => {
  if (!isRecord(item)) return "";
  return (
    safeInlineText(item.context) ||
    safeInlineText(item.why_it_matters) ||
    safeInlineText(item.significance) ||
    safeInlineText(item.fit_rationale) ||
    safeInlineText(item.ai_suggestion) ||
    safeInlineText(item.reason)
  );
};

const getStructuredExcerpt = (item: unknown) => {
  if (!isRecord(item)) return "";
  return (
    safeInlineText(item.transcript_excerpt) ||
    safeInlineText(item.source_excerpt) ||
    safeInlineText(item.transcript_exceprt)
  );
};

const getStructuredMeta = (item: unknown) => {
  if (!isRecord(item)) return "";
  return [
    safeInlineText(item.confidence) ? `Güven: ${safeInlineText(item.confidence)}` : "",
    joinTextArray(item.participants_involved) ? `Katılımcılar: ${joinTextArray(item.participants_involved)}` : "",
    safeInlineText(item.owner) ? `Sorumlu: ${safeInlineText(item.owner)}` : "",
    safeInlineText(item.priority) ? `Öncelik: ${safeInlineText(item.priority)}` : "",
  ].filter(Boolean).join(" • ");
};

const summarizeStructuredItem = (item: unknown) => {
  if (!isRecord(item)) return safeInlineText(item);
  return [
    getStructuredTitle(item),
    getStructuredContext(item),
    getStructuredMeta(item),
    getStructuredExcerpt(item),
  ].filter(Boolean).join(" — ");
};

const renderStructuredCollection = (items: unknown, tone: "default" | "success" | "danger" = "default"): ReactNode => {
  const list = Array.isArray(items) ? items.filter(Boolean).slice(0, 4) : [];
  if (list.length === 0) return null;

  const toneClass =
    tone === "success"
      ? "border-[hsl(var(--success))]/15 bg-[hsl(var(--success))]/5"
      : tone === "danger"
      ? "border-destructive/15 bg-destructive/5"
      : "border-border bg-card";

  return (
    <div className="space-y-2">
      {list.map((item, i) => {
        if (!isRecord(item)) {
          return (
            <div key={i} className={`rounded-lg border p-3 ${toneClass}`}>
              <p className="text-xs text-muted-foreground">{safeInlineText(item) || "—"}</p>
            </div>
          );
        }

        const title = getStructuredTitle(item);
        const context = getStructuredContext(item);
        const meta = getStructuredMeta(item);
        const excerpt = getStructuredExcerpt(item);

        return (
          <div key={i} className={`rounded-lg border p-3 ${toneClass}`}>
            {title && <p className="text-xs font-semibold text-foreground">{title}</p>}
            {context && <p className="text-xs text-muted-foreground mt-1">{context}</p>}
            {meta && <p className="text-[10px] text-muted-foreground mt-1">{meta}</p>}
            {excerpt && <p className="text-[10px] text-muted-foreground italic border-l-2 border-primary/20 pl-2 mt-2">"{excerpt}"</p>}
          </div>
        );
      })}
    </div>
  );
};

type SmartInsight = {
  icon: typeof AlertTriangle;
  title: string;
  description: string;
  severity: "warning" | "info" | "success";
  category: string;
};

const generateSmartInsights = (analysis: any, recording: Recording): SmartInsight[] => {
  const insights: SmartInsight[] = [];
  const eff = analysis?.meeting_effectiveness;
  const participants = analysis?.participants_analysis || [];

  // Duration check
  const duration = recording.duration;
  if (duration) {
    const mins = parseInt(duration);
    if (!isNaN(mins) && mins > 60) {
      insights.push({
        icon: Timer,
        title: "Toplantı çok uzun sürmüş",
        description: `${mins} dakikalık toplantı, katılımcı dikkatini azaltabilir. 45 dakikayı geçmeyen toplantılar daha verimli olur.`,
        severity: "warning",
        category: "Süre",
      });
    }
  }

  // Dominant speaker
  if (participants.length > 1) {
    const scores = participants.map((p: any) => p.contribution_score || 0);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    if (max - min > 40) {
      const dominant = participants.find((p: any) => p.contribution_score === max);
      insights.push({
        icon: UserX,
        title: "Bir katılımcı tartışmaya hâkim olmuş",
        description: `${dominant?.name || "Bir kişi"} toplam katkının büyük bölümünü sağlamış. Diğer katılımcılara daha fazla söz hakkı verilmesi önerilir.`,
        severity: "warning",
        category: "Katılım",
      });
    }
  }

  // Low engagement
  const engagement = analysis?.facial_analysis?.average_engagement;
  if (engagement && (engagement.toLowerCase().includes("düşük") || engagement.toLowerCase().includes("low"))) {
    insights.push({
      icon: ThumbsDown,
      title: "Düşük katılım algılandı",
      description: "Katılımcıların katılım düzeyi düşük görünüyor. İnteraktif sorular veya kısa molalar katılımı artırabilir.",
      severity: "warning",
      category: "Katılım",
    });
  }

  // Low participation balance
  if (eff?.participation_balance !== undefined && eff.participation_balance < 50) {
    insights.push({
      icon: Users,
      title: "Katılım dengesi düşük",
      description: "Konuşma eşit dağılmamış. Round-robin veya yapılandırılmış konuşma sırası dengeli katılım sağlayabilir.",
      severity: "warning",
      category: "Denge",
    });
  }

  // Low decision making
  if (eff?.decision_making !== undefined && eff.decision_making < 50) {
    insights.push({
      icon: HelpCircle,
      title: "Belirsiz kararlar",
      description: "Karar alma sürecinde zayıflık tespit edildi. Toplantı sonunda net kararların özetlenmesi ve sorumlulukların atanması önerilir.",
      severity: "warning",
      category: "Kararlar",
    });
  }

  // No action items
  if (!analysis?.action_items?.length) {
    insights.push({
      icon: ListChecks,
      title: "Aksiyon maddesi belirtilmemiş",
      description: "Toplantıdan somut görevler çıkmamış. Her toplantının sonunda sorumlu-tarih bazlı aksiyon maddeleri tanımlanmalı.",
      severity: "info",
      category: "Aksiyonlar",
    });
  }

  // Good overall score
  if (analysis?.overall_score >= 80) {
    insights.push({
      icon: Sparkles,
      title: "Başarılı toplantı",
      description: "Toplantı genel olarak verimli geçmiş. Gündem takibi ve katılım düzeyi iyi seviyede.",
      severity: "success",
      category: "Genel",
    });
  }

  // Time management issue
  if (eff?.time_management !== undefined && eff.time_management < 50) {
    insights.push({
      icon: Timer,
      title: "Zaman yönetimi yetersiz",
      description: "Gündem maddelerine ayrılan süre dengesiz. Önceden zaman blokları belirleyip zamanlayıcı kullanmak faydalı olabilir.",
      severity: "warning",
      category: "Zaman",
    });
  }

  return insights;
};

const severityStyles = {
  warning: {
    border: "border-[hsl(var(--warning))]/30",
    bg: "bg-[hsl(var(--warning))]/5",
    iconBg: "bg-[hsl(var(--warning))]/10",
    iconColor: "text-[hsl(var(--warning))]",
    badge: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  },
  info: {
    border: "border-[hsl(var(--info))]/30",
    bg: "bg-[hsl(var(--info))]/5",
    iconBg: "bg-[hsl(var(--info))]/10",
    iconColor: "text-[hsl(var(--info))]",
    badge: "bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]",
  },
  success: {
    border: "border-[hsl(var(--success))]/30",
    bg: "bg-[hsl(var(--success))]/5",
    iconBg: "bg-[hsl(var(--success))]/10",
    iconColor: "text-[hsl(var(--success))]",
    badge: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  },
};

const SmartInsightCard = ({ insight }: { insight: SmartInsight }) => {
  const style = severityStyles[insight.severity];
  const Icon = insight.icon;
  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 flex items-start gap-3 transition-all hover:shadow-sm`}>
      <div className={`h-9 w-9 rounded-lg ${style.iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`h-4.5 w-4.5 ${style.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-semibold">{insight.title}</h4>
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${style.badge}`}>{insight.category}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
      </div>
    </div>
  );
};

/* ── Main component ── */

const MeetingDetailPage = () => {
  const { id } = useParams();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const fetchRecording = useCallback(() => {
    if (!id) return;
    supabase.from("recordings").select("*").eq("id", id).single().then(({ data, error }) => {
      if (!error) setRecording(data);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => { fetchRecording(); }, [fetchRecording]);

  /* ── Actions ── */

  const handleExport = () => {
    if (!recording) return;
    const a = recording.analysis_data as any;
    const lines = [
      `# ${recording.title}`,
      `Tarih: ${format(new Date(recording.date), "d MMMM yyyy HH:mm", { locale: tr })}`,
      recording.duration ? `Süre: ${recording.duration}` : "",
      recording.video_url ? `Dosya: ${getRecordingFileName(recording.video_url) || recording.video_url}` : "",
      "",
      "## AI Özeti",
      a?.summary || "—",
      "",
      "## Alınan Kararlar",
      ...(a?.decisions_made || []).map((d: unknown, i: number) => `${i + 1}. ${summarizeStructuredItem(d)}`),
      "",
      "## Aksiyon Maddeleri",
      ...(a?.action_items || []).map((d: unknown, i: number) => `${i + 1}. ${summarizeStructuredItem(d)}`),
      "",
      "## Öneriler",
      ...(a?.recommendations || []).map((d: unknown, i: number) => `${i + 1}. ${summarizeStructuredItem(d)}`),
      "",
      "## Transkript",
      recording.transcript || "—",
    ].filter(Boolean);

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${recording.title.replace(/\s+/g, "-")}.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Rapor indirildi");
  };

  const handleShare = async () => {
    if (!recording) return;
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: recording.title, text: `${recording.title} — Donebird Analiz Raporu`, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Rapor linki kopyalandı");
      }
    } catch {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Rapor linki kopyalandı");
    }
  };

  const handleRegenerate = async () => {
    if (!recording || !recording.transcript) {
      toast.error("Transkript olmadan yeniden analiz yapılamaz");
      return;
    }
    setRegenerating(true);
    try {
      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_INTERVIEW, {
        transcript: recording.transcript, recordingInfo: { type: recording.type },
      });
      if (result.error) { toast.error(getErrorToastMessage(result.error)); setRegenerating(false); return; }
      const analysisData = result.data;

      await supabase.from("recordings")
        .update({ analysis_data: analysisData.analysis, summary: analysisData.analysis?.summary })
        .eq("id", recording.id);

      setRecording({ ...recording, analysis_data: analysisData.analysis, summary: analysisData.analysis?.summary });
      toast.success("Analiz yeniden oluşturuldu");
    } catch (err: any) {
      toast.error(err.message || "Yeniden analiz başarısız");
    } finally {
      setRegenerating(false);
    }
  };

  const a = recording?.analysis_data as any;
  const hasAnalysis = !!a;

  // Smart AI insights (must be before early returns)
  const smartInsights = useMemo(() => {
    if (!hasAnalysis || !a || !recording) return [];
    return generateSmartInsights(a, recording);
  }, [a, recording, hasAnalysis]);

  /* ── Loading / Not found ── */

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!recording) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Toplantı bulunamadı</p>
      <Link to="/dashboard/meetings"><Button variant="ghost" className="mt-4">Geri Dön</Button></Link>
    </div>
  );

  const formattedDate = format(new Date(recording.date), "d MMMM yyyy, HH:mm", { locale: tr });
  const isInterview = recording.type === "mülakat";
  const participants = a?.participants_analysis || [];
  const fileName = getRecordingFileName(recording.video_url);
  const source = getMeetingSource(recording);
  const SourceIcon = sourceDisplay[source].icon;

  // Compute speaking data with dominant detection
  const speakingData = participants.map((p: any) => ({
    name: p.name,
    percentage: p.contribution_score || Math.round(100 / (participants.length || 1)),
  }));
  const maxSpeaker = speakingData.reduce((max: any, p: any) => (p.percentage > (max?.percentage || 0) ? p : max), null);

  // Compute conversation quality metrics
  const effectiveness = a?.meeting_effectiveness;
  const avgEffectiveness = effectiveness
    ? Math.round(((effectiveness.agenda_adherence || 0) + (effectiveness.time_management || 0) + (effectiveness.decision_making || 0) + (effectiveness.participation_balance || 0)) / 4)
    : null;
  const participationBalance = effectiveness?.participation_balance;
  const engagementEstimate = a?.facial_analysis?.average_engagement || (avgEffectiveness && avgEffectiveness >= 70 ? "Yüksek" : avgEffectiveness ? "Orta" : null);

  /* ── Status badge ── */
  const status = hasAnalysis ? "completed" : recording.transcript ? "processing" : "pending";
  const statusMap = {
    completed: { label: "Tamamlandı", cls: "border-[hsl(var(--success))]/30 text-[hsl(var(--success))]" },
    processing: { label: "İşleniyor", cls: "border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]" },
    pending: { label: "Bekliyor", cls: "border-muted-foreground/30 text-muted-foreground" },
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back nav */}
      <Link to="/dashboard/meetings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Toplantılara Dön
      </Link>

      {/* ── Header ── */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-xl sm:text-2xl font-bold truncate">{recording.title}</h1>
              <Badge variant="outline" className={`text-xs capitalize ${isInterview ? "border-accent/30 text-accent" : "border-primary/30 text-primary"}`}>
                {recording.type}
              </Badge>
              <Badge variant="outline" className={`text-xs ${statusMap[status].cls}`}>
                {status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                {status === "processing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {statusMap[status].label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceDisplay[source].cls}`}>
                <SourceIcon className="h-3 w-3" />{sourceDisplay[source].label}
              </span>
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formattedDate}</span>
              {recording.duration && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{recording.duration}</span>}
              {participants.length > 0 && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{participants.length} katılımcı</span>}
              {fileName && <span className="flex items-center gap-1"><File className="h-3.5 w-3.5" />{fileName}</span>}
            </div>
          </div>

          {/* Score + actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="mr-1.5 h-3.5 w-3.5" /> Paylaş
            </Button>
            {hasAnalysis && (
              <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
                {regenerating ? "Analiz ediliyor..." : "Yeniden Analiz"}
              </Button>
            )}
            {hasAnalysis && (
              <Button size="sm" onClick={handleExport}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Dışa Aktar
              </Button>
            )}
          </div>
        </div>

        {/* Score bar */}
        {a?.overall_score !== undefined && (
          <div className="flex items-center gap-4 pt-3 border-t border-border">
            <div className="flex items-center gap-3 flex-1">
              <span className="text-xs text-muted-foreground">{isInterview ? "Genel Skor" : "Etkinlik Skoru"}</span>
              <div className="flex-1 max-w-xs">
                <Progress value={a.overall_score} className="h-2.5" />
              </div>
            </div>
            <span className="font-display text-2xl font-bold text-gradient-primary">{a.overall_score}</span>
          </div>
        )}
      </div>

      {/* No analysis fallback */}
      {!hasAnalysis && (
        <SectionCard className="border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning))]/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--warning))]" />
              <div>
                <p className="text-sm font-medium">Analiz bekleniyor</p>
                <p className="text-xs text-muted-foreground">Bu kayıt henüz AI tarafından analiz edilmedi.</p>
              </div>
            </div>
            {recording.transcript && (
              <Button size="sm" onClick={handleRegenerate} disabled={regenerating}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
                Analiz Başlat
              </Button>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── All sections visible by default ── */}
      {hasAnalysis && (
        <div className="space-y-6">

          {/* ═══ 0. TOP INSIGHTS ═══ */}
          {a.top_insights?.length > 0 && (
            <div className="rounded-2xl border-2 border-accent/30 bg-gradient-to-br from-accent/5 via-card to-primary/5 p-5 sm:p-6 shadow-card">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center shadow-lg">
                  <Zap className="h-4.5 w-4.5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold">Öne Çıkan İçgörüler</h3>
                  <p className="text-[10px] text-muted-foreground">Karar alma sürecini etkileyen en kritik 3 gözlem</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {a.top_insights.slice(0, 3).map((insight: string, i: number) => (
                  <div key={i} className="rounded-xl border border-accent/20 bg-card p-4 flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="font-display text-xs font-bold text-accent">{i + 1}</span>
                    </div>
                    <p className="text-sm text-foreground leading-snug font-medium">{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ 0.5 EXECUTIVE SUMMARY ═══ */}
          {a.executive_summary && (
            <SectionCard className="border-primary/20">
              <SectionTitle icon={Sparkles}>Yönetici Özeti</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {a.executive_summary.overall_evaluation && (
                  <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                    <p className="text-[10px] font-bold text-primary mb-1 uppercase tracking-wider">Genel Değerlendirme</p>
                    <p className="text-sm text-foreground">{a.executive_summary.overall_evaluation}</p>
                  </div>
                )}
                {a.executive_summary.key_strength && (
                  <div className="rounded-lg bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/10 p-3">
                    <p className="text-[10px] font-bold text-[hsl(var(--success))] mb-1 uppercase tracking-wider">Temel Güç</p>
                    <p className="text-sm text-foreground">{a.executive_summary.key_strength}</p>
                  </div>
                )}
                {a.executive_summary.key_risk && (
                  <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3">
                    <p className="text-[10px] font-bold text-destructive mb-1 uppercase tracking-wider">Temel Risk</p>
                    <p className="text-sm text-foreground">{a.executive_summary.key_risk}</p>
                  </div>
                )}
                {a.executive_summary.final_recommendation && (
                  <div className="rounded-lg bg-accent/5 border border-accent/10 p-3">
                    <p className="text-[10px] font-bold text-accent mb-1 uppercase tracking-wider">Nihai Tavsiye</p>
                    <p className="text-sm text-foreground">{a.executive_summary.final_recommendation}</p>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {(a.critical_3_insights?.length > 0 || a.program_fit_analysis || a.critical_moments?.length > 0 || a.important_moments?.length > 0 || a.strongest_evidence_backed_strengths?.length > 0 || a.highest_risk_concerns?.length > 0 || a.follow_up_questions?.length > 0 || a.agenda_adherence_analysis || a.decision_quality_analysis || a.unresolved_topics?.length > 0 || a.unresolved_issues?.length > 0 || a.next_step_recommendations?.length > 0 || a.public_context?.length > 0) && (
            <SectionCard className="border-accent/20">
              <SectionTitle icon={Target}>Karar Derinliği</SectionTitle>
              <div className="space-y-4">
                {a.critical_3_insights?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-accent mb-2 uppercase tracking-wider">Kritik 3 İçgörü</p>
                    {renderStructuredCollection(a.critical_3_insights)}
                  </div>
                )}

                {(a.program_fit_analysis || a.agenda_adherence_analysis || a.decision_quality_analysis) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {a.program_fit_analysis && (
                      <div className="rounded-lg border border-border p-3 space-y-1.5">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Rol / Program Uyumu</p>
                        {a.program_fit_analysis.program_or_company_context && <p className="text-xs text-muted-foreground">{a.program_fit_analysis.program_or_company_context}</p>}
                        {a.program_fit_analysis.sector_fit && <p className="text-xs text-muted-foreground">{a.program_fit_analysis.sector_fit}</p>}
                        {a.program_fit_analysis.fit_rationale && <p className="text-xs text-foreground">{a.program_fit_analysis.fit_rationale}</p>}
                      </div>
                    )}
                    {a.agenda_adherence_analysis && (
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Gündeme Uyum</p>
                        <p className="text-xs text-muted-foreground">{a.agenda_adherence_analysis}</p>
                      </div>
                    )}
                    {a.decision_quality_analysis && (
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Karar Kalitesi</p>
                        <p className="text-xs text-muted-foreground">{a.decision_quality_analysis}</p>
                      </div>
                    )}
                    {a.action_ownership_analysis && (
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Aksiyon Sahipliği</p>
                        <p className="text-xs text-muted-foreground">{a.action_ownership_analysis}</p>
                      </div>
                    )}
                  </div>
                )}

                {(a.critical_moments?.length > 0 || a.important_moments?.length > 0) && (
                  <div>
                    <p className="text-[10px] font-bold text-primary mb-2 uppercase tracking-wider">Önemli Anlar</p>
                    {renderStructuredCollection(a.important_moments?.length > 0 ? a.important_moments : a.critical_moments)}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {a.strongest_evidence_backed_strengths?.length > 0 && (
                    <div className="rounded-lg border border-[hsl(var(--success))]/15 bg-[hsl(var(--success))]/5 p-3">
                      <p className="text-[10px] font-bold text-[hsl(var(--success))] mb-2 uppercase tracking-wider">Kanıta Dayalı Güçlü Yönler</p>
                      {renderStructuredCollection(a.strongest_evidence_backed_strengths, "success")}
                    </div>
                  )}
                  {a.highest_risk_concerns?.length > 0 && (
                    <div className="rounded-lg border border-destructive/15 bg-destructive/5 p-3">
                      <p className="text-[10px] font-bold text-destructive mb-2 uppercase tracking-wider">En Yüksek Riskli Endişeler</p>
                      {renderStructuredCollection(a.highest_risk_concerns, "danger")}
                    </div>
                  )}
                </div>

                {((a.follow_up_questions?.length > 0) || (a.next_step_recommendations?.length > 0) || (a.unresolved_topics?.length > 0) || (a.unresolved_issues?.length > 0)) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {a.follow_up_questions?.length > 0 && (
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-[10px] font-bold text-primary mb-2 uppercase tracking-wider">Takip Soruları</p>
                        {renderStructuredCollection(a.follow_up_questions)}
                      </div>
                    )}
                    {(a.unresolved_issues?.length > 0 || a.unresolved_topics?.length > 0) && (
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-[10px] font-bold text-primary mb-2 uppercase tracking-wider">Çözülmemiş Konular</p>
                        {renderStructuredCollection(a.unresolved_issues?.length > 0 ? a.unresolved_issues : a.unresolved_topics)}
                      </div>
                    )}
                    {a.next_step_recommendations?.length > 0 && (
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-[10px] font-bold text-primary mb-2 uppercase tracking-wider">Sonraki Adımlar</p>
                        {renderStructuredCollection(a.next_step_recommendations)}
                      </div>
                    )}
                  </div>
                )}

                {a.public_context?.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">Kontrollü Açık Kaynak Bağlamı</p>
                    <div className="space-y-1.5">
                      {a.public_context.slice(0, 3).map((item: any, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{item.entity}:</span> {item.summary}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ═══ 0.6 MEETING VERDICT (only meetings) ═══ */}
          {!isInterview && a.meeting_verdict && (
            <SectionCard className="border-accent/20">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Target className="h-4.5 w-4.5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-semibold">Toplantı Etkinlik Kararı</h3>
                    <p className="text-[10px] text-muted-foreground">AI tarafından belirlenen toplantı kalite değerlendirmesi</p>
                  </div>
                </div>
                <Badge className={`text-xs px-3 py-1 border-0 font-display font-bold ${
                  a.meeting_verdict.quality === "high" ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" :
                  a.meeting_verdict.quality === "moderate" ? "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]" :
                  "bg-destructive/10 text-destructive"
                }`}>
                  {a.meeting_verdict.quality === "high" ? "Yüksek Kalite" : a.meeting_verdict.quality === "moderate" ? "Orta Kalite" : "Düşük Kalite"}
                </Badge>
              </div>
              {a.meeting_verdict.confidence !== undefined && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <span>Güven seviyesi:</span>
                  <Progress value={a.meeting_verdict.confidence} className="h-1.5 w-24" />
                  <span className="font-bold text-foreground">%{a.meeting_verdict.confidence}</span>
                </div>
              )}
              {a.meeting_verdict.main_issue && (
                <p className="text-sm text-muted-foreground mb-1"><strong className="text-foreground">Ana Sorun:</strong> {a.meeting_verdict.main_issue}</p>
              )}
              {a.meeting_verdict.improvement_suggestion && (
                <p className="text-sm text-muted-foreground"><strong className="text-foreground">İyileştirme:</strong> {a.meeting_verdict.improvement_suggestion}</p>
              )}
            </SectionCard>
          )}

          {/* ═══ 0.7 SCORE BREAKDOWN ═══ */}
          {(effectiveness || a.overall_score !== undefined) && (
            <SectionCard>
              <SectionTitle icon={BarChart3}>Skor Dağılımı</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {isInterview ? (
                  <>
                    {a.communication_clarity !== undefined && <ScoreBar label="İletişim Netliği" value={a.communication_clarity} />}
                    {a.confidence_level !== undefined && <ScoreBar label="Güven Seviyesi" value={a.confidence_level} />}
                    {a.structured_thinking !== undefined && <ScoreBar label="Yapısal Düşünme" value={a.structured_thinking} />}
                    {a.answer_relevance !== undefined && <ScoreBar label="Yanıt İlgililiği" value={a.answer_relevance} />}
                    {a.answer_depth !== undefined && <ScoreBar label="Yanıt Derinliği" value={a.answer_depth} />}
                    {a.consistency !== undefined && <ScoreBar label="Tutarlılık" value={a.consistency} />}
                    {a.engagement_score !== undefined && <ScoreBar label="Katılım" value={a.engagement_score} />}
                  </>
                ) : (
                  <>
                    {effectiveness?.agenda_adherence !== undefined && <ScoreBar label="Gündem Takibi" value={effectiveness.agenda_adherence} />}
                    {effectiveness?.time_management !== undefined && <ScoreBar label="Zaman Yönetimi" value={effectiveness.time_management} />}
                    {effectiveness?.decision_making !== undefined && <ScoreBar label="Karar Alma" value={effectiveness.decision_making} />}
                    {effectiveness?.participation_balance !== undefined && <ScoreBar label="Katılım Dengesi" value={effectiveness.participation_balance} />}
                  </>
                )}
              </div>
            </SectionCard>
          )}

          {/* ═══ 1. SUMMARY (legacy fallback if no executive_summary) ═══ */}
          {!a.executive_summary && (a.summary || a.general_comment) && (
            <SectionCard>
              <SectionTitle icon={Sparkles}>Özet</SectionTitle>
              {a.summary && <p className="text-sm text-muted-foreground leading-relaxed mb-4">{a.summary}</p>}
              {a.general_comment && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{a.general_comment}</p>
                </div>
              )}
            </SectionCard>
          )}

          {/* ═══ 2. DETAILED ANALYSIS ═══ */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-display text-sm sm:text-base font-semibold">Detaylı Analiz</h3>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <InsightMetric
                icon={Volume2}
                label="Baskın Konuşmacı"
                value={maxSpeaker?.name || "—"}
                description={maxSpeaker ? `Toplam konuşma payı: %${maxSpeaker.percentage}` : "Katılımcı verisi yok"}
                color="text-accent"
              />
              <InsightMetric
                icon={Signal}
                label="Katılım Tahmini"
                value={engagementEstimate || "—"}
                description={engagementEstimate ? "Mimik ve etkileşim verisine dayalı" : "Yeterli veri yok"}
                color="text-primary"
              />
              <InsightMetric
                icon={BarChart3}
                label="Konuşma Kalitesi"
                value={avgEffectiveness ? `${avgEffectiveness}/100` : "—"}
                description={avgEffectiveness ? "Gündem, zaman, karar ve katılım ortalaması" : "Etkinlik verisi yok"}
                color="text-[hsl(var(--success))]"
              />
              <InsightMetric
                icon={Mic}
                label="Katılım Dengesi"
                value={participationBalance ? `${participationBalance}/100` : "—"}
                description={participationBalance >= 80 ? "Dengeli dağılım" : participationBalance >= 60 ? "Orta düzey denge" : participationBalance ? "Dengesiz dağılım" : "Veri yok"}
                color="text-[hsl(var(--info))]"
              />
            </div>

            {/* Meeting Effectiveness */}
            {effectiveness && (
              <SectionCard>
                <SectionTitle icon={BarChart3}>{isInterview ? "Performans Metrikleri" : "Toplantı Etkinliği"}</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ScoreBar label="Gündem Takibi" value={effectiveness.agenda_adherence || 0} />
                  <ScoreBar label="Zaman Yönetimi" value={effectiveness.time_management || 0} />
                  <ScoreBar label="Karar Alma" value={effectiveness.decision_making || 0} />
                  <ScoreBar label="Katılım Dengesi" value={effectiveness.participation_balance || 0} />
                </div>
              </SectionCard>
            )}

            {/* Speaking distribution */}
            {speakingData.length > 0 && (
              <SectionCard>
                <SectionTitle icon={Activity}>Konuşma Süresi Dağılımı</SectionTitle>
                <div className="space-y-3">
                  {speakingData
                    .sort((x: any, y: any) => y.percentage - x.percentage)
                    .map((p: any, i: number) => (
                      <SpeakingTimeBar key={i} name={p.name} percentage={p.percentage} isDominant={p.name === maxSpeaker?.name && speakingData.length > 1} />
                    ))}
                </div>
              </SectionCard>
            )}

            {/* Participants */}
            {participants.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {participants.map((p: any, idx: number) => (
                  <SectionCard key={idx}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-display font-semibold text-sm">{p.name}</h4>
                          {p.communication_style && <p className="text-[10px] text-muted-foreground">{p.communication_style}</p>}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="font-display text-xl font-bold text-primary">{p.contribution_score}</div>
                        <div className="text-[9px] text-muted-foreground">Katkı</div>
                      </div>
                    </div>
                    {p.behavioral_insights && (
                      <div className="p-3 rounded-lg bg-muted/30 mb-3">
                        <p className="text-[10px] font-semibold mb-1">🧠 Davranışsal İçgörüler</p>
                        <p className="text-xs text-muted-foreground">{p.behavioral_insights}</p>
                      </div>
                    )}
                    {p.strengths?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-bold text-[hsl(var(--success))] mb-1">Güçlü Yönler</p>
                        <ul className="space-y-0.5">{p.strengths.map((s: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs"><CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))] shrink-0 mt-0.5" /><span className="text-muted-foreground">{s}</span></li>
                        ))}</ul>
                      </div>
                    )}
                    {p.areas_for_improvement?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-destructive mb-1">Gelişim Alanları</p>
                        <ul className="space-y-0.5">{p.areas_for_improvement.map((item: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs"><AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" /><span className="text-muted-foreground">{item}</span></li>
                        ))}</ul>
                      </div>
                    )}
                  </SectionCard>
                ))}
              </div>
            )}

            {/* Facial analysis */}
            {a.facial_analysis && (
              <SectionCard className="border-accent/20 bg-accent/[0.02]">
                <SectionTitle icon={Eye}>Mimik ve Davranış Analizi</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { icon: <MoodIcon mood={a.facial_analysis.dominant_mood} />, label: "Baskın Duygu", value: a.facial_analysis.dominant_mood || "Belirsiz" },
                    { icon: <Activity className="h-5 w-5 text-primary" />, label: "Kendine Güven", value: a.facial_analysis.average_confidence || "Belirsiz" },
                    { icon: <Eye className="h-5 w-5 text-muted-foreground" />, label: "Katılım", value: a.facial_analysis.average_engagement || "Belirsiz" },
                  ].map((item, i) => (
                    <div key={i} className="rounded-lg bg-muted/30 p-3 border border-border">
                      <div className="flex items-center gap-2 mb-1">{item.icon}<span className="text-xs text-muted-foreground">{item.label}</span></div>
                      <p className="text-sm font-display font-bold capitalize">{item.value}</p>
                    </div>
                  ))}
                </div>
                {a.facial_analysis.common_expressions?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {a.facial_analysis.common_expressions.map((expr: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{expr}</Badge>
                    ))}
                  </div>
                )}
                {a.facial_analysis.mood_progression && (
                  <p className="text-xs text-muted-foreground mt-3 italic">{a.facial_analysis.mood_progression}</p>
                )}
              </SectionCard>
            )}

            {/* Interview category cards (when type is mülakat) */}
            {isInterview && a.categories && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Object.entries(a.categories).map(([key, data]: [string, any]) => (
                  <SectionCard key={key}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-display font-semibold text-sm capitalize">
                        {key === "technical_skills" ? "Teknik Beceriler" :
                         key === "communication" ? "İletişim" :
                         key === "problem_solving" ? "Problem Çözme" :
                         key === "cultural_fit" ? "Kültürel Uyum" : key}
                      </h3>
                      <span className="font-display text-xl font-bold text-primary">{data.score}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{data.description}</p>
                    {data.strengths?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-bold text-[hsl(var(--success))] mb-1">Güçlü Yönler</p>
                        <ul className="space-y-0.5">{data.strengths.slice(0, 3).map((s: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs"><CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))] shrink-0 mt-0.5" /><span className="text-muted-foreground">{s}</span></li>
                        ))}</ul>
                      </div>
                    )}
                    {data.weaknesses?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-destructive mb-1">Gelişim Alanları</p>
                        <ul className="space-y-0.5">{data.weaknesses.slice(0, 3).map((w: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs"><AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" /><span className="text-muted-foreground">{w}</span></li>
                        ))}</ul>
                      </div>
                    )}
                  </SectionCard>
                ))}
              </div>
            )}

            {/* Content Analysis (interview) */}
            {isInterview && a.content_analysis && (
              <SectionCard>
                <SectionTitle icon={FileText}>İçerik Analizi</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {["relevance", "specificity", "depth", "logical_flow", "examples_given", "problem_solving"].map((key) => {
                    const item = a.content_analysis[key];
                    if (!item?.score) return null;
                    const labels: Record<string, string> = { relevance: "Alaka Düzeyi", specificity: "Spesifiklik", depth: "Derinlik", logical_flow: "Mantıksal Akış", examples_given: "Örneklendirme", problem_solving: "Problem Çözme" };
                    return (
                      <div key={key}>
                        <ScoreBar label={labels[key] || key} value={item.score} />
                        {item.description && <p className="text-[10px] text-muted-foreground mt-1">{item.description}</p>}
                        {item.evidence && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 italic border-l-2 border-primary/20 pl-2">"{item.evidence}"</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* Communication Analysis */}
            {a.communication_analysis && (
              <SectionCard>
                <SectionTitle icon={MessageSquare}>İletişim Analizi</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(a.communication_analysis).filter(([_, v]: any) => v?.score !== undefined).map(([key, item]: [string, any]) => {
                    const labels: Record<string, string> = { clarity: "Netlik", fluency: "Akıcılık", confidence: "Özgüven", professional_tone: "Profesyonel Ton", persuasion: "İkna Gücü", structure_quality: "Yapı Kalitesi", expressiveness: "İfade Gücü", overall_clarity: "Genel Netlik", constructiveness: "Yapıcılık", participation_quality: "Katılım Kalitesi" };
                    return (
                      <div key={key}>
                        <ScoreBar label={labels[key] || key} value={item.score} />
                        {item.description && <p className="text-[10px] text-muted-foreground mt-1">{item.description}</p>}
                        {item.evidence && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 italic border-l-2 border-primary/20 pl-2">"{item.evidence}"</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {a.communication_analysis.communication_style && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">İletişim Stili:</span>
                    <Badge variant="outline" className="text-xs">{a.communication_analysis.communication_style}</Badge>
                  </div>
                )}
              </SectionCard>
            )}

            {/* Detailed Score Breakdown with evidence */}
            {a.scores && typeof a.scores === "object" && Object.values(a.scores).some((s: any) => s?.value !== undefined) && (
              <SectionCard>
                <SectionTitle icon={BarChart3}>Detaylı Skor Tablosu</SectionTitle>
                <div className="space-y-4">
                  {Object.entries(a.scores).filter(([_, v]: any) => v?.value !== undefined).map(([key, item]: [string, any]) => {
                    const labels: Record<string, string> = { relevance_score: "Alaka Skoru", clarity_score: "Netlik Skoru", confidence_score: "Güven Skoru", communication_score: "İletişim Skoru", structure_score: "Yapı Skoru", behavioral_impression_score: "Davranışsal İzlenim", effectiveness_score: "Etkinlik", decision_quality_score: "Karar Kalitesi" };
                    return (
                      <div key={key} className="rounded-lg border border-border p-3 space-y-2">
                        <ScoreBar label={labels[key] || key} value={item.value} />
                        {item.reason && <p className="text-[10px] text-muted-foreground"><strong>Neden:</strong> {item.reason}</p>}
                        {item.evidence && <p className="text-[10px] text-muted-foreground italic border-l-2 border-primary/20 pl-2">"{item.evidence}"</p>}
                        {item.improvement && <p className="text-[10px] text-primary"><strong>Gelişim:</strong> {item.improvement}</p>}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* Improvement Plan */}
            {a.improvement_plan?.length > 0 && (
              <SectionCard className="border-accent/20">
                <SectionTitle icon={TrendingUp}>Gelişim Planı</SectionTitle>
                <div className="space-y-3">
                  {a.improvement_plan.map((item: any, i: number) => (
                    <div key={i} className="rounded-lg border border-border p-3 flex items-start gap-3">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${
                        item.priority === "high" ? "bg-destructive/10 text-destructive" : item.priority === "medium" ? "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]" : "bg-primary/10 text-primary"
                      }`}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold">{item.area}</span>
                          <Badge variant="outline" className={`text-[9px] ${
                            item.priority === "high" ? "border-destructive/30 text-destructive" : item.priority === "medium" ? "border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]" : "border-primary/30 text-primary"
                          }`}>{item.priority === "high" ? "Yüksek" : item.priority === "medium" ? "Orta" : "Düşük"}</Badge>
                        </div>
                        {item.current_level && <p className="text-[10px] text-muted-foreground">Mevcut: {item.current_level}</p>}
                        {item.target && <p className="text-[10px] text-muted-foreground">Hedef: {item.target}</p>}
                        <p className="text-xs text-foreground mt-1">{item.action}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Data Quality Disclaimer */}
            {a.data_quality && (
              <div className="rounded-lg bg-muted/30 border border-border p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <p className="font-medium">Veri Kalitesi: <span className="capitalize">{a.data_quality.overall_confidence}</span></p>
                  <div className="flex flex-wrap gap-2">
                    <span>Transkript: {a.data_quality.transcript_available ? "✓" : "✗"}</span>
                    <span>Ses Analizi: {a.data_quality.audio_analysis_available ? "✓" : "✗"}</span>
                    <span>Görsel Analiz: {a.data_quality.visual_analysis_available ? "✓" : "✗"}</span>
                  </div>
                  {a.data_quality.limitations?.filter(Boolean).length > 0 && (
                    <p>Sınırlamalar: {a.data_quality.limitations.filter(Boolean).join(", ")}</p>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* ═══ 3. BEHAVIORAL INSIGHTS (BİVEYOS) ═══ */}
          {(a.voice_analysis || a.visual_analysis || a.behavioral_interpretation || a.behavior_score !== undefined || a.behavioral_patterns || a.behavior_timeline) && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <Brain className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-display text-sm sm:text-base font-semibold flex items-center gap-2">
                    Davranışsal İçgörüler
                    <Badge className="text-[9px] px-1.5 py-0 bg-gradient-to-r from-primary to-accent text-primary-foreground border-0 shadow-sm">
                      BİVEYOS
                    </Badge>
                  </h3>
                  <p className="text-[10px] text-muted-foreground">Ses, görsel ve davranışsal sinyallerin birleşik analizi</p>
                </div>
              </div>

              {/* Behavior Score — Hero */}
              {a.behavior_score !== undefined && (() => {
                const score = a.behavior_score as number;
                const color = score >= 75 ? "hsl(var(--success))" : score >= 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
                const colorClass = score >= 75 ? "text-[hsl(var(--success))]" : score >= 50 ? "text-[hsl(var(--warning))]" : "text-destructive";
                const bgClass = score >= 75 ? "bg-[hsl(var(--success))]/10" : score >= 50 ? "bg-[hsl(var(--warning))]/10" : "bg-destructive/10";
                const label = score >= 75 ? "İyi" : score >= 50 ? "Orta" : "Zayıf";
                const circumference = 2 * Math.PI * 40;
                const offset = circumference - (score / 100) * circumference;
                return (
                  <SectionCard className="border-primary/20">
                    <div className="flex flex-col sm:flex-row items-center gap-5 p-2">
                      <div className="relative shrink-0">
                        <svg width="110" height="110" viewBox="0 0 110 110">
                          <circle cx="55" cy="55" r="44" fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
                          <circle
                            cx="55" cy="55" r="44" fill="none"
                            stroke={color} strokeWidth="7" strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 44} strokeDashoffset={(2 * Math.PI * 44) - (score / 100) * (2 * Math.PI * 44)}
                            transform="rotate(-90 55 55)"
                            className="transition-all duration-1000"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`font-display text-2xl font-bold ${colorClass}`}>{score}</span>
                          <span className="text-[9px] text-muted-foreground font-medium">/ 100</span>
                        </div>
                      </div>
                      <div className="flex-1 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                          <span className="font-display text-base font-bold text-foreground">Davranış Puanı</span>
                          <Badge className={`${bgClass} ${colorClass} text-[9px] px-1.5 py-0 h-4 border-0`}>{label}</Badge>
                        </div>
                        {a.behavior_score_description && (
                          <p className="text-xs text-muted-foreground leading-relaxed">{a.behavior_score_description}</p>
                        )}
                      </div>
                    </div>
                  </SectionCard>
                );
              })()}

              {/* Voice Analysis */}
              {a.voice_analysis && (
                <SectionCard className="border-primary/20 bg-gradient-to-br from-primary/[0.02] to-accent/[0.02]">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <Mic className="h-4.5 w-4.5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-semibold">Ses Analizi</h3>
                        <p className="text-[10px] text-muted-foreground">Konuşma kalıpları ve ses karakteristikleri</p>
                      </div>
                    </div>
                    {a.voice_analysis.voice_score !== undefined && (
                      <div className="text-center">
                        <div className="font-display text-2xl font-bold text-gradient-primary">{a.voice_analysis.voice_score}</div>
                        <div className="text-[9px] text-muted-foreground">Ses Skoru</div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <VoiceMetricCard icon={Volume2} label="Ses Tonu" value={a.voice_analysis.tone} description={a.voice_analysis.tone_description}
                      valueMap={{ confident: { label: "Güvenli", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", pct: 90 }, neutral: { label: "Nötr", color: "text-[hsl(var(--info))]", bg: "bg-[hsl(var(--info))]/10", pct: 60 }, nervous: { label: "Gergin", color: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/10", pct: 30 } }} />
                    <VoiceMetricCard icon={Gauge} label="Konuşma Hızı" value={a.voice_analysis.speech_speed} description={a.voice_analysis.speech_speed_description}
                      valueMap={{ slow: { label: "Yavaş", color: "text-[hsl(var(--info))]", bg: "bg-[hsl(var(--info))]/10", pct: 30 }, normal: { label: "Normal", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", pct: 65 }, fast: { label: "Hızlı", color: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/10", pct: 90 } }} />
                    <VoiceMetricCard icon={PauseCircle} label="Tereddüt" value={a.voice_analysis.hesitation_level} description={a.voice_analysis.hesitation_description}
                      valueMap={{ low: { label: "Düşük", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", pct: 20 }, medium: { label: "Orta", color: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/10", pct: 55 }, high: { label: "Yüksek", color: "text-destructive", bg: "bg-destructive/10", pct: 85 } }} />
                    <VoiceMetricCard icon={MessageCircle} label="Dolgu Kelimeler" value={a.voice_analysis.filler_words_usage} description={a.voice_analysis.filler_words_description}
                      valueMap={{ low: { label: "Düşük", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", pct: 15 }, medium: { label: "Orta", color: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/10", pct: 50 }, high: { label: "Yüksek", color: "text-destructive", bg: "bg-destructive/10", pct: 80 } }} />
                    <VoiceMetricCard icon={Zap} label="Enerji" value={a.voice_analysis.energy_level} description={a.voice_analysis.energy_description}
                      valueMap={{ low: { label: "Düşük", color: "text-destructive", bg: "bg-destructive/10", pct: 25 }, medium: { label: "Orta", color: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/10", pct: 55 }, high: { label: "Yüksek", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", pct: 90 } }} />
                  </div>
                </SectionCard>
              )}

              {/* Visual Analysis */}
              {a.visual_analysis && (
                <SectionCard className="border-accent/20 bg-gradient-to-br from-accent/[0.02] to-primary/[0.02]">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center">
                        <ScanEye className="h-4.5 w-4.5 text-accent" />
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-semibold">Görsel Analiz</h3>
                        <p className="text-[10px] text-muted-foreground">Video sinyalleri ve görsel davranış göstergeleri</p>
                      </div>
                    </div>
                    {a.visual_analysis.visual_score !== undefined && (
                      <div className="text-center">
                        <div className="font-display text-2xl font-bold text-gradient-primary">{a.visual_analysis.visual_score}</div>
                        <div className="text-[9px] text-muted-foreground">Görsel Skor</div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <VoiceMetricCard icon={Eye} label="Göz Teması" value={a.visual_analysis.eye_contact} description={a.visual_analysis.eye_contact_description}
                      valueMap={{ low: { label: "Düşük", color: "text-destructive", bg: "bg-destructive/10", pct: 25 }, medium: { label: "Orta", color: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/10", pct: 55 }, high: { label: "Yüksek", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", pct: 90 }, insufficient_evidence: { label: "Yetersiz Kanıt", color: "text-muted-foreground", bg: "bg-muted", pct: 18 } }} />
                    <VoiceMetricCard icon={Signal} label="Katılım" value={a.visual_analysis.engagement_level} description={a.visual_analysis.engagement_description}
                      valueMap={{ low: { label: "Düşük", color: "text-destructive", bg: "bg-destructive/10", pct: 20 }, medium: { label: "Orta", color: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/10", pct: 55 }, high: { label: "Yüksek", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", pct: 85 }, insufficient_evidence: { label: "Yetersiz Kanıt", color: "text-muted-foreground", bg: "bg-muted", pct: 18 } }} />
                    <VoiceMetricCard icon={Radio} label="Varlık / Kamera" value={a.visual_analysis.presence} description={a.visual_analysis.presence_description}
                      valueMap={{ active: { label: "Aktif", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", pct: 95 }, inactive: { label: "Pasif", color: "text-destructive", bg: "bg-destructive/10", pct: 15 } }} />
                    <VoiceMetricCard icon={Move} label="Hareket" value={a.visual_analysis.movement_level} description={a.visual_analysis.movement_description}
                      valueMap={{ low: { label: "Düşük", color: "text-[hsl(var(--info))]", bg: "bg-[hsl(var(--info))]/10", pct: 20 }, medium: { label: "Orta", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", pct: 55 }, high: { label: "Yüksek", color: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/10", pct: 85 } }} />
                    <VoiceMetricCard icon={Focus} label="Dikkat Tutarlılığı" value={a.visual_analysis.attention_consistency} description={a.visual_analysis.attention_description}
                      valueMap={{ low: { label: "Düşük", color: "text-destructive", bg: "bg-destructive/10", pct: 20 }, medium: { label: "Orta", color: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/10", pct: 55 }, high: { label: "Yüksek", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", pct: 90 }, insufficient_evidence: { label: "Yetersiz Kanıt", color: "text-muted-foreground", bg: "bg-muted", pct: 18 } }} />
                  </div>
                  {(a.visual_analysis.eye_contact_confidence || a.visual_analysis.script_reading_suspicion || a.visual_analysis.natural_delivery_score !== undefined || a.visual_analysis.spontaneity_proxy !== undefined || a.visual_analysis.delivery_authenticity_notes || a.visual_analysis.gaze_evidence || a.visual_analysis.camera_facing) && (
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
                      <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-foreground">Kanıt Kalibrasyonu</p>
                            <p className="text-[10px] text-muted-foreground">Gaze kanıtı, kamera yönelimi ve güven seviyesi ayrı tutulur.</p>
                          </div>
                          {a.visual_analysis.confidence && (
                            <Badge variant="secondary" className="text-[10px]">
                              Güven: {formatBehavioralLabel(a.visual_analysis.confidence)}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-muted-foreground mb-1">Eye Contact Confidence</p>
                            <p className={`font-semibold ${behavioralToneClass(a.visual_analysis.eye_contact_confidence)}`}>{formatBehavioralLabel(a.visual_analysis.eye_contact_confidence)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-muted-foreground mb-1">Gaze Evidence</p>
                            <p className={`font-semibold ${behavioralToneClass(a.visual_analysis.gaze_evidence)}`}>{formatBehavioralLabel(a.visual_analysis.gaze_evidence)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-muted-foreground mb-1">Camera Facing</p>
                            <p className={`font-semibold ${behavioralToneClass(a.visual_analysis.camera_facing)}`}>{formatBehavioralLabel(a.visual_analysis.camera_facing)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-muted-foreground mb-1">Script Suspicion</p>
                            <p className={`font-semibold ${behavioralToneClass(a.visual_analysis.script_reading_suspicion)}`}>{formatBehavioralLabel(a.visual_analysis.script_reading_suspicion)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-foreground">Delivery Authenticity</p>
                          <p className="text-[10px] text-muted-foreground">Transkript akışı ile görsel sinyaller birlikte değerlendirilir.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-muted-foreground mb-1">Natural Delivery</p>
                            <p className="font-semibold text-foreground">{formatBehavioralLabel(a.visual_analysis.natural_delivery_score)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-muted-foreground mb-1">Spontaneity Proxy</p>
                            <p className="font-semibold text-foreground">{formatBehavioralLabel(a.visual_analysis.spontaneity_proxy)}</p>
                          </div>
                        </div>
                        {a.visual_analysis.delivery_authenticity_notes && (
                          <p className="text-xs text-muted-foreground leading-relaxed">{a.visual_analysis.delivery_authenticity_notes}</p>
                        )}
                      </div>
                    </div>
                  )}
                </SectionCard>
              )}

              {/* Behavioral Patterns */}
              {a.behavioral_patterns && (
                <SectionCard className="border-primary/10">
                  <SectionTitle icon={Activity}>Davranış Kalıpları</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {a.behavioral_patterns.dominant_speaker && (
                      <div className="rounded-lg bg-accent/5 border border-accent/10 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Crown className="h-4 w-4 text-accent" />
                          <span className="text-[10px] font-medium text-muted-foreground">Baskın Konuşmacı</span>
                        </div>
                        <p className="text-sm font-display font-bold">{a.behavioral_patterns.dominant_speaker}</p>
                      </div>
                    )}
                    {a.behavioral_patterns.passive_participants && (
                      <div className="rounded-lg bg-muted/30 border border-border p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <UserX className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[10px] font-medium text-muted-foreground">Pasif Katılımcılar</span>
                        </div>
                        <p className="text-sm font-display font-bold">
                          {Array.isArray(a.behavioral_patterns.passive_participants) ? a.behavioral_patterns.passive_participants.join(", ") : a.behavioral_patterns.passive_participants}
                        </p>
                      </div>
                    )}
                    {a.behavioral_patterns.stress_signals && (
                      <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <span className="text-[10px] font-medium text-muted-foreground">Stres Sinyalleri</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{a.behavioral_patterns.stress_signals}</p>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

              {/* Behavior Timeline */}
              {a.behavior_timeline && (
                <SectionCard className="border-primary/10">
                  <SectionTitle icon={Timer}>Davranış Zaman Çizelgesi</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Başlangıç", data: a.behavior_timeline.start, icon: "🟢" },
                      { label: "Orta", data: a.behavior_timeline.middle, icon: "🔵" },
                      { label: "Son", data: a.behavior_timeline.end, icon: "🟠" },
                    ].map((phase, i) => phase.data && (
                      <div key={i} className="rounded-lg bg-muted/30 border border-border p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span>{phase.icon}</span>
                          <span className="text-xs font-bold text-foreground">{phase.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{typeof phase.data === "string" ? phase.data : phase.data.description || JSON.stringify(phase.data)}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* AI Behavioral Interpretation — Hero Section */}
              {a.behavioral_interpretation && (
                <div className="relative rounded-2xl overflow-hidden">
                  <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-primary via-accent to-primary opacity-60 blur-sm" />
                  <div className="relative rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/[0.06] via-card to-accent/[0.06] p-6 sm:p-8">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
                        <Brain className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <h3 className="font-display text-base sm:text-lg font-bold text-foreground">AI Davranışsal Yorum</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className="bg-gradient-to-r from-primary to-accent text-primary-foreground text-[9px] px-2 py-0 h-4 border-0 shadow-sm">
                            BİVEYOS
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">Transkript + Ses + Görsel sinyaller birleşik</span>
                        </div>
                      </div>
                    </div>
                    <div className="relative pl-4 border-l-2 border-primary/40">
                      <Sparkles className="absolute -left-[9px] top-0 h-4 w-4 text-primary" />
                      <p className="text-sm sm:text-base leading-relaxed text-foreground/90 font-medium">
                        {a.behavioral_interpretation}
                      </p>
                    </div>
                    <div className="flex items-start gap-2 mt-4 pt-3 border-t border-border/50">
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        AI gözlemlerine dayalı içgörülerdir ve kesin teşhis niteliği taşımaz. Davranışsal yorumlar olası eğilimleri yansıtır.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ 4. ACTION ITEMS ═══ */}
          <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                  <ListChecks className="h-4 w-4 text-accent" />
                </div>
                <h3 className="font-display text-sm sm:text-base font-semibold">Aksiyonlar ve Kararlar</h3>
              </div>

              {/* Key Topics + Decisions in a grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {a.key_topics?.length > 0 && (
                  <SectionCard>
                    <SectionTitle icon={FileText}>Ana Konular</SectionTitle>
                    <ul className="space-y-2">{a.key_topics.map((t: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm"><span className="text-primary font-bold">•</span><span className="text-muted-foreground">{t}</span></li>
                    ))}</ul>
                  </SectionCard>
                )}
                {a.decisions_made?.length > 0 && (
                  <SectionCard className="border-primary/10 bg-primary/[0.02]">
                    <SectionTitle icon={CheckCircle2}>Alınan Kararlar</SectionTitle>
                    {renderStructuredCollection(a.decisions_made)}
                  </SectionCard>
                )}
              </div>

              {/* Interactive Action Items */}
              <SectionCard className="border-accent/10 bg-accent/[0.02]">
                <SectionTitle icon={Target}>Aksiyon Maddeleri</SectionTitle>
                <ActionItemsList
                  recordingId={recording.id}
                  analysisActionItems={a.action_items}
                />
              </SectionCard>

              {a.recommendations?.length > 0 && (
                <SectionCard>
                  <SectionTitle icon={Lightbulb}>Öneriler</SectionTitle>
                  <ul className="space-y-2">{a.recommendations.map((rec: string, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="h-5 w-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 font-display">{i + 1}</span>
                      <span className="text-muted-foreground">{rec}</span>
                    </li>
                  ))}</ul>
                </SectionCard>
              )}
            </div>

          {/* ── AI Smart Recommendations ── */}
          {smartInsights.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <Lightbulb className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-display text-sm sm:text-base font-semibold">AI Akıllı Öneriler</h3>
                  <p className="text-[10px] text-muted-foreground">Analiz verilerine dayalı tespit ve öneriler</p>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {smartInsights.map((insight, i) => (
                  <SmartInsightCard key={i} insight={insight} />
                ))}
              </div>
            </div>
          )}

          {/* ═══ 5. SPEECH INSIGHTS ═══ */}
          {(a.speech_insights?.length > 0 || a.voice_analysis) && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[hsl(var(--info))]/10 flex items-center justify-center">
                  <Mic className="h-4 w-4 text-[hsl(var(--info))]" />
                </div>
                <div>
                  <h3 className="font-display text-sm sm:text-base font-semibold">Konuşma İçgörüleri</h3>
                  <p className="text-[10px] text-muted-foreground">Konuşma kalıpları ve ses analizi bulguları</p>
                </div>
              </div>
              <SpeechInsightsSection analysisData={a} />
            </div>
          )}

          {/* ═══ 6. TRANSCRIPT ═══ */}
          <SectionCard>
            <SectionTitle icon={MessageSquare}>Transkript</SectionTitle>
            <SmartTranscriptViewer transcript={recording.transcript || ""} />
          </SectionCard>

        </div>
      )}
    </div>
  );
};

export default MeetingDetailPage;
