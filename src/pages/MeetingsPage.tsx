import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload, Search, Video, Filter, CalendarDays, X, MonitorPlay,
  Lightbulb, Mic, FileVideo, CheckCircle, ArrowRight, Headphones, Volume2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import PageHeader from "@/components/dashboard/PageHeader";
import EmptyState from "@/components/dashboard/EmptyState";
import LoadingState from "@/components/dashboard/LoadingState";
import StatCard from "@/components/dashboard/StatCard";
import MeetingCard, { getMeetingStatus, getMeetingSource, MeetingStatus, MeetingSource } from "@/components/MeetingCard";
import { BarChart3, CheckCircle2, Clock, AlertCircle } from "lucide-react";

type Recording = Tables<"recordings">;

const statusFilters: { value: MeetingStatus | "all"; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "completed", label: "Tamamlandı" },
  { value: "processing", label: "İşleniyor" },
  { value: "pending", label: "Bekliyor" },
  { value: "failed", label: "Başarısız" },
];

const typeFilters = [
  { value: "all", label: "Tüm Türler" },
  { value: "toplantı", label: "Toplantı" },
  { value: "mülakat", label: "Mülakat" },
];

const sourceFilters: { value: MeetingSource | "all"; label: string; icon: typeof Video }[] = [
  { value: "all", label: "Tüm Kaynaklar", icon: Filter },
  { value: "zoom", label: "Zoom", icon: Video },
  { value: "google-meet", label: "Google Meet", icon: MonitorPlay },
  { value: "upload", label: "Yükleme", icon: Upload },
  { value: "live", label: "Canlı", icon: Video },
];

const dateFilters = [
  { value: "all", label: "Tüm Tarihler" },
  { value: "today", label: "Bugün" },
  { value: "week", label: "Bu Hafta" },
  { value: "month", label: "Bu Ay" },
];

const MeetingsPage = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<MeetingSource | "all">("all");
  const [dateFilter, setDateFilter] = useState("all");

  useEffect(() => {
    const fetchRecordings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("recordings")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setRecordings(data || []);
      } catch (error) {
        console.error("Error fetching recordings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchRecordings();
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    return recordings.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (!r.title.toLowerCase().includes(q) && !r.type.toLowerCase().includes(q) && !(r.summary || "").toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== "all" && getMeetingStatus(r) !== statusFilter) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (sourceFilter !== "all" && getMeetingSource(r) !== sourceFilter) return false;
      if (dateFilter !== "all") {
        const d = new Date(r.date);
        if (dateFilter === "today" && d.toDateString() !== now.toDateString()) return false;
        if (dateFilter === "week") {
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (d < weekAgo) return false;
        }
        if (dateFilter === "month") {
          if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
        }
      }
      return true;
    });
  }, [recordings, search, statusFilter, typeFilter, sourceFilter, dateFilter]);

  const stats = useMemo(() => {
    const completed = recordings.filter(r => getMeetingStatus(r) === "completed").length;
    const processing = recordings.filter(r => getMeetingStatus(r) === "processing" || getMeetingStatus(r) === "pending").length;
    const avgScore = recordings.reduce((sum, r) => {
      const score = (r.analysis_data as any)?.overall_score;
      return score ? sum + score : sum;
    }, 0);
    const scoredCount = recordings.filter(r => (r.analysis_data as any)?.overall_score).length;
    return {
      total: recordings.length,
      completed,
      processing,
      avgScore: scoredCount > 0 ? Math.round(avgScore / scoredCount) : 0,
    };
  }, [recordings]);

  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all" || sourceFilter !== "all" || dateFilter !== "all" || search;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setSourceFilter("all");
    setDateFilter("all");
  };

  const FilterChipGroup = ({ items, value, onChange }: { items: { value: string; label: string }[]; value: string; onChange: (v: any) => void }) => (
    <div className="flex items-center gap-1">
      {items.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            value === f.value
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Toplantılar"
        description="Tüm toplantı ve mülakat kayıtlarınızı yönetin"
        actions={
          <div className="flex items-center gap-2">
            <Link to="/dashboard/record">
              <Button variant="outline" size="sm"><Video className="mr-1.5 h-3.5 w-3.5" /> Kayıt Başlat</Button>
            </Link>
            <Link to="/dashboard/upload">
              <Button size="sm"><Upload className="mr-1.5 h-3.5 w-3.5" /> Yükle</Button>
            </Link>
          </div>
        }
      />

      {/* Stats */}
      {!loading && recordings.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Video} label="Toplam" value={stats.total} />
          <StatCard icon={CheckCircle2} label="Tamamlanan" value={stats.completed} iconColor="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" />
          <StatCard icon={Clock} label="İşlenen" value={stats.processing} iconColor="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]" />
          <StatCard icon={BarChart3} label="Ort. Skor" value={stats.avgScore > 0 ? stats.avgScore : "—"} iconColor="bg-primary/10 text-primary" />
        </div>
      )}

      {/* Filters */}
      {!loading && recordings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Toplantı ara..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground">
                <X className="mr-1 h-3 w-3" /> Filtreleri Temizle
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status */}
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              {statusFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    statusFilter === f.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-border hidden sm:block" />

            {/* Source */}
            <FilterChipGroup items={sourceFilters} value={sourceFilter} onChange={setSourceFilter} />

            <div className="h-5 w-px bg-border hidden sm:block" />

            {/* Type */}
            <FilterChipGroup items={typeFilters} value={typeFilter} onChange={setTypeFilter} />

            <div className="h-5 w-px bg-border hidden sm:block" />

            {/* Date */}
            <FilterChipGroup items={dateFilters} value={dateFilter} onChange={setDateFilter} />
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <LoadingState message="Toplantılar yükleniyor..." />
      ) : recordings.length === 0 ? (
        <div className="space-y-5">
          {/* Empty state hero */}
          <EmptyState
            icon={Video}
            title="Henüz toplantı yok"
            description="Kayıtlarınızı yükleyin veya canlı kayıt başlatın — AI otomatik analiz etsin."
            action={{ label: "İlk Kaydı Yükle", onClick: () => (window.location.href = "/dashboard/upload") }}
          />

          {/* Onboarding guide card */}
          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Lightbulb className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold">Başlangıç Rehberi</h3>
                <p className="text-[10px] text-muted-foreground">Toplantı analizinden en iyi sonucu almak için</p>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* How to upload */}
              <div>
                <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5 text-primary" /> Nasıl Yüklenir?
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { step: "1", title: "Dosya Seç", desc: "MP4, MOV, MKV, WebM veya AVI formatında video dosyanızı sürükleyin" },
                    { step: "2", title: "Başlık Girin", desc: "Toplantı veya mülakat olarak sınıflandırın" },
                    { step: "3", title: "AI Analiz", desc: "Yükleme tamamlandığında analiz otomatik başlar" },
                  ].map((item) => (
                    <div key={item.step} className="rounded-lg border border-border p-3 flex gap-3">
                      <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{item.step}</div>
                      <div>
                        <p className="text-xs font-medium">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Supported platforms */}
              <div>
                <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <MonitorPlay className="h-3.5 w-3.5 text-primary" /> Desteklenen Platformlar
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { icon: MonitorPlay, name: "Google Meet", desc: "Meet kayıtları", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10" },
                    { icon: Video, name: "Zoom", desc: "Zoom kayıtları", color: "text-[hsl(var(--info))]", bg: "bg-[hsl(var(--info))]/10" },
                    { icon: FileVideo, name: "Teams", desc: "Teams kayıtları", color: "text-primary", bg: "bg-primary/10" },
                    { icon: Mic, name: "Canlı Kayıt", desc: "Tarayıcıdan kayıt", color: "text-accent", bg: "bg-accent/10" },
                  ].map((p) => (
                    <div key={p.name} className="rounded-lg border border-border p-3 flex items-center gap-2.5">
                      <div className={`h-8 w-8 rounded-lg ${p.bg} flex items-center justify-center shrink-0`}>
                        <p.icon className={`h-4 w-4 ${p.color}`} />
                      </div>
                      <div>
                        <p className="text-xs font-medium">{p.name}</p>
                        <p className="text-[9px] text-muted-foreground">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tips for better analysis */}
              <div className="rounded-lg bg-muted/40 border border-border p-4">
                <h4 className="text-xs font-semibold mb-2.5 flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Daha İyi Analiz İçin İpuçları
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { icon: Headphones, tip: "Net ses kalitesi sağlayın — harici mikrofon veya kulaklık kullanın" },
                    { icon: Video, tip: "Kaydı baştan sona tam olarak alın, kesik kayıtlardan kaçının" },
                    { icon: Volume2, tip: "Arka plan gürültüsünü minimumda tutun" },
                    { icon: FileVideo, tip: "MP4 formatı en uyumlu seçenektir, mümkünse MP4 kullanın" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <item.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-[11px] text-muted-foreground leading-snug">{item.tip}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="flex items-center gap-3">
                <Link to="/dashboard/upload" className="flex-1">
                  <Button variant="hero" className="w-full" size="sm">
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Kayıt Yükle
                  </Button>
                </Link>
                <Link to="/dashboard/record">
                  <Button variant="outline" size="sm">
                    <Video className="mr-1.5 h-3.5 w-3.5" /> Canlı Kayıt
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sonuç bulunamadı"
          description="Farklı filtreler veya anahtar kelimelerle tekrar deneyin."
          action={{ label: "Filtreleri Temizle", onClick: clearFilters }}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length} toplantı gösteriliyor</p>
          <div className="grid gap-2">
            {filtered.map((recording) => (
              <MeetingCard key={recording.id} recording={recording} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingsPage;
