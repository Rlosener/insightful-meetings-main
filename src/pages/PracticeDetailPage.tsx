import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, ArrowLeft, Mic, Brain, Shield, Zap, Users, Target, TrendingUp, Award, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

const PracticeDetailPage = () => {
  const { id } = useParams();
  const [practice, setPractice] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!id) return;
      const { data } = await supabase
        .from("practice_interviews")
        .select("*")
        .eq("id", id)
        .single();
      setPractice(data);
      setLoading(false);
    };
    fetch();
  }, [id]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!practice) return <div className="text-center py-12 text-muted-foreground">Pratik bulunamadı</div>;

  const ca = practice.character_analysis;
  const analysis = practice.analysis_data;

  const ScoreCard = ({ label, score, icon: Icon }: { label: string; score: number; icon: any }) => (
    <div className="rounded-lg border border-border bg-card p-3 text-center space-y-1">
      <Icon className="h-4 w-4 mx-auto text-muted-foreground" />
      <div className="font-display text-xl font-bold text-primary">{score}</div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <Progress value={score} className="h-1" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/individual/history">
        <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />Geri</Button>
      </Link>

      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold">{practice.position}</h1>
        <p className="text-muted-foreground text-sm">{practice.department || "Genel"} • {practice.duration || "-"} • {new Date(practice.created_at).toLocaleDateString("tr-TR")}</p>
      </div>

      {ca && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-6 text-center space-y-2">
          <div className="font-display text-5xl font-bold text-primary">{ca.overall_score}/100</div>
          <p className="text-sm text-muted-foreground">Genel Performans Skoru</p>
          {analysis?.interview_readiness && (
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
              analysis.interview_readiness === "Hazır" ? "bg-primary/10 text-primary" :
              analysis.interview_readiness === "Neredeyse Hazır" ? "bg-accent/10 text-accent" :
              "bg-destructive/10 text-destructive"
            }`}>{analysis.interview_readiness}</span>
          )}
        </div>
      )}

      {/* Score Cards */}
      {analysis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {analysis.communication_score && <ScoreCard label="İletişim" score={analysis.communication_score} icon={Mic} />}
          {analysis.technical_score && <ScoreCard label="Teknik" score={analysis.technical_score} icon={Brain} />}
          {analysis.confidence_score && <ScoreCard label="Özgüven" score={analysis.confidence_score} icon={Shield} />}
          {analysis.clarity_score && <ScoreCard label="Netlik" score={analysis.clarity_score} icon={Target} />}
          {analysis.depth_score && <ScoreCard label="Derinlik" score={analysis.depth_score} icon={BookOpen} />}
        </div>
      )}

      {/* Summary */}
      {analysis && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-3">
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><Award className="h-5 w-5 text-primary" />Performans Analizi</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>
          {analysis.position_fit && (
            <div className="bg-accent/5 rounded-lg p-3">
              <p className="text-xs font-semibold text-accent mb-1">📌 Pozisyon Uyumu</p>
              <p className="text-sm text-muted-foreground">{analysis.position_fit}</p>
            </div>
          )}
        </div>
      )}

      {/* Character Analysis */}
      {ca && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><Brain className="h-5 w-5 text-primary" />Karakter & Davranış Analizi</h2>
          <p className="text-xs text-muted-foreground italic">AI gözlemlerine dayalı değerlendirme</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{ca.character_summary}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ca.communication_style && (
              <div className="bg-muted/20 rounded-lg p-3">
                <p className="text-xs font-semibold mb-1">🗣️ İletişim Tarzı</p>
                <p className="text-sm text-muted-foreground">{ca.communication_style}</p>
              </div>
            )}
            {ca.thinking_style && (
              <div className="bg-muted/20 rounded-lg p-3">
                <p className="text-xs font-semibold mb-1">🧠 Düşünme Tarzı</p>
                <p className="text-sm text-muted-foreground">{ca.thinking_style}</p>
              </div>
            )}
            {ca.stress_management && (
              <div className="bg-muted/20 rounded-lg p-3">
                <p className="text-xs font-semibold mb-1">😤 Stres Yönetimi</p>
                <p className="text-sm text-muted-foreground">{ca.stress_management}</p>
              </div>
            )}
            {ca.emotional_intelligence && (
              <div className="bg-muted/20 rounded-lg p-3">
                <p className="text-xs font-semibold mb-1">❤️ Duygusal Zeka</p>
                <p className="text-sm text-muted-foreground">{ca.emotional_intelligence}</p>
              </div>
            )}
          </div>

          {(ca.interview_strengths || ca.strengths)?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-primary">💪 Güçlü Yönler</h3>
              <div className="flex flex-wrap gap-2">
                {(ca.interview_strengths || ca.strengths).map((s: string, i: number) => (
                  <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}

          {(ca.interview_weaknesses || ca.weaknesses)?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-destructive">⚠️ Gelişim Alanları</h3>
              <div className="flex flex-wrap gap-2">
                {(ca.interview_weaknesses || ca.weaknesses).map((w: string, i: number) => (
                  <span key={i} className="px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium">{w}</span>
                ))}
              </div>
            </div>
          )}

          {ca.behavioral_patterns?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">🔍 Davranışsal Kalıplar</h3>
              <ul className="space-y-1">
                {ca.behavioral_patterns.map((p: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-primary mt-0.5">•</span>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {ca.recommendations?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">📋 Öneriler</h3>
              <ul className="space-y-1.5">
                {ca.recommendations.map((r: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-primary mt-0.5">•</span>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {practice.transcript && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h2 className="font-display text-lg font-bold mb-3">Transkript</h2>
          <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">{practice.transcript}</pre>
        </div>
      )}
    </div>
  );
};

export default PracticeDetailPage;
