import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { toast } from "sonner";
import {
  ArrowLeft, Briefcase, Mail, Phone, Brain, Loader2, Save,
  TrendingUp, Users, Star, AlertCircle, CheckCircle2, Activity,
  MessageSquare, Target, Calendar, Clock
} from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface MemberInsight {
  id: string;
  recording_id: string;
  contribution_score: number | null;
  communication_style: string | null;
  behavioral_insights: string | null;
  strengths: string[];
  areas_for_improvement: string[];
  mood: string | null;
  confidence_level: string | null;
  engagement_level: string | null;
  created_at: string;
  recordings?: {
    id: string;
    title: string;
    date: string;
    type: string;
    duration: string | null;
  };
}

const MemberDetailPage = () => {
  const { memberId } = useParams();
  const [member, setMember] = useState<any>(null);
  const [insights, setInsights] = useState<MemberInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    position: "",
    department: "",
    email: "",
    phone: "",
    skills: "",
    notes: "",
  });

  const fetchMember = useCallback(async () => {
    if (!memberId) return;
    const { data, error } = await supabase
      .from("company_members")
      .select("*")
      .eq("id", memberId)
      .single();

    if (error) {
      console.error(error);
      return;
    }
    setMember(data);
    setForm({
      full_name: data.full_name || "",
      position: data.position || "",
      department: data.department || "",
      email: data.email || "",
      phone: data.phone || "",
      skills: (data.skills || []).join(", "),
      notes: data.notes || "",
    });
    setLoading(false);
  }, [memberId]);

  const fetchInsights = useCallback(async () => {
    if (!memberId) return;
    const { data, error } = await supabase
      .from("member_meeting_insights")
      .select("*, recordings(id, title, date, type, duration)")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setInsights(data as any);
    }
  }, [memberId]);

  useEffect(() => {
    void fetchMember();
    void fetchInsights();
  }, [fetchInsights, fetchMember]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("company_members")
        .update({
          full_name: form.full_name.trim(),
          position: form.position.trim() || null,
          department: form.department.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          skills: form.skills ? form.skills.split(",").map(s => s.trim()).filter(Boolean) : [],
          notes: form.notes.trim() || null,
        })
        .eq("id", memberId!);

      if (error) throw error;
      toast.success("Profil güncellendi");
      setEditMode(false);
      fetchMember();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runAIAnalysis = async () => {
    setAnalyzing(true);
    try {
      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_MEMBER, {
        memberId: memberId,
        memberData: member,
        insights: insights,
      });
      if (result.error) { toast.error(getErrorToastMessage(result.error)); setAnalyzing(false); return; }
      const data = result.data;

      await supabase
        .from("company_members")
        .update({
          ai_analysis: data.analysis,
          ai_analysis_updated_at: new Date().toISOString(),
        })
        .eq("id", memberId!);

      toast.success("AI analizi tamamlandı");
      fetchMember();
    } catch (err: any) {
      if (err.message?.includes("429")) {
        toast.error("AI istek limiti aşıldı. Lütfen daha sonra deneyin.");
      } else if (err.message?.includes("402")) {
        toast.error("AI kredisi tükendi.");
      } else {
        toast.error("Analiz hatası: " + err.message);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Personel bulunamadı</p>
        <Link to="/dashboard/company"><Button variant="ghost" className="mt-4">Geri Dön</Button></Link>
      </div>
    );
  }

  const aiAnalysis = member.ai_analysis;
  const avgScore = insights.length > 0
    ? Math.round(insights.reduce((sum, i) => sum + (i.contribution_score || 0), 0) / insights.length)
    : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link to="/dashboard/company" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Şirket Kadrosuna Dön
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="font-display text-lg sm:text-2xl font-bold text-primary">
              {member.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-3xl font-bold truncate">{member.full_name}</h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground mt-1">
              {member.position && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {member.position}</span>}
              {member.department && <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px] sm:text-xs">{member.department}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditMode(!editMode)}>
            {editMode ? "İptal" : "Düzenle"}
          </Button>
          <Button variant="hero" size="sm" onClick={runAIAnalysis} disabled={analyzing}>
            {analyzing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Brain className="mr-1 h-4 w-4" />}
            AI Analiz
          </Button>
        </div>
      </div>

      {/* Edit Form */}
      {editMode && (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-card space-y-4">
          <h3 className="font-display font-semibold">Profili Düzenle</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ad Soyad</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Pozisyon</Label>
              <Input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Departman</Label>
              <Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>E-posta</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Yetenekler (virgülle ayırın)</Label>
            <Input value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Notlar</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
          <Button variant="hero" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Kaydet
          </Button>
        </div>
      )}

      {/* Skills & Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {member.skills && member.skills.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-card">
            <h3 className="font-display font-semibold mb-3 flex items-center gap-2 text-sm sm:text-base">
              <Star className="h-4 w-4 text-accent" /> Yetenekler
            </h3>
            <div className="flex flex-wrap gap-2">
              {member.skills.map((skill: string, i: number) => (
                <span key={i} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs sm:text-sm">{skill}</span>
              ))}
            </div>
          </div>
        )}
        {member.notes && (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-card">
            <h3 className="font-display font-semibold mb-3 flex items-center gap-2 text-sm sm:text-base">
              <MessageSquare className="h-4 w-4 text-muted-foreground" /> Notlar
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap">{member.notes}</p>
          </div>
        )}
      </div>

      {/* Stats */}
      {insights.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-card text-center">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary mx-auto mb-1" />
            <div className="font-display text-xl sm:text-2xl font-bold">{insights.length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Toplantı</div>
          </div>
          {avgScore !== null && (
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-card text-center">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary mx-auto mb-1" />
              <div className={`font-display text-xl sm:text-2xl font-bold ${avgScore >= 70 ? "text-primary" : avgScore >= 50 ? "text-accent" : "text-destructive"}`}>{avgScore}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Ort. Katkı</div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-card text-center">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-accent mx-auto mb-1" />
            <div className="font-display text-sm sm:text-lg font-bold">
              {insights.filter(i => i.communication_style?.includes("Lider")).length > insights.length / 2 ? "Lider" : 
               insights.filter(i => i.communication_style?.includes("aktif")).length > insights.length / 2 ? "Aktif" : "Dengeli"}
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">İletişim</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-card text-center">
            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-secondary-foreground mx-auto mb-1" />
            <div className="font-display text-sm sm:text-lg font-bold truncate px-1">
              {insights[0]?.confidence_level || "—"}
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Güven</div>
          </div>
        </div>
      )}

      {/* AI Analysis */}
      {aiAnalysis && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-6 shadow-card">
          <h3 className="font-display text-base sm:text-lg font-semibold mb-4 flex items-center gap-2">
            <Brain className="h-5 w-5 text-accent" /> AI Genel Değerlendirmesi
          </h3>

          {aiAnalysis.overall_assessment && (
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-4 whitespace-pre-wrap">{aiAnalysis.overall_assessment}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {aiAnalysis.strengths && aiAnalysis.strengths.length > 0 && (
              <div className="rounded-lg bg-card p-3 sm:p-4 border border-border">
                <p className="text-xs font-bold text-primary mb-2">Güçlü Yönler</p>
                <ul className="space-y-1">
                  {aiAnalysis.strengths.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] sm:text-xs">
                      <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {aiAnalysis.development_areas && aiAnalysis.development_areas.length > 0 && (
              <div className="rounded-lg bg-card p-3 sm:p-4 border border-border">
                <p className="text-xs font-bold text-destructive mb-2">Gelişim Alanları</p>
                <ul className="space-y-1">
                  {aiAnalysis.development_areas.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] sm:text-xs">
                      <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {aiAnalysis.recommended_position && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 sm:p-4 mb-4">
              <p className="text-xs font-bold text-primary mb-1">🎯 Önerilen Pozisyon / Kariyer Yolu</p>
              <p className="text-xs sm:text-sm text-muted-foreground">{aiAnalysis.recommended_position}</p>
            </div>
          )}

          {aiAnalysis.communication_patterns && (
            <div className="rounded-lg bg-card border border-border p-3 sm:p-4 mb-4">
              <p className="text-xs font-bold mb-1">📡 İletişim Kalıpları</p>
              <p className="text-xs sm:text-sm text-muted-foreground">{aiAnalysis.communication_patterns}</p>
            </div>
          )}

          {aiAnalysis.collaboration_insights && (
            <div className="rounded-lg bg-card border border-border p-3 sm:p-4">
              <p className="text-xs font-bold mb-1">🤝 İşbirliği Dinamikleri</p>
              <p className="text-xs sm:text-sm text-muted-foreground">{aiAnalysis.collaboration_insights}</p>
            </div>
          )}

          {member.ai_analysis_updated_at && (
            <p className="text-[10px] text-muted-foreground mt-3">
              Son analiz: {format(new Date(member.ai_analysis_updated_at), "d MMMM yyyy, HH:mm", { locale: tr })}
            </p>
          )}
        </div>
      )}

      {/* Meeting History */}
      <div>
        <h3 className="font-display text-base sm:text-lg font-semibold mb-4">Toplantı Geçmişi</h3>
        {insights.length === 0 ? (
          <div className="text-center py-8 rounded-xl border border-dashed border-border bg-muted/30">
            <p className="text-muted-foreground text-sm">Bu kişi henüz toplantılarda tanımlanmadı.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map(insight => (
              <Link
                key={insight.id}
                to={`/dashboard/meetings/${insight.recording_id}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-border bg-card p-3 sm:p-4 shadow-card hover:border-primary/30 transition-all gap-2"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-display font-semibold text-xs sm:text-sm truncate">
                    {(insight as any).recordings?.title || "Toplantı"}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-muted-foreground mt-1">
                    {(insight as any).recordings?.date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date((insight as any).recordings.date), "d MMM yyyy", { locale: tr })}
                      </span>
                    )}
                    {insight.communication_style && <span>{insight.communication_style}</span>}
                    {insight.mood && <span>Duygu: {insight.mood}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {insight.contribution_score !== null && (
                    <div className="text-center">
                      <div className={`font-display text-lg sm:text-xl font-bold ${
                        insight.contribution_score >= 70 ? "text-primary" : insight.contribution_score >= 50 ? "text-accent" : "text-destructive"
                      }`}>{insight.contribution_score}</div>
                      <div className="text-[9px] text-muted-foreground">katkı</div>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberDetailPage;
