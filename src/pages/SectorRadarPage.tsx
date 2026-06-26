import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { invokeEdgeFunction } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { toast } from "sonner";
import {
  Radar, Plus, Loader2, Sparkles, TrendingUp, DollarSign, ShoppingCart,
  Package, Globe, Trash2, Building2, ArrowRight, ExternalLink,
  AlertTriangle, Shield, Eye, Zap, Target, ChevronRight, Activity,
} from "lucide-react";

/* ── Types ── */

type SectorDevelopmentRow = Database["public"]["Tables"]["sector_developments"]["Row"];
type SectorDevelopmentInsert = Database["public"]["Tables"]["sector_developments"]["Insert"];
type SectorDevelopmentUpdate = Database["public"]["Tables"]["sector_developments"]["Update"];

interface Development {
  id: string;
  title: string;
  description: string | null;
  source: string | null;
  development_date: string | null;
  risk_level: string;
  opportunity_level: string;
  cost_impact: string | null;
  sales_impact: string | null;
  margin_impact: string | null;
  supply_impact: string | null;
  market_impact: string | null;
  ai_commentary: string | null;
  recommended_action: string | null;
  relevance_score: number | null;
  tags: string[];
}

interface RetrievedDevelopment {
  title: string;
  description: string;
  source: string;
  url: string;
  published_at: string | null;
  relevance_score: number;
  relevance_reasons: string[];
  tags: string[];
  trusted: boolean;
  query: string;
}

const IMPACT_KEYS = ["cost_impact", "sales_impact", "margin_impact", "supply_impact", "market_impact"] as const;
type ImpactKey = typeof IMPACT_KEYS[number];

interface SectorRetrievalResponse {
  developments?: RetrievedDevelopment[];
  queries_used?: string[];
  insufficient_data?: boolean;
}

interface SectorAnalysisResponse {
  analysis?: SectorDevelopmentUpdate;
}

const IMPACT_META: Record<ImpactKey, { icon: typeof DollarSign; label: string }> = {
  cost_impact: { icon: DollarSign, label: "Maliyet" },
  sales_impact: { icon: ShoppingCart, label: "Satış" },
  margin_impact: { icon: TrendingUp, label: "Marj" },
  supply_impact: { icon: Package, label: "Tedarik" },
  market_impact: { icon: Globe, label: "Pazar" },
};

const RISK_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20",
  low: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20",
};

const normalizeTitle = (v: string) => v.trim().toLowerCase();
const normalizeDevelopment = (d: SectorDevelopmentRow): Development => ({
  ...d,
  risk_level: d.risk_level || "medium",
  opportunity_level: d.opportunity_level || "medium",
  tags: d.tags || [],
});
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Beklenmeyen hata oluştu";

const riskLabel = (level: string) => {
  if (level === "high") return "Yüksek";
  if (level === "low") return "Düşük";
  return "Orta";
};

/* ── Component ── */

const SectorRadarPage = () => {
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [retrieved, setRetrieved] = useState<RetrievedDevelopment[]>([]);
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", source: "", tags: "" });

  // Initial page data should render independently from the company-specific scan.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, []);

  const loadData = async (options: { autoScan?: boolean } = {}) => {
    const { autoScan = true } = options;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setHasProfile(false);
        setDevelopments([]);
        setRetrieved([]);
        setQueriesUsed([]);
        return;
      }
      const [profileRes, devRes] = await Promise.all([
        supabase.from("company_profiles").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("sector_developments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      const profileExists = !!profileRes.data;
      setHasProfile(profileExists);
      setDevelopments((devRes.data || []).map(normalizeDevelopment));
      if (profileExists && autoScan) void runAutoScan();
      if (!profileExists) { setRetrieved([]); setQueriesUsed([]); setScanError(null); setScanNotice(null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const runAutoScan = async () => {
    setScanning(true);
    setScanError(null);
    setScanNotice(null);
    try {
      const { data, error } = await invokeEdgeFunction<SectorRetrievalResponse>(
        EDGE_FUNCTIONS.COMPANY_ADVISOR,
        { type: "sector_retrieval" as const },
        { maxRetries: 0, timeoutMs: 45000 },
      );
      if (error) {
        const message = error.detail || error.message;
        setScanError(message);
        toast.error(message);
        return;
      }
      const nextRetrieved = (data?.developments || []) as RetrievedDevelopment[];
      setRetrieved(nextRetrieved);
      setQueriesUsed((data?.queries_used || []) as string[]);
      if (data?.insufficient_data || nextRetrieved.length === 0) {
        setScanNotice("Şirket profilinizle eşleşen güncel kaynak sayısı şu an sınırlı. Bu bir hata değil; profil anahtar kelimelerini genişletebilir, daha sonra tekrar tarayabilir veya gelişmeyi elle ekleyebilirsiniz.");
      } else {
        setScanNotice(null);
      }
    } catch (e) {
      const message = `Otomatik tarama başarısız: ${getErrorMessage(e)}`;
      setScanError(message);
      toast.error(message);
    }
    finally { setScanning(false); }
  };

  const addDevelopment = async () => {
    if (!form.title.trim()) { toast.error("Başlık zorunlu"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");
      const payload: SectorDevelopmentInsert = {
        user_id: user.id, title: form.title.trim(),
        description: form.description.trim() || null,
        source: form.source.trim() || null,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      };
      await supabase.from("sector_developments").insert(payload);
      toast.success("Gelişme eklendi");
      setForm({ title: "", description: "", source: "", tags: "" });
      setDialogOpen(false);
      await loadData({ autoScan: false });
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setSaving(false); }
  };

  const saveRetrieved = async (item: RetrievedDevelopment) => {
    if (developments.some((d) => normalizeTitle(d.title) === normalizeTitle(item.title))) {
      toast.info("Zaten kaydedildi"); return;
    }
    setSavingKey(item.title);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");
      const payload: SectorDevelopmentInsert = {
        user_id: user.id, title: item.title, description: item.description || null,
        source: item.source || null, tags: item.tags || [], relevance_score: item.relevance_score,
      };
      await supabase.from("sector_developments").insert(payload);
      toast.success("Radara kaydedildi");
      await loadData({ autoScan: false });
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setSavingKey(null); }
  };

  const analyzeDev = async (dev: Development) => {
    if (!hasProfile) { toast.error("Önce şirket profilini oluşturun"); return; }
    setAnalyzingId(dev.id);
    try {
      const { data, error } = await invokeEdgeFunction<SectorAnalysisResponse>(EDGE_FUNCTIONS.COMPANY_ADVISOR, {
        type: "sector_analysis", developmentTitle: dev.title, developmentDescription: dev.description,
      });
      if (error) { toast.error(error.message); return; }
      const a = data?.analysis;
      if (!a) return;
      const payload: SectorDevelopmentUpdate = {
        cost_impact: a.cost_impact || null, sales_impact: a.sales_impact || null,
        margin_impact: a.margin_impact || null, supply_impact: a.supply_impact || null,
        market_impact: a.market_impact || null, ai_commentary: a.ai_commentary || null,
        recommended_action: a.recommended_action || null, risk_level: a.risk_level || "medium",
        opportunity_level: a.opportunity_level || "medium", relevance_score: a.relevance_score || null,
      };
      await supabase.from("sector_developments").update(payload).eq("id", dev.id);
      toast.success("Analiz tamamlandı");
      await loadData({ autoScan: false });
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setAnalyzingId(null); }
  };

  const deleteDev = async (id: string) => {
    if (!confirm("Bu gelişme silinsin mi?")) return;
    await supabase.from("sector_developments").delete().eq("id", id);
    setDevelopments((p) => p.filter((d) => d.id !== id));
    toast.success("Silindi");
  };

  // Categorize
  const highRiskDevs = developments.filter((d) => d.risk_level === "high" && d.ai_commentary);
  const opportunities = developments.filter((d) => d.opportunity_level === "high" && d.ai_commentary);
  const analyzedDevs = developments.filter((d) => d.ai_commentary);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-card">
        <div className="absolute top-0 right-0 w-48 h-48 bg-accent/5 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Radar className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold tracking-tight">Sektör Radarı</h1>
                <p className="text-xs text-muted-foreground">Dış çevre istihbaratı ve stratejik etki analizi</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasProfile && (
              <Button variant="outline" size="sm" onClick={runAutoScan} disabled={scanning}>
                {scanning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Radar className="mr-1.5 h-4 w-4" />}
                Sektörü Tara
              </Button>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="hero" size="sm"><Plus className="mr-1.5 h-4 w-4" /> Gelişme Ekle</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Yeni Sektör Gelişmesi</DialogTitle></DialogHeader>
                <div className="mt-2 space-y-4">
                  <div className="space-y-2"><Label>Başlık *</Label><Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Çelik ithalatında gümrük vergisi artışı" /></div>
                  <div className="space-y-2"><Label>Açıklama</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="resize-none" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Kaynak</Label><Input value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} placeholder="Reuters, sektör raporu..." /></div>
                    <div className="space-y-2"><Label>Etiketler (virgülle)</Label><Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="enerji, ihracat, maliyet" /></div>
                  </div>
                  <Button variant="hero" className="w-full" onClick={addDevelopment} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Ekle
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Profile Warning */}
      {hasProfile === false && (
        <div className="rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 p-5 flex items-center gap-4">
          <Building2 className="h-6 w-6 text-[hsl(var(--warning))] shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Şirket profili gerekli</p>
            <p className="text-xs text-muted-foreground">Otomatik tarama ve şirkete özel analiz için şirket profilinin tamamlanması gerekir.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/company/profile"><ArrowRight className="mr-1 h-3.5 w-3.5" /> Profil Oluştur</Link>
          </Button>
        </div>
      )}

      {hasProfile && scanning && retrieved.length === 0 && (
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Sektör kaynakları taranıyor</p>
            <p className="text-xs text-muted-foreground">Bu işlem en fazla 45 saniye sürer; mevcut kayıtlar sayfada kullanılmaya devam eder.</p>
          </div>
        </div>
      )}

      {hasProfile && scanNotice && !scanning && !scanError && (
        <div className="rounded-xl border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning))]/5 p-4 flex items-center gap-3">
          <Shield className="h-5 w-5 text-[hsl(var(--warning))] shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Kaynaklar sınırlı</p>
            <p className="text-xs text-muted-foreground">{scanNotice}</p>
          </div>
          <Button variant="outline" size="sm" onClick={runAutoScan} disabled={scanning}>
            <Radar className="mr-1.5 h-4 w-4" />
            Tekrar Tara
          </Button>
        </div>
      )}

      {hasProfile && scanError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Sektör taraması tamamlanamadı</p>
            <p className="text-xs text-muted-foreground">{scanError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={runAutoScan} disabled={scanning}>
            {scanning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Radar className="mr-1.5 h-4 w-4" />}
            Tekrar Dene
          </Button>
        </div>
      )}

      {/* Executive Brief - Top risks & opportunities */}
      {analyzedDevs.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Top Risks */}
          <div className="rounded-2xl border border-destructive/15 bg-destructive/5 p-5">
            <h2 className="font-display text-sm font-semibold text-destructive flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4" /> En Önemli Riskler
            </h2>
            {highRiskDevs.length > 0 ? (
              <div className="space-y-3">
                {highRiskDevs.slice(0, 3).map((d) => (
                  <div key={d.id} className="rounded-lg bg-background/80 border border-destructive/10 p-3">
                    <p className="text-sm font-medium mb-1">{d.title}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{d.ai_commentary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Analiz edilen kayıtlarda yüksek riskli gelişme algılanmadı.</p>
            )}
          </div>

          {/* Top Opportunities */}
          <div className="rounded-2xl border border-[hsl(var(--success))]/15 bg-[hsl(var(--success))]/5 p-5">
            <h2 className="font-display text-sm font-semibold text-[hsl(var(--success))] flex items-center gap-2 mb-4">
              <Target className="h-4 w-4" /> En Önemli Fırsatlar
            </h2>
            {opportunities.length > 0 ? (
              <div className="space-y-3">
                {opportunities.slice(0, 3).map((d) => (
                  <div key={d.id} className="rounded-lg bg-background/80 border border-[hsl(var(--success))]/10 p-3">
                    <p className="text-sm font-medium mb-1">{d.title}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{d.ai_commentary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Henüz yüksek fırsat içeren gelişme algılanmadı.</p>
            )}
          </div>
        </div>
      )}

      {/* Auto-Scan Results */}
      {hasProfile && retrieved.length > 0 && (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm font-semibold text-primary flex items-center gap-2">
              <Radar className="h-4 w-4" /> Canlı Tarama Sonuçları
              <Badge variant="outline" className="text-[9px] ml-1">{retrieved.length} bulundu</Badge>
            </h2>
            {queriesUsed.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {queriesUsed.slice(0, 4).map((q) => (
                  <Badge key={q} variant="secondary" className="text-[9px]">{q}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {retrieved.map((item) => {
              const saved = developments.some((d) => normalizeTitle(d.title) === normalizeTitle(item.title));
              return (
                <div key={`${item.title}-${item.source}`} className="rounded-xl bg-background border border-border p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <Badge variant="outline" className="text-[9px]">İlgililik: {item.relevance_score}/10</Badge>
                      <Badge variant="secondary" className="text-[9px]">{item.source}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{item.description}</p>
                    {item.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.tags.map((t) => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button variant={saved ? "secondary" : "outline"} size="sm" onClick={() => saveRetrieved(item)} disabled={saved || savingKey === item.title}>
                      {savingKey === item.title ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    </Button>
                    {item.url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Saved Developments with Impact Analysis */}
      <div>
        <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          İzlenen Gelişmeler ({developments.length})
        </h2>

        {developments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Radar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium">Henüz izlenen gelişme yok</p>
            <p className="text-xs text-muted-foreground mt-1">
              {scanNotice
                ? "Otomatik tarama şu an yeterli kaynak bulamadı. Gelişmeleri elle ekleyebilir veya şirket profilindeki sektör, ürün ve pazar bilgilerini genişletebilirsiniz."
                : "Takibe başlamak için gelişmeleri elle ekleyin veya otomatik tarama sonuçlarını kaydedin."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {developments.map((dev) => (
              <div key={dev.id} className="rounded-2xl border border-border bg-card shadow-card overflow-hidden group transition-all hover:border-primary/20">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold">{dev.title}</h3>
                        <Badge variant="outline" className={`text-[10px] ${RISK_STYLES[dev.risk_level] || RISK_STYLES.medium}`}>
                          Risk: {riskLabel(dev.risk_level)}
                        </Badge>
                        {dev.relevance_score !== null && (
                          <Badge variant="outline" className="text-[10px]">İlgililik: {dev.relevance_score}/10</Badge>
                        )}
                      </div>
                      {dev.description && <p className="text-xs text-muted-foreground mb-2">{dev.description}</p>}
                      {dev.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {dev.tags.map((t, i) => (
                            <span key={`${t}-${i}`} className="text-[9px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => analyzeDev(dev)} disabled={analyzingId === dev.id || !hasProfile}>
                        {analyzingId === dev.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteDev(dev.id)}
                        className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Impact Analysis */}
                  {dev.ai_commentary && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      {/* Impact Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {IMPACT_KEYS.map((key) => {
                          const val = dev[key];
                          if (!val) return null;
                          const meta = IMPACT_META[key];
                          const Icon = meta.icon;
                          return (
                            <div key={key} className="rounded-lg bg-muted/50 p-2.5 text-center">
                              <Icon className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground" />
                              <p className="text-[10px] text-muted-foreground">{meta.label}</p>
                              <p className="text-xs font-medium mt-0.5">{val}</p>
                            </div>
                          );
                        })}
                      </div>

                      {/* AI Commentary */}
                      <div className="rounded-xl bg-primary/5 border border-primary/10 p-4">
                        <h4 className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">
                          <Eye className="h-3.5 w-3.5" /> Şirketiniz İçin Anlamı
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">{dev.ai_commentary}</p>
                      </div>

                      {/* Recommended Action */}
                      {dev.recommended_action && (
                        <div className="rounded-xl bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/10 p-4">
                          <h4 className="text-xs font-semibold text-[hsl(var(--success))] mb-1 flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5" /> Önerilen Aksiyon
                          </h4>
                          <p className="text-xs text-muted-foreground">{dev.recommended_action}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SectorRadarPage;
