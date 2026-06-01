import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { toast } from "sonner";
import { UserPlus, Users, Search, Briefcase, Loader2, ChevronRight, Brain, Trash2, FileText, Sparkles, AlertTriangle, CheckCircle2, Target, Shield, TrendingUp } from "lucide-react";

interface CompanyMember {
  id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  notes: string | null;
  ai_analysis: any;
  created_at: string;
}

const CompanyPage = () => {
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Company notes
  const [companyNotes, setCompanyNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Company AI Analysis
  const [companyAnalysis, setCompanyAnalysis] = useState<any>(null);
  const [analyzingCompany, setAnalyzingCompany] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // Form state
  const [form, setForm] = useState({
    full_name: "",
    position: "",
    department: "",
    email: "",
    phone: "",
    skills: "",
    notes: "",
  });

  useEffect(() => {
    fetchMembers();
    loadCompanyNotes();
    loadCompanyAnalysis();
  }, []);

  const fetchMembers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("company_members")
        .select("*")
        .eq("user_id", user.id)
        .order("full_name");

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error("Error fetching members:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanyNotes = () => {
    const saved = localStorage.getItem("company_notes");
    if (saved) setCompanyNotes(saved);
  };

  const loadCompanyAnalysis = () => {
    const saved = localStorage.getItem("company_analysis");
    if (saved) {
      try {
        setCompanyAnalysis(JSON.parse(saved));
      } catch {}
    }
  };

  const saveCompanyNotes = () => {
    setSavingNotes(true);
    localStorage.setItem("company_notes", companyNotes);
    setTimeout(() => {
      setSavingNotes(false);
      toast.success("Şirket notları kaydedildi");
    }, 300);
  };

  const runCompanyAnalysis = async () => {
    if (members.length === 0) {
      toast.error("Analiz için en az bir personel ekleyin");
      return;
    }

    setAnalyzingCompany(true);
    try {
      // Get insights count for each member
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");

      const { data: insights } = await supabase
        .from("member_meeting_insights")
        .select("member_id")
        .eq("user_id", user.id);

      const insightsCountMap: Record<string, number> = {};
      (insights || []).forEach(i => {
        insightsCountMap[i.member_id] = (insightsCountMap[i.member_id] || 0) + 1;
      });

      const membersWithCounts = members.map(m => ({
        ...m,
        insights_count: insightsCountMap[m.id] || 0,
      }));

      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_COMPANY, {
        members: membersWithCounts, companyNotes,
      });
      if (result.error) { toast.error(getErrorToastMessage(result.error)); setAnalyzingCompany(false); return; }
      setCompanyAnalysis(result.data.analysis);
      localStorage.setItem("company_analysis", JSON.stringify(result.data.analysis));
      setShowAnalysis(true);
      toast.success("Şirket analizi tamamlandı!");
    } catch (error: any) {
      if (error.message?.includes("Rate limit")) {
        toast.error("AI istek limiti aşıldı. Lütfen daha sonra tekrar deneyin.");
      } else if (error.message?.includes("Payment required")) {
        toast.error("AI kredisi tükendi.");
      } else {
        toast.error("Analiz hatası: " + (error.message || "Bilinmeyen hata"));
      }
    } finally {
      setAnalyzingCompany(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast.error("Ad soyad gerekli");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");

      const { error } = await supabase.from("company_members").insert({
        user_id: user.id,
        full_name: form.full_name.trim(),
        position: form.position.trim() || null,
        department: form.department.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        skills: form.skills ? form.skills.split(",").map(s => s.trim()).filter(Boolean) : [],
        notes: form.notes.trim() || null,
      });

      if (error) throw error;

      toast.success("Personel eklendi");
      setForm({ full_name: "", position: "", department: "", email: "", phone: "", skills: "", notes: "" });
      setDialogOpen(false);
      fetchMembers();
    } catch (error: any) {
      toast.error("Hata: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteMember = async (id: string, name: string) => {
    if (!confirm(`${name} silinecek. Emin misiniz?`)) return;
    
    const { error } = await supabase.from("company_members").delete().eq("id", id);
    if (error) {
      toast.error("Silme hatası");
    } else {
      toast.success("Personel silindi");
      setMembers(prev => prev.filter(m => m.id !== id));
    }
  };

  const filtered = members.filter(m =>
    m.full_name.toLowerCase().includes(search.toLowerCase()) ||
    m.position?.toLowerCase().includes(search.toLowerCase()) ||
    m.department?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold mb-1">Şirket Kadrosu</h1>
          <p className="text-muted-foreground">Personel profillerini yönetin ve AI analizlerini görüntüleyin</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="hero" size="sm">
              <UserPlus className="mr-1 h-4 w-4" /> Personel Ekle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">Yeni Personel Ekle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ad Soyad *</Label>
                  <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Ahmet Yılmaz" />
                </div>
                <div className="space-y-2">
                  <Label>Pozisyon</Label>
                  <Input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="Yazılım Mühendisi" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Departman</Label>
                  <Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="Mühendislik" />
                </div>
                <div className="space-y-2">
                  <Label>E-posta</Label>
                  <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ahmet@sirket.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Yetenekler (virgülle ayırın)</Label>
                <Input value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))} placeholder="React, TypeScript, Liderlik, İletişim" />
              </div>
              <div className="space-y-2">
                <Label>Notlar</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Bu kişi hakkında önemli notlar..." rows={3} />
              </div>
              <Button variant="hero" type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Ekle
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Company Notes Section */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Genel Şirket Notları
          </h2>
          <Button variant="secondary" size="sm" onClick={saveCompanyNotes} disabled={savingNotes}>
            {savingNotes ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Kaydet
          </Button>
        </div>
        <Textarea
          placeholder="Şirketle ilgili genel notlar, hedefler, stratejik planlar, organizasyonel gözlemler..."
          value={companyNotes}
          onChange={e => setCompanyNotes(e.target.value)}
          rows={4}
          className="resize-none"
        />
      </div>

      {/* Company AI Analysis Button */}
      <div className="flex items-center gap-3">
        <Button
          variant="hero"
          onClick={runCompanyAnalysis}
          disabled={analyzingCompany || members.length === 0}
          className="flex-1 sm:flex-none"
        >
          {analyzingCompany ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI Analiz Yapılıyor...</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> Genel Şirket AI Analizi</>
          )}
        </Button>
        {companyAnalysis && (
          <Button variant="hero-outline" size="sm" onClick={() => setShowAnalysis(!showAnalysis)}>
            {showAnalysis ? "Raporu Gizle" : "Raporu Göster"}
          </Button>
        )}
      </div>

      {/* Company Analysis Report */}
      {showAnalysis && companyAnalysis && (
        <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> Şirket AI Analiz Raporu
          </h2>

          {companyAnalysis.executive_summary && (
            <div className="rounded-lg bg-card border border-border p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-primary" /> Yönetici Özeti
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{companyAnalysis.executive_summary}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {companyAnalysis.organizational_strengths && (
              <div className="rounded-lg bg-card border border-border p-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" /> Güçlü Yönler
                </h3>
                <ul className="space-y-1">
                  {companyAnalysis.organizational_strengths.map((s: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-green-500 mt-1 shrink-0">•</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {companyAnalysis.risk_factors && (
              <div className="rounded-lg bg-card border border-border p-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Risk Faktörleri
                </h3>
                <ul className="space-y-1">
                  {companyAnalysis.risk_factors.map((r: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-amber-500 mt-1 shrink-0">•</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {companyAnalysis.talent_map && (
            <div className="rounded-lg bg-card border border-border p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-primary" /> Yetenek Haritası
              </h3>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs font-medium text-green-600 mb-1">Güçlü Alanlar</p>
                  <div className="flex flex-wrap gap-1">
                    {(companyAnalysis.talent_map.strong_areas || []).map((a: string, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">{a}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-amber-600 mb-1">Boşluklar</p>
                  <div className="flex flex-wrap gap-1">
                    {(companyAnalysis.talent_map.gaps || []).map((g: string, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">{g}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-primary mb-1">Öneriler</p>
                  <div className="flex flex-wrap gap-1">
                    {(companyAnalysis.talent_map.recommendations || []).map((r: string, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{r}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {companyAnalysis.team_dynamics && (
            <div className="rounded-lg bg-card border border-border p-4">
              <h3 className="font-semibold mb-2 text-sm">Takım Dinamikleri</h3>
              <p className="text-sm text-muted-foreground">{companyAnalysis.team_dynamics}</p>
            </div>
          )}

          {companyAnalysis.leadership_assessment && (
            <div className="rounded-lg bg-card border border-border p-4">
              <h3 className="font-semibold mb-2 text-sm">Liderlik Değerlendirmesi</h3>
              <p className="text-sm text-muted-foreground">{companyAnalysis.leadership_assessment}</p>
            </div>
          )}

          {companyAnalysis.culture_insights && (
            <div className="rounded-lg bg-card border border-border p-4">
              <h3 className="font-semibold mb-2 text-sm">Kültür Analizi</h3>
              <p className="text-sm text-muted-foreground">{companyAnalysis.culture_insights}</p>
            </div>
          )}

          {companyAnalysis.strategic_recommendations && (
            <div className="rounded-lg bg-card border border-border p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-primary" /> Stratejik Öneriler
              </h3>
              <ul className="space-y-1">
                {companyAnalysis.strategic_recommendations.map((s: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5 shrink-0">{i + 1}.</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {companyAnalysis.action_items && (
            <div className="rounded-lg bg-card border border-primary/30 p-4">
              <h3 className="font-semibold mb-2 text-sm">🎯 Aksiyon Maddeleri</h3>
              <ul className="space-y-1">
                {companyAnalysis.action_items.map((a: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" /> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="İsim, pozisyon veya departman ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Members Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-border bg-muted/30">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {search ? "Arama sonucu bulunamadı" : "Henüz personel eklenmemiş. İlk personeli ekleyin."}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(member => (
            <div key={member.id} className="rounded-xl border border-border bg-card p-5 shadow-card hover:border-primary/30 transition-all group relative">
              <button
                onClick={() => deleteMember(member.id, member.full_name)}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <Link to={`/dashboard/company/${member.id}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="font-display text-lg font-bold text-primary">
                      {member.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold truncate">{member.full_name}</h3>
                    {member.position && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Briefcase className="h-3 w-3" /> {member.position}
                      </p>
                    )}
                  </div>
                </div>

                {member.department && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {member.department}
                  </span>
                )}

                {member.skills && member.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {member.skills.slice(0, 4).map((skill, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {skill}
                      </span>
                    ))}
                    {member.skills.length > 4 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        +{member.skills.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {member.ai_analysis && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-accent">
                    <Brain className="h-3 w-3" />
                    <span>AI analizi mevcut</span>
                  </div>
                )}

                <div className="flex items-center justify-end mt-3">
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CompanyPage;
