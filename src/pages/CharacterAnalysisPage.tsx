import { useEffect, useState } from "react";
import { Loader2, Brain, TrendingUp, Target, MessageCircle, Shield, Zap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { toast } from "sonner";

const asArray = (value: unknown): string[] => Array.isArray(value)
  ? value.map((item) => String(item)).filter(Boolean)
  : [];

const getPracticeScore = (practice: any) => Number(practice?.character_analysis?.overall_score || 0);

const buildLocalOverallAnalysis = (practices: any[]) => {
  const scored = practices.filter((practice) => getPracticeScore(practice) > 0);
  const source = scored.length > 0 ? scored : practices;
  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((sum, practice) => sum + getPracticeScore(practice), 0) / scored.length)
    : 0;
  const positions = [...new Set(source.map((practice) => practice.position).filter(Boolean))];
  const strengths = [...new Set(source.flatMap((practice) => [
    ...asArray(practice.character_analysis?.interview_strengths),
    ...asArray(practice.character_analysis?.strengths),
  ]))].slice(0, 5);
  const weaknesses = [...new Set(source.flatMap((practice) => [
    ...asArray(practice.character_analysis?.interview_weaknesses),
    ...asArray(practice.character_analysis?.weaknesses),
    ...asArray(practice.analysis_data?.improvement_areas),
  ]))].slice(0, 4);
  const traits = [...new Set(source.flatMap((practice) => asArray(practice.character_analysis?.personality_traits)))].slice(0, 6);
  const communicationStyles = source
    .map((practice) => practice.character_analysis?.communication_style)
    .filter(Boolean)
    .slice(0, 3);
  const thinkingStyles = source
    .map((practice) => practice.character_analysis?.thinking_style)
    .filter(Boolean)
    .slice(0, 2);

  return {
    overall_assessment: scored.length > 0
      ? `${scored.length} analiz edilmiş pratik üzerinden ortalama karakter ve davranış skoru ${avgScore}/100. ${positions.length > 0 ? `Ağırlıklı hedef pozisyonlar: ${positions.slice(0, 3).join(", ")}.` : ""} Bu özet kayıtlı pratiklerdeki gözlemlerden oluşturuldu; psikolojik teşhis değildir.`
      : "Henüz AI karakter skoru üretilmiş pratik yok. Pratik mülakat analizleri tamamlandıkça burada daha net bir karakter ve davranış profili oluşur.",
    communication_profile: communicationStyles.length > 0
      ? communicationStyles.join(" ")
      : "İletişim profili için yeterli analizli pratik bulunamadı. Yeni pratiklerde transkript ve analiz tamamlandığında bu alan güçlenecek.",
    thinking_profile: thinkingStyles.length > 0
      ? thinkingStyles.join(" ")
      : "Düşünme tarzı çıkarımı için henüz sınırlı veri var; sonraki pratiklerde problem çözme ve örnek anlatımı takip edilmeli.",
    career_recommendations: weaknesses.length > 0
      ? `Öncelik, mülakatlarda tekrar eden gelişim alanlarını somut örneklerle kapatmak olmalı: ${weaknesses.slice(0, 3).join(", ")}.`
      : "Kariyer önerisi için daha fazla analizli pratik gerekli. En az bir pratik mülakatı tamamlayıp analiz edin.",
    core_strengths: strengths.length > 0 ? strengths : traits.length > 0 ? traits : ["Veri toplama aşamasında"],
    interview_blind_spots: weaknesses.length > 0 ? weaknesses.slice(0, 3) : ["Analizli pratik sayısı düşük"],
    hireability_assessment: avgScore > 0
      ? `Mevcut pratiklere göre mülakat hazır oluş skoru ${avgScore}/100 seviyesinde. Bu skor yalnızca pratik oturum verilerine dayanır.`
      : "İşe alım sinyali çıkarımı için tamamlanmış karakter analizi bulunmuyor.",
    development_plan: [
      "Her pratikte STAR formatında en az iki güçlü örnek anlatın.",
      "Yanıtları sonuç, etki ve ölçülebilir katkı ile kapatın.",
      "Zayıf alanları sonraki pratikte hedef soru setine dönüştürün.",
      "Kayıt sonrası transkripti kontrol edip eksik kanıtları not alın.",
      "En az üç analizli pratikten sonra genel profili tekrar oluşturun.",
    ],
    ideal_roles: positions.slice(0, 5),
    personality_profile: traits.length > 0
      ? `Öne çıkan gözlemler: ${traits.join(", ")}. Bu profil mülakat performansı içindeki davranış sinyallerine dayanır.`
      : "Kişilik profili için yeterli tekrar eden davranış sinyali bulunamadı.",
  };
};

const CharacterAnalysisPage = () => {
  const [practices, setPractices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [overallAnalysis, setOverallAnalysis] = useState<any>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setPractices([]);
          return;
        }
        const { data, error } = await supabase
          .from("practice_interviews")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setPractices(data || []);
      } catch (error) {
        console.error("Character analysis data error:", error);
        toast.error("Karakter analizi verileri alınamadı.");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const runOverallAnalysis = async () => {
    if (practices.length === 0) { toast.error("Analiz için pratik gerekli"); return; }
    setAnalyzing(true);
    try {
      const payloadPractices = practices.map((p) => ({
        position: p.position,
        department: p.department,
        skills: p.skills,
        character_analysis: p.character_analysis,
        analysis_data: p.analysis_data,
        transcript: p.transcript,
        created_at: p.created_at,
      }));
      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_CHARACTER, {
        practices: payloadPractices,
      }, { maxRetries: 1, timeoutMs: 90000 });
      if (result.error) {
        setOverallAnalysis(buildLocalOverallAnalysis(practices));
        toast.warning(`${getErrorToastMessage(result.error)} Yerel özet gösteriliyor.`);
        return;
      }
      setOverallAnalysis((result.data as any)?.analysis || result.data || buildLocalOverallAnalysis(practices));
      toast.success("Genel analiz tamamlandı!");
    } catch (e: any) {
      if (e.message?.includes("Rate limit")) toast.error("AI istek limiti aşıldı.");
      else toast.error("Analiz hatası. Yerel özet gösteriliyor.");
      setOverallAnalysis(buildLocalOverallAnalysis(practices));
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const scoredPractices = practices.filter((p) => p.character_analysis?.overall_score);
  const avgScore = scoredPractices.length > 0
    ? Math.round(scoredPractices.reduce((acc, p) => acc + (p.character_analysis?.overall_score || 0), 0) / scoredPractices.length)
    : 0;

  // Aggregate communication styles from all practices
  const allTraits = practices.flatMap((p) => p.character_analysis?.personality_traits || []);
  const traitCounts = allTraits.reduce<Record<string, number>>((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {});
  const topTraits = Object.entries(traitCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">Karakter & Davranış Analizi 🧠</h1>
        <p className="text-muted-foreground text-sm">Tüm pratiklerinizden elde edilen kişilik profili ve davranışsal içgörüler</p>
      </div>

      <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3">
        AI gözlemlerine dayalı değerlendirme — profesyonel bir kişilik testi veya psikolojik teşhis yerine geçmez.
      </p>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card text-center">
          <Brain className="h-8 w-8 text-primary mx-auto mb-2" />
          <div className="font-display text-3xl font-bold text-primary">{avgScore || "-"}</div>
          <p className="text-xs text-muted-foreground mt-1">Ortalama Skor</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card text-center">
          <TrendingUp className="h-8 w-8 text-accent mx-auto mb-2" />
          <div className="font-display text-3xl font-bold">{practices.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Toplam Pratik</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card text-center">
          <Target className="h-8 w-8 text-primary mx-auto mb-2" />
          <div className="font-display text-lg font-bold truncate">{practices[0]?.position || "-"}</div>
          <p className="text-xs text-muted-foreground mt-1">Son Hedef Pozisyon</p>
        </div>
      </div>

      {/* Consistent Personality Traits */}
      {topTraits.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Tutarlı Kişilik Özellikleri</h2>
          <div className="flex flex-wrap gap-2">
            {topTraits.map((t, i) => (
              <span key={i} className="px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Run Analysis */}
      <Button onClick={runOverallAnalysis} variant="hero" className="w-full" disabled={analyzing || practices.length === 0}>
        {analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analiz ediliyor...</> : <><Brain className="mr-2 h-4 w-4" />Genel Karakter Analizi Oluştur</>}
      </Button>

      {/* Overall Analysis Results */}
      {overallAnalysis && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
            <h2 className="font-display text-lg font-bold flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" />Genel Değerlendirme</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{overallAnalysis.overall_assessment}</p>
          </div>

          {overallAnalysis.communication_profile && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-3">
              <h2 className="font-display text-lg font-bold">🗣️ İletişim Profili</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{overallAnalysis.communication_profile}</p>
            </div>
          )}

          {overallAnalysis.thinking_profile && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-3">
              <h2 className="font-display text-lg font-bold">🧠 Düşünme Tarzı</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{overallAnalysis.thinking_profile}</p>
            </div>
          )}

          {overallAnalysis.career_recommendations && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-3">
              <h2 className="font-display text-lg font-bold">🎯 Kariyer Önerileri</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{overallAnalysis.career_recommendations}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {overallAnalysis.core_strengths?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="text-sm font-semibold mb-3 text-primary">💪 Temel Güçlü Yönler</h3>
                <div className="flex flex-wrap gap-2">
                  {overallAnalysis.core_strengths.map((s: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {overallAnalysis.interview_blind_spots?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="text-sm font-semibold mb-3 text-destructive">⚠️ Mülakat Kör Noktaları</h3>
                <div className="flex flex-wrap gap-2">
                  {overallAnalysis.interview_blind_spots.map((s: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {overallAnalysis.development_plan?.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <h2 className="font-display text-lg font-bold mb-3">📈 Gelişim Planı</h2>
              <ul className="space-y-2">
                {overallAnalysis.development_plan.map((item: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="font-bold text-primary shrink-0">{i + 1}.</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Score History */}
      {scoredPractices.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h2 className="font-display text-lg font-bold mb-4">Skor Geçmişi</h2>
          <div className="space-y-2">
            {scoredPractices.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-6">#{scoredPractices.length - i}</span>
                  <div>
                    <span className="text-sm font-medium">{p.position}</span>
                    <span className="text-xs text-muted-foreground ml-2">{new Date(p.created_at).toLocaleDateString("tr-TR")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={p.character_analysis.overall_score} className="w-20 h-2" />
                  <div className="font-display font-bold text-primary w-12 text-right">{p.character_analysis.overall_score}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterAnalysisPage;
