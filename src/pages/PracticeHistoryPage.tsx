import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Mic, Calendar, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PracticeHistoryPage = () => {
  const [practices, setPractices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("practice_interviews")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setPractices(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">Pratik Geçmişi 📋</h1>
        <p className="text-muted-foreground text-sm">Tüm pratik mülakatlarınız ve sonuçları</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : practices.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-border bg-muted/30">
          <Mic className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Henüz pratik yapılmamış</p>
          <Link to="/individual/practice" className="text-primary hover:underline text-sm font-medium mt-2 inline-block">İlk pratiğinizi başlatın →</Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {practices.map((p) => (
            <Link key={p.id} to={`/individual/history/${p.id}`} className="rounded-xl border border-border bg-card p-4 sm:p-5 hover:border-primary/30 transition-colors shadow-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-medium">{p.position}</h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                    {p.department && <span>{p.department}</span>}
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(p.created_at).toLocaleDateString("tr-TR")}</span>
                    {p.duration && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{p.duration}</span>}
                  </div>
                  {p.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.skills.slice(0, 4).map((s: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-muted text-xs text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {p.character_analysis?.overall_score ? (
                    <div className="font-display text-2xl font-bold text-primary">{p.character_analysis.overall_score}<span className="text-sm text-muted-foreground">/100</span></div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Skor yok</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default PracticeHistoryPage;
