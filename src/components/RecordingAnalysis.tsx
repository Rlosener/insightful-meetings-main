import { CheckCircle2, AlertCircle, TrendingUp, User, Briefcase, Target, ThumbsUp, ThumbsDown, Download, Users, Star, ShieldAlert, Award, MessageSquare, Brain, Sparkles, BarChart3, Lightbulb, XCircle, AlertTriangle, Mic, Zap } from "lucide-react";
import SmartTranscriptViewer from "@/components/SmartTranscriptViewer";
import SpeechInsightsSection from "@/components/SpeechInsightsSection";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { RecordingInfo } from "@/types/recording";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import jsPDF from "jspdf";
import { toast } from "sonner";
import "jspdf/dist/polyfills.es.js";

const ScoreBar = ({ label, value, size = "default" }: { label: string; value: number; size?: "default" | "sm" }) => (
  <div>
    <div className={`flex items-center justify-between mb-1.5 ${size === "sm" ? "text-xs" : "text-sm"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-display font-bold text-foreground">{value}</span>
    </div>
    <div className={`${size === "sm" ? "h-1.5" : "h-2"} rounded-full bg-muted overflow-hidden`}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${value}%`,
          background: value >= 80 ? "hsl(var(--success, 142 76% 36%))" : value >= 60 ? "hsl(var(--warning, 38 92% 50%))" : "hsl(var(--destructive))",
        }}
      />
    </div>
  </div>
);

const ScoreCircle = ({ value, label, size = "lg" }: { value: number; label: string; size?: "lg" | "sm" }) => {
  const color = value >= 80 ? "text-[hsl(var(--success,142_76%_36%))]" : value >= 60 ? "text-[hsl(var(--warning,38_92%_50%))]" : "text-destructive";
  return (
    <div className="text-center">
      <div className={`font-display font-bold ${color} ${size === "lg" ? "text-4xl" : "text-2xl"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
};

const HiringBadge = ({ decision }: { decision: string }) => {
  const map: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
    strongly_recommend: { label: "Kesinlikle Önerilir", cls: "bg-[hsl(var(--success,142_76%_36%))]/10 text-[hsl(var(--success,142_76%_36%))] border-[hsl(var(--success,142_76%_36%))]/30", icon: Award },
    recommend: { label: "Önerilir", cls: "bg-primary/10 text-primary border-primary/30", icon: ThumbsUp },
    consider: { label: "Değerlendirilebilir", cls: "bg-[hsl(var(--warning,38_92%_50%))]/10 text-[hsl(var(--warning,38_92%_50%))] border-[hsl(var(--warning,38_92%_50%))]/30", icon: AlertTriangle },
    not_recommend: { label: "Önerilmez", cls: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  };
  const item = map[decision] || map.consider;
  const Icon = item.icon;
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${item.cls} font-display font-semibold text-sm`}>
      <Icon className="h-4 w-4" /> {item.label}
    </div>
  );
};

interface Props {
  duration: number;
  info: RecordingInfo;
  analysisData: any;
  transcript: string;
}

const RecordingAnalysis = ({ duration, info, analysisData, transcript }: Props) => {
  const exportToPDF = () => {
    try {
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginX = 48;
      const bottomY = pageHeight - 48;
      const maxWidth = pageWidth - marginX * 2;
      let yPos = 64;

      const addHeader = () => {
        pdf.setFont("times", "bold");
        pdf.setFontSize(14);
        pdf.text("Donebird", marginX, 32);
        pdf.setFont("times", "normal");
        pdf.setFontSize(10);
        pdf.text(info.type === "mülakat" ? "Mülakat Analiz Raporu" : "Toplantı Analiz Raporu", marginX + 70, 32);
        pdf.setDrawColor(210);
        pdf.setLineWidth(1);
        pdf.line(marginX, 42, pageWidth - marginX, 42);
        yPos = 64;
      };

      const addPage = () => { pdf.addPage(); addHeader(); };
      const ensureSpace = (needed: number) => { if (yPos + needed > bottomY) addPage(); };
      const addSectionTitle = (title: string) => {
        ensureSpace(28);
        pdf.setFont("times", "bold");
        pdf.setFontSize(12);
        pdf.text(title, marginX, yPos);
        yPos += 16;
        pdf.setFont("times", "normal");
        pdf.setFontSize(10);
      };
      const addWrappedText = (text: string, indent = 0, fontSize = 10, lineGap = 14) => {
        if (!text) return;
        pdf.setFontSize(fontSize);
        const lines = pdf.splitTextToSize(text, maxWidth - indent);
        ensureSpace(lines.length * lineGap);
        pdf.text(lines, marginX + indent, yPos);
        yPos += lines.length * lineGap;
      };
      const addKeyValue = (label: string, value?: string) => {
        if (!value) return;
        ensureSpace(16);
        pdf.setFont("times", "bold");
        pdf.text(`${label}:`, marginX, yPos);
        pdf.setFont("times", "normal");
        pdf.text(value, marginX + 90, yPos);
        yPos += 16;
      };
      const drawScoreBar = (label: string, score: number) => {
        ensureSpace(34);
        pdf.setFont("times", "bold");
        pdf.setFontSize(10);
        pdf.text(label, marginX, yPos);
        pdf.setFont("times", "normal");
        pdf.text(`${score}/100`, pageWidth - marginX, yPos, { align: "right" });
        const barY = yPos + 8;
        pdf.setFillColor(240, 240, 240);
        pdf.roundedRect(marginX, barY, maxWidth, 8, 4, 4, "FD");
        pdf.setFillColor(80, 80, 80);
        pdf.roundedRect(marginX, barY, Math.max(0, Math.min(1, score / 100)) * maxWidth, 8, 4, 4, "F");
        yPos += 24;
      };
      const addBulletList = (items: string[], indent = 14) => {
        items.forEach((it) => {
          const lines = pdf.splitTextToSize(`• ${it}`, maxWidth - indent);
          ensureSpace(lines.length * 14);
          pdf.text(lines, marginX + indent, yPos);
          yPos += lines.length * 14;
        });
      };

      const safe = (v: unknown) => (v ? String(v) : "");
      const candidateName = `${safe(info.candidateName)} ${safe(info.candidateSurname)}`.trim() || "-";

      addHeader();
      addSectionTitle("Bilgiler");
      addKeyValue("Aday", candidateName);
      addKeyValue("Pozisyon", safe(info.position) || "-");
      if (info.department) addKeyValue("Departman", safe(info.department));
      addKeyValue("Tarih", new Date().toLocaleString("tr-TR"));
      addKeyValue("Süre", `${Math.round(duration / 60)} dk`);

      addSectionTitle("Skor Özeti");
      drawScoreBar("Genel Skor", Number(analysisData?.overall_score ?? 0));
      drawScoreBar("Pozisyon Uyumu", Number(analysisData?.position_fit ?? 0));
      drawScoreBar("İletişim Netliği", Number(analysisData?.communication_clarity ?? 0));
      drawScoreBar("Güven Seviyesi", Number(analysisData?.confidence_level ?? 0));

      if (analysisData?.hiring_recommendation) {
        addSectionTitle("İşe Alım Tavsiyesi");
        const dec: Record<string, string> = { strongly_recommend: "Kesinlikle Önerilir", recommend: "Önerilir", consider: "Değerlendirilebilir", not_recommend: "Önerilmez" };
        addWrappedText(`Karar: ${dec[analysisData.hiring_recommendation.decision] || "-"}`);
        addWrappedText(analysisData.hiring_recommendation.summary);
      }

      if (analysisData?.summary) { addSectionTitle("Özet"); addWrappedText(String(analysisData.summary)); }
      if (analysisData?.general_comment) { addSectionTitle("Genel Yorum"); addWrappedText(String(analysisData.general_comment)); }

      if (analysisData?.answer_by_answer?.length > 0) {
        addSectionTitle("Soru-Soru Analiz");
        analysisData.answer_by_answer.forEach((a: any, i: number) => {
          ensureSpace(80);
          pdf.setFont("times", "bold");
          pdf.text(`${i + 1}. ${a.question}`, marginX, yPos);
          yPos += 14;
          pdf.setFont("times", "normal");
          addWrappedText(`Cevap: ${a.answer_summary}`, 10);
          addWrappedText(`Kalite: ${a.quality_score}/100 | Netlik: ${a.clarity_score}/100 | Derinlik: ${a.depth_score}/100`, 10);
          addWrappedText(`AI: ${a.ai_feedback}`, 10);
          yPos += 6;
        });
      }

      if (Array.isArray(analysisData?.recommendations) && analysisData.recommendations.length > 0) {
        addSectionTitle("Öneriler");
        addBulletList(analysisData.recommendations.map(String));
      }
      if (transcript) { addPage(); addSectionTitle("Mülakat Transkripti"); pdf.setFont("courier", "normal"); addWrappedText(transcript, 0, 9, 12); }

      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFont("times", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(120);
        pdf.text(`Sayfa ${i}/${totalPages}`, pageWidth - marginX, pageHeight - 22, { align: "right" });
        pdf.setTextColor(0);
      }

      pdf.save(`Mulakat_${candidateName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
      toast.success("PDF başarıyla indirildi");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("PDF oluşturulurken bir hata oluştu");
    }
  };

  // Meeting Analysis Display
  if (info.type === "toplantı") {
    const meetingData = analysisData;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <h2 className="font-display text-2xl font-bold">Toplantı Analiz Sonuçları</h2>
          </div>
        </div>

        {/* Hero Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <div className="flex items-start gap-6">
            <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-xl font-bold mb-1">{info.meetingTopic}</h3>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                {info.meetingAgenda && <span><strong className="text-foreground">Gündem:</strong> {info.meetingAgenda}</span>}
                {info.participants && <span><strong className="text-foreground">Katılımcılar:</strong> {info.participants.join(", ")}</span>}
              </div>
            </div>
            <ScoreCircle value={meetingData.overall_score || 0} label="Etkinlik Skoru" />
          </div>
        </div>

        {/* Meeting Verdict */}
        {meetingData.meeting_verdict && (
          <div className={`rounded-xl border-2 p-5 shadow-card ${
            meetingData.meeting_verdict.quality === "high" ? "border-green-500/30 bg-green-500/5" :
            meetingData.meeting_verdict.quality === "low" ? "border-destructive/30 bg-destructive/5" :
            "border-yellow-500/30 bg-yellow-500/5"
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <Target className="h-5 w-5 text-primary" />
              <h3 className="font-display text-lg font-semibold">Toplantı Kararı</h3>
              <Badge className={`text-[10px] border-0 ${
                meetingData.meeting_verdict.quality === "high" ? "bg-green-500/10 text-green-600" :
                meetingData.meeting_verdict.quality === "low" ? "bg-destructive/10 text-destructive" :
                "bg-yellow-500/10 text-yellow-600"
              }`}>
                {meetingData.meeting_verdict.quality === "high" ? "Yüksek Kalite" :
                 meetingData.meeting_verdict.quality === "low" ? "Düşük Kalite" : "Orta Kalite"}
              </Badge>
            </div>
            {meetingData.meeting_verdict.main_issue && (
              <p className="text-sm text-muted-foreground mb-2"><strong className="text-foreground">Ana Sorun:</strong> {meetingData.meeting_verdict.main_issue}</p>
            )}
            {meetingData.meeting_verdict.improvement_suggestion && (
              <p className="text-sm text-muted-foreground mb-2"><strong className="text-foreground">İyileştirme:</strong> {meetingData.meeting_verdict.improvement_suggestion}</p>
            )}
            <div className="grid grid-cols-2 gap-3 mt-3">
              {meetingData.meeting_verdict.agenda_coverage && (
                <div className="text-xs p-2 rounded-lg bg-card border border-border">
                  <p className="font-semibold text-foreground mb-0.5">Gündem Takibi</p>
                  <p className="text-muted-foreground">{meetingData.meeting_verdict.agenda_coverage}</p>
                </div>
              )}
              {meetingData.meeting_verdict.time_efficiency && (
                <div className="text-xs p-2 rounded-lg bg-card border border-border">
                  <p className="font-semibold text-foreground mb-0.5">Zaman Verimliliği</p>
                  <p className="text-muted-foreground">{meetingData.meeting_verdict.time_efficiency}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Insights */}
        {meetingData.top_insights?.length > 0 && (
          <div className="rounded-2xl border-2 border-accent/30 bg-gradient-to-br from-accent/5 via-card to-primary/5 p-5 shadow-card">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center shadow-lg">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <h3 className="font-display text-base font-bold">Kritik İçgörüler</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {meetingData.top_insights.slice(0, 3).map((insight: string, i: number) => (
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

        {/* Executive Summary */}
        {meetingData.executive_summary && (
          <div className="rounded-xl border border-primary/20 bg-card p-6 shadow-card">
            <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Yönetici Özeti
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {meetingData.executive_summary.overall_evaluation && (
                <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                  <p className="text-[10px] font-bold text-primary mb-1 uppercase tracking-wider">Genel Değerlendirme</p>
                  <p className="text-sm text-foreground">{meetingData.executive_summary.overall_evaluation}</p>
                </div>
              )}
              {meetingData.executive_summary.key_strength && (
                <div className="rounded-lg bg-green-500/5 border border-green-500/10 p-3">
                  <p className="text-[10px] font-bold text-green-600 mb-1 uppercase tracking-wider">Güçlü Yön</p>
                  <p className="text-sm text-foreground">{meetingData.executive_summary.key_strength}</p>
                </div>
              )}
              {meetingData.executive_summary.key_risk && (
                <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3">
                  <p className="text-[10px] font-bold text-destructive mb-1 uppercase tracking-wider">Ana Risk</p>
                  <p className="text-sm text-foreground">{meetingData.executive_summary.key_risk}</p>
                </div>
              )}
              {meetingData.executive_summary.final_recommendation && (
                <div className="rounded-lg bg-accent/5 border border-accent/10 p-3">
                  <p className="text-[10px] font-bold text-accent mb-1 uppercase tracking-wider">Sonraki Adım</p>
                  <p className="text-sm text-foreground">{meetingData.executive_summary.final_recommendation}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Effectiveness Scores */}
        {meetingData.meeting_effectiveness && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Toplantı Etkinliği
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <ScoreBar label="Gündem Takibi" value={meetingData.meeting_effectiveness.agenda_adherence || 0} />
              <ScoreBar label="Zaman Yönetimi" value={meetingData.meeting_effectiveness.time_management || 0} />
              <ScoreBar label="Karar Alma" value={meetingData.meeting_effectiveness.decision_making || 0} />
              <ScoreBar label="Katılım Dengesi" value={meetingData.meeting_effectiveness.participation_balance || 0} />
            </div>
          </div>
        )}

        {/* Deep Analysis Cards */}
        <div className="grid lg:grid-cols-2 gap-4">
          {meetingData.agenda_adherence_analysis && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="font-display font-semibold mb-2 text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> Gündem Takibi Analizi
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{meetingData.agenda_adherence_analysis}</p>
            </div>
          )}
          {meetingData.decision_quality_analysis && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="font-display font-semibold mb-2 text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" /> Karar Alma Kalitesi
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{meetingData.decision_quality_analysis}</p>
            </div>
          )}
          {meetingData.action_ownership_analysis && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="font-display font-semibold mb-2 text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" /> Aksiyon Sahipliği
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{meetingData.action_ownership_analysis}</p>
            </div>
          )}
          {meetingData.participation_balance_analysis && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="font-display font-semibold mb-2 text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Katılım Dengesi
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{meetingData.participation_balance_analysis}</p>
            </div>
          )}
        </div>

        {meetingData.summary && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h3 className="font-display font-semibold mb-2">Toplantı Özeti</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{meetingData.summary}</p>
          </div>
        )}

        {/* Participants */}
        {meetingData.participants_analysis?.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-display text-lg font-semibold">Katılımcı Analizleri</h3>
            <div className="grid lg:grid-cols-2 gap-4">
              {meetingData.participants_analysis.map((p: any, idx: number) => (
                <div key={idx} className="rounded-xl border border-border bg-card p-5 shadow-card">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center"><User className="h-5 w-5 text-accent" /></div>
                      <div>
                        <h4 className="font-display font-semibold">{p.name}</h4>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs text-muted-foreground">{p.communication_style}</p>
                          {p.speaking_balance && (
                            <Badge variant="outline" className={`text-[9px] ${
                              p.speaking_balance === "dominant" ? "text-yellow-600 border-yellow-500/30" :
                              p.speaking_balance === "passive" ? "text-muted-foreground" : "text-green-600 border-green-500/30"
                            }`}>
                              {p.speaking_balance === "dominant" ? "Baskın" : p.speaking_balance === "passive" ? "Pasif" : "Dengeli"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <ScoreCircle value={p.contribution_score} label="Katkı" size="sm" />
                  </div>
                  {p.key_contributions?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-bold text-accent mb-1">Önemli Katkılar</p>
                      <ul className="space-y-0.5">{p.key_contributions.map((c: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs"><Sparkles className="h-3 w-3 text-accent shrink-0 mt-0.5" /><span className="text-muted-foreground">{c}</span></li>
                      ))}</ul>
                    </div>
                  )}
                  {p.strengths?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-bold text-primary mb-1">Güçlü Yönler</p>
                      <ul className="space-y-0.5">{p.strengths.map((s: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs"><CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" /><span className="text-muted-foreground">{s}</span></li>
                      ))}</ul>
                    </div>
                  )}
                  {p.areas_for_improvement?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-destructive mb-1">Gelişim Alanları</p>
                      <ul className="space-y-0.5">{p.areas_for_improvement.map((a: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs"><AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" /><span className="text-muted-foreground">{a}</span></li>
                      ))}</ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Critical Moments */}
        {meetingData.critical_moments?.length > 0 && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-6 shadow-card">
            <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" /> Kritik Anlar
            </h3>
            <div className="space-y-3">
              {meetingData.critical_moments.map((m: any, i: number) => (
                <div key={i} className={`p-3 rounded-lg border ${
                  m.impact === "positive" ? "border-green-500/20 bg-green-500/5" :
                  m.impact === "negative" ? "border-destructive/20 bg-destructive/5" :
                  "border-border bg-card"
                }`}>
                  <p className="text-sm font-medium text-foreground">{m.moment || m.description}</p>
                  {m.why_it_matters && <p className="text-xs text-muted-foreground mt-1">{m.why_it_matters}</p>}
                  {m.transcript_excerpt && (
                    <p className="text-[10px] text-muted-foreground italic mt-1.5 border-t border-border/50 pt-1.5">"{m.transcript_excerpt}"</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Decisions + Actions + Topics Grid */}
        <div className="grid lg:grid-cols-3 gap-4">
          {meetingData.key_topics?.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="font-display font-semibold mb-3 text-sm">Ana Konular</h3>
              <ul className="space-y-1.5">{meetingData.key_topics.map((t: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm"><span className="text-primary font-bold">•</span><span className="text-muted-foreground">{t}</span></li>
              ))}</ul>
            </div>
          )}
          {(Array.isArray(meetingData.decisions_made) && meetingData.decisions_made.length > 0) && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 shadow-card">
              <h3 className="font-display font-semibold mb-3 text-sm">Alınan Kararlar</h3>
              <ul className="space-y-2">{meetingData.decisions_made.map((d: any, i: number) => {
                const decision = typeof d === "string" ? d : d?.decision;
                const context = typeof d === "object" ? d?.context : null;
                const confidence = typeof d === "object" ? d?.confidence : null;
                return (
                  <li key={i} className="text-sm">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="text-muted-foreground">{decision}</span>
                        {context && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{context}</p>}
                        {confidence && <Badge variant="outline" className="text-[9px] mt-1">{confidence}</Badge>}
                      </div>
                    </div>
                  </li>
                );
              })}</ul>
            </div>
          )}
          {(Array.isArray(meetingData.action_items) && meetingData.action_items.length > 0) && (
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 shadow-card">
              <h3 className="font-display font-semibold mb-3 text-sm">Eylem Maddeleri</h3>
              <ul className="space-y-2">{meetingData.action_items.map((item: any, i: number) => {
                const task = typeof item === "string" ? item : item?.task_description;
                const owner = typeof item === "object" ? item?.owner : null;
                const priority = typeof item === "object" ? item?.priority : null;
                return (
                  <li key={i} className="text-sm">
                    <div className="flex items-start gap-2">
                      <Target className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                      <div>
                        <span className="text-muted-foreground">{task}</span>
                        {(owner || priority) && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {owner && <span className="text-[10px] text-foreground font-medium">{owner}</span>}
                            {priority && <Badge variant="outline" className={`text-[9px] ${priority === "high" ? "text-destructive border-destructive/30" : ""}`}>{priority}</Badge>}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}</ul>
            </div>
          )}
        </div>

        {/* Unresolved Topics */}
        {(meetingData.unresolved_topics?.length > 0 || meetingData.unresolved_issues?.length > 0) && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5 shadow-card">
            <h3 className="font-display font-semibold mb-3 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" /> Kapanmayan / Çözümsüz Konular
            </h3>
            <ul className="space-y-1.5">
              {[...(meetingData.unresolved_topics || []), ...(meetingData.unresolved_issues || [])].map((t: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* General Comment */}
        {meetingData.general_comment && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-card">
            <h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Genel Değerlendirme
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{meetingData.general_comment}</p>
          </div>
        )}

        {/* Recommendations + Follow-ups */}
        {(meetingData.recommendations?.length > 0 || meetingData.follow_up_recommendations?.length > 0 || meetingData.next_step_recommendations?.length > 0) && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-6 shadow-card">
            <h3 className="font-display text-lg font-semibold mb-4">Öneriler & Sonraki Adımlar</h3>
            <ul className="space-y-2">
              {[...(meetingData.recommendations || []), ...(meetingData.follow_up_recommendations || []), ...(meetingData.next_step_recommendations || [])]
                .filter((v, i, a) => a.indexOf(v) === i) // dedupe
                .map((rec: string, i: number) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="h-5 w-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 font-display">{i + 1}</span>
                  <span className="text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Improvement Plan */}
        {meetingData.improvement_plan?.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" /> İyileştirme Planı
            </h3>
            <div className="space-y-3">
              {meetingData.improvement_plan.map((item: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <Badge variant="outline" className={`text-[9px] shrink-0 mt-0.5 ${item.priority === "high" ? "text-destructive border-destructive/30" : item.priority === "medium" ? "text-yellow-600 border-yellow-500/30" : ""}`}>
                    {item.priority === "high" ? "Yüksek" : item.priority === "medium" ? "Orta" : "Düşük"}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.area}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        {transcript && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h3 className="font-display text-lg font-semibold mb-4">Toplantı Transkripti</h3>
            <SmartTranscriptViewer transcript={transcript} />
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // PREMIUM INTERVIEW ANALYSIS
  // ═══════════════════════════════════════════

  const a = analysisData;
  const categories = a?.categories || {};
  const hiringRec = a?.hiring_recommendation;
  const answerByAnswer = a?.answer_by_answer || [];

  const radarData = [
    { subject: "Teknik", score: categories.technical_skills?.score || 0 },
    { subject: "İletişim", score: categories.communication?.score || 0 },
    { subject: "Problem Çözme", score: categories.problem_solving?.score || 0 },
    { subject: "Kültürel Uyum", score: categories.cultural_fit?.score || 0 },
  ];

  const metricScores = [
    { label: "İletişim Netliği", value: a?.communication_clarity },
    { label: "Güven Seviyesi", value: a?.confidence_level },
    { label: "Yapısal Düşünme", value: a?.structured_thinking },
    { label: "Yanıt İlgililiği", value: a?.answer_relevance },
    { label: "Yanıt Derinliği", value: a?.answer_depth },
    { label: "Tutarlılık", value: a?.consistency },
    { label: "Problem Çözme", value: a?.problem_solving_signals },
    { label: "Liderlik Sinyalleri", value: a?.leadership_signals },
    { label: "Yaratıcılık", value: a?.creativity_signals },
  ].filter(m => m.value !== undefined && m.value !== null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Briefcase className="h-6 w-6 text-accent" />
          <h2 className="font-display text-2xl font-bold">Mülakat Analiz Raporu</h2>
          <Badge className="text-[9px] px-1.5 py-0 bg-gradient-to-r from-primary to-accent text-primary-foreground border-0 shadow-sm">
            Premium AI
          </Badge>
        </div>
        <Button variant="hero" onClick={exportToPDF}>
          <Download className="mr-2 h-4 w-4" /> PDF İndir
        </Button>
      </div>

      {/* Candidate Info + Score Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-start gap-6">
          <div className="h-16 w-16 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <User className="h-8 w-8 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl font-bold mb-1">{info.candidateName} {info.candidateSurname}</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span><strong className="text-foreground">Pozisyon:</strong> {info.position}</span>
              {info.department && <span><strong className="text-foreground">Departman:</strong> {info.department}</span>}
              {info.candidateCurrentRole && <span><strong className="text-foreground">Mevcut Rol:</strong> {info.candidateCurrentRole}</span>}
              {info.candidateExperience && <span><strong className="text-foreground">Deneyim:</strong> {info.candidateExperience}</span>}
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <ScoreCircle value={a?.overall_score || 0} label="Genel Skor" />
            <ScoreCircle value={a?.position_fit || 0} label="Pozisyon Uyumu" />
          </div>
        </div>
      </div>

      {/* Hiring Recommendation */}
      {hiringRec && (
        <div className="rounded-xl border-2 border-accent/30 bg-gradient-to-br from-accent/5 via-card to-primary/5 p-6 shadow-card">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Award className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-display text-lg font-semibold">İşe Alım Tavsiyesi</h3>
            </div>
            <HiringBadge decision={hiringRec.decision} />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{hiringRec.summary}</p>
          {hiringRec.confidence && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Tavsiye güven seviyesi:</span>
              <Progress value={hiringRec.confidence} className="h-1.5 w-24" />
              <span className="font-bold text-foreground">%{hiringRec.confidence}</span>
            </div>
          )}
          {hiringRec.conditions?.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs font-semibold mb-1 text-foreground">Koşullar:</p>
              <ul className="space-y-1">{hiringRec.conditions.map((c: string, i: number) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <AlertCircle className="h-3 w-3 text-[hsl(var(--warning,38_92%_50%))] shrink-0 mt-0.5" /> {c}
                </li>
              ))}</ul>
            </div>
          )}
        </div>
      )}

      {/* Top Insights */}
      {a?.top_insights?.length > 0 && (
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

      {/* Executive Summary */}
      {a?.executive_summary && (
        <div className="rounded-xl border border-primary/20 bg-card p-6 shadow-card">
          <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Yönetici Özeti
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {a.executive_summary.overall_evaluation && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                <p className="text-[10px] font-bold text-primary mb-1 uppercase tracking-wider">Genel Değerlendirme</p>
                <p className="text-sm text-foreground">{a.executive_summary.overall_evaluation}</p>
              </div>
            )}
            {a.executive_summary.key_strength && (
              <div className="rounded-lg bg-[hsl(var(--success,142_76%_36%))]/5 border border-[hsl(var(--success,142_76%_36%))]/10 p-3">
                <p className="text-[10px] font-bold text-[hsl(var(--success,142_76%_36%))] mb-1 uppercase tracking-wider">Temel Güç</p>
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
        </div>
      )}

      {/* Score Breakdown */}
      {metricScores.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Skor Dağılımı
          </h3>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
            {metricScores.map((m, i) => (
              <ScoreBar key={i} label={m.label} value={Number(m.value)} />
            ))}
          </div>
        </div>
      )}

      {/* Tabbed Analysis */}
      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="bg-muted/50 p-1 flex-wrap h-auto">
          <TabsTrigger value="overview" className="text-xs gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Özet</TabsTrigger>
          <TabsTrigger value="scores" className="text-xs gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Detay Skorlar</TabsTrigger>
          <TabsTrigger value="answers" className="text-xs gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Soru Analizi</TabsTrigger>
          <TabsTrigger value="speech" className="text-xs gap-1.5"><Mic className="h-3.5 w-3.5" /> Konuşma</TabsTrigger>
          <TabsTrigger value="strengths" className="text-xs gap-1.5"><Star className="h-3.5 w-3.5" /> Güçlü/Zayıf</TabsTrigger>
          <TabsTrigger value="transcript" className="text-xs gap-1.5"><Briefcase className="h-3.5 w-3.5" /> Transkript</TabsTrigger>
        </TabsList>

        {/* ═══ OVERVIEW ═══ */}
        <TabsContent value="overview" className="space-y-5">
          {/* Radar + Position Fit */}
          <div className="rounded-xl border-2 border-accent/30 bg-accent/5 p-6 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <Target className="h-5 w-5 text-accent" />
              <h3 className="font-display text-lg font-semibold">Pozisyon Uygunluğu</h3>
            </div>
            <div className="flex items-center gap-6">
              <ScoreCircle value={a?.position_fit || 0} label="Uygunluk" />
              <div className="flex-1 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(220 14% 20%)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(215 12% 50%)", fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="score" stroke="hsl(168 80% 50%)" fill="hsl(168 80% 50%)" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Summary */}
          {a?.summary && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <h3 className="font-display font-semibold mb-2 flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" /> AI Değerlendirmesi
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{a.summary}</p>
            </div>
          )}

          {/* Interview Summary */}
          {a?.interview_summary && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-card">
              <h3 className="font-display font-semibold mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" /> Mülakat Özeti
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{a.interview_summary}</p>
            </div>
          )}

          {/* General Comment */}
          {a?.general_comment && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-card">
              <h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" /> Genel Yorum
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{a.general_comment}</p>
            </div>
          )}

          {/* Recommendations */}
          {a?.recommendations?.length > 0 && (
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-6 shadow-card">
              <h3 className="font-display text-lg font-semibold mb-4">Öneriler</h3>
              <ul className="space-y-2">{a.recommendations.map((rec: string, i: number) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="h-5 w-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 font-display">{i + 1}</span>
                  <span className="text-muted-foreground">{rec}</span>
                </li>
              ))}</ul>
            </div>
          )}
        </TabsContent>

        {/* ═══ DETAILED SCORES ═══ */}
        <TabsContent value="scores" className="space-y-5">
          {/* Metric Scores Grid */}
          {metricScores.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> Detaylı Performans Metrikleri
              </h3>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                {metricScores.map((m, i) => (
                  <ScoreBar key={i} label={m.label} value={Number(m.value)} />
                ))}
              </div>
            </div>
          )}

          {/* Signal indicators */}
          <div className="grid grid-cols-2 gap-4">
            {a?.hesitation_level && (
              <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-xs text-muted-foreground mb-1">Tereddüt Seviyesi</p>
                <Badge className={`${a.hesitation_level === "low" ? "bg-[hsl(var(--success,142_76%_36%))]/10 text-[hsl(var(--success,142_76%_36%))]" : a.hesitation_level === "high" ? "bg-destructive/10 text-destructive" : "bg-[hsl(var(--warning,38_92%_50%))]/10 text-[hsl(var(--warning,38_92%_50%))]"} border-0`}>
                  {a.hesitation_level === "low" ? "Düşük" : a.hesitation_level === "high" ? "Yüksek" : "Orta"}
                </Badge>
              </div>
            )}
            {a?.filler_words_level && (
              <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-xs text-muted-foreground mb-1">Dolgu Kelime Kullanımı</p>
                <Badge className={`${a.filler_words_level === "low" ? "bg-[hsl(var(--success,142_76%_36%))]/10 text-[hsl(var(--success,142_76%_36%))]" : a.filler_words_level === "high" ? "bg-destructive/10 text-destructive" : "bg-[hsl(var(--warning,38_92%_50%))]/10 text-[hsl(var(--warning,38_92%_50%))]"} border-0`}>
                  {a.filler_words_level === "low" ? "Düşük" : a.filler_words_level === "high" ? "Yüksek" : "Orta"}
                </Badge>
              </div>
            )}
          </div>

          {/* Category Details */}
          {Object.keys(categories).length > 0 && (
            <div className="grid lg:grid-cols-2 gap-5">
              {Object.entries(categories).map(([key, data]: [string, any]) => {
                const titles: Record<string, string> = {
                  technical_skills: "Teknik Beceriler",
                  communication: "İletişim",
                  problem_solving: "Problem Çözme",
                  cultural_fit: "Kültürel Uyum",
                };
                return (
                  <div key={key} className="rounded-xl border border-border bg-card p-6 shadow-card">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-display font-semibold">{titles[key] || key}</h3>
                      <span className="font-display text-xl font-bold text-primary">{data.score}</span>
                    </div>
                    {data.description && <p className="text-xs text-muted-foreground mb-3">{data.description}</p>}
                    <ScoreBar label="" value={data.score} size="sm" />
                    {data.strengths?.length > 0 && (
                      <div className="mt-3 mb-2">
                        <p className="text-xs font-bold text-primary mb-1.5">Güçlü Yönler</p>
                        <ul className="space-y-1">{data.strengths.map((s: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-xs"><CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" /><span className="text-muted-foreground">{s}</span></li>
                        ))}</ul>
                      </div>
                    )}
                    {data.weaknesses?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-destructive mb-1.5">Gelişim Alanları</p>
                        <ul className="space-y-1">{data.weaknesses.map((w: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-xs"><AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" /><span className="text-muted-foreground">{w}</span></li>
                        ))}</ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ ANSWER BY ANSWER ═══ */}
        <TabsContent value="answers" className="space-y-5">
          {answerByAnswer.length > 0 ? (
            <div className="space-y-4">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" /> Soru-Soru Detaylı Analiz
              </h3>
              {answerByAnswer.map((item: any, idx: number) => (
                <div key={idx} className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
                  {/* Question header */}
                  <div className="px-5 py-3 bg-muted/30 border-b border-border">
                    <div className="flex items-start gap-3">
                      <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-display shrink-0 mt-0.5">{idx + 1}</span>
                      <p className="text-sm font-medium text-foreground">{item.question}</p>
                    </div>
                  </div>
                  {/* Answer analysis */}
                  <div className="px-5 py-4 space-y-3">
                    {item.answer_summary && (
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Cevap Özeti</p>
                        <p className="text-sm text-muted-foreground">{item.answer_summary}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-5 gap-3">
                      {[
                        { key: "quality_score", label: "Kalite" },
                        { key: "clarity_score", label: "Netlik" },
                        { key: "depth_score", label: "Derinlik" },
                        { key: "relevance_score", label: "İlgililik" },
                        { key: "communication_score", label: "İletişim" },
                      ].filter(m => item[m.key] !== undefined).map((m) => (
                        <div key={m.key} className="text-center">
                          <div className={`font-display text-lg font-bold ${item[m.key] >= 70 ? "text-primary" : item[m.key] >= 50 ? "text-[hsl(var(--warning,38_92%_50%))]" : "text-destructive"}`}>{item[m.key]}</div>
                          <p className="text-[9px] text-muted-foreground">{m.label}</p>
                        </div>
                      ))}
                    </div>
                    {item.ai_feedback && (
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                        <p className="text-xs text-muted-foreground"><span className="font-bold text-primary">AI:</span> {item.ai_feedback}</p>
                      </div>
                    )}
                    {item.suggested_improvement && (
                      <div className="p-3 rounded-lg bg-accent/5 border border-accent/10">
                        <p className="text-xs text-muted-foreground"><span className="font-bold text-accent">İyileştirme:</span> {item.suggested_improvement}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Soru-soru analiz verisi bulunamadı</p>
            </div>
          )}
        </TabsContent>

        {/* ═══ SPEECH INSIGHTS ═══ */}
        <TabsContent value="speech" className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <Mic className="h-5 w-5 text-[hsl(var(--info))]" /> Konuşma İçgörüleri
            </h3>
            <SpeechInsightsSection analysisData={a} />
          </div>
        </TabsContent>

        {/* ═══ STRENGTHS & WEAKNESSES ═══ */}
        <TabsContent value="strengths" className="space-y-5">
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Strengths */}
            {a?.strengths?.length > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-card">
                <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-primary" /> Güçlü Yönler
                </h3>
                <ul className="space-y-2">{a.strengths.map((s: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{s}</span>
                  </li>
                ))}</ul>
              </div>
            )}
            {/* Weaknesses */}
            {a?.weaknesses?.length > 0 && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 shadow-card">
                <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
                  <ThumbsDown className="h-4 w-4 text-destructive" /> Zayıf Yönler
                </h3>
                <ul className="space-y-2">{a.weaknesses.map((w: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{w}</span>
                  </li>
                ))}</ul>
              </div>
            )}
          </div>

          {/* Risk Areas */}
          {a?.risk_areas?.length > 0 && (
            <div className="rounded-xl border border-[hsl(var(--warning,38_92%_50%))]/20 bg-[hsl(var(--warning,38_92%_50%))]/5 p-6 shadow-card">
              <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[hsl(var(--warning,38_92%_50%))]" /> Risk Alanları
              </h3>
              <ul className="space-y-2">{a.risk_areas.map((r: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning,38_92%_50%))] shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{r}</span>
                </li>
              ))}</ul>
            </div>
          )}
        </TabsContent>

        {/* ═══ TRANSCRIPT ═══ */}
        <TabsContent value="transcript" className="space-y-5">
          {transcript ? (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <h3 className="font-display text-lg font-semibold mb-4">Mülakat Transkripti</h3>
              <SmartTranscriptViewer transcript={transcript} />
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">Transkript bulunamadı</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RecordingAnalysis;
