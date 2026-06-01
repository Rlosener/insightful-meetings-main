import { ArrowRight, Mic, Brain, TrendingUp, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface PostSessionActionsProps {
  score: number;
  weaknesses?: string[];
  onReset: () => void;
}

const PostSessionActions = ({ score, weaknesses, onReset }: PostSessionActionsProps) => {
  const suggestions = [];

  if (score < 60) {
    suggestions.push({
      icon: RotateCcw,
      title: "Aynı pozisyonda tekrar pratik yap",
      desc: "Skorunuzu yükseltmek için tekrar deneyin",
      action: onReset,
      variant: "hero" as const,
    });
  }

  if (score >= 60 && score < 80) {
    suggestions.push({
      icon: TrendingUp,
      title: "Zorluk seviyesini artır",
      desc: "Daha zorlayıcı sorularla kendinizi test edin",
      action: onReset,
      variant: "hero" as const,
    });
  }

  if (score >= 80) {
    suggestions.push({
      icon: Mic,
      title: "Farklı bir pozisyon dene",
      desc: "Yeni roller keşfederek esnekliğinizi artırın",
      action: onReset,
      variant: "hero" as const,
    });
  }

  return (
    <div className="rounded-xl border-2 border-accent/20 bg-accent/5 p-6 space-y-4">
      <h2 className="font-display text-lg font-bold flex items-center gap-2">
        <ArrowRight className="h-5 w-5 text-accent" />
        Sıradaki Adımınız
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={s.action}
            className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary/30 transition-colors space-y-2 group"
          >
            <s.icon className="h-5 w-5 text-primary" />
            <p className="text-sm font-semibold group-hover:text-primary transition-colors">{s.title}</p>
            <p className="text-xs text-muted-foreground">{s.desc}</p>
          </button>
        ))}

        <Link
          to="/individual/coach"
          className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary/30 transition-colors space-y-2 group"
        >
          <Brain className="h-5 w-5 text-primary" />
          <p className="text-sm font-semibold group-hover:text-primary transition-colors">AI Koç ile görüş</p>
          <p className="text-xs text-muted-foreground">Zayıf yönleriniz hakkında kişisel öneriler alın</p>
        </Link>

        <Link
          to="/individual/history"
          className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary/30 transition-colors space-y-2 group"
        >
          <TrendingUp className="h-5 w-5 text-accent" />
          <p className="text-sm font-semibold group-hover:text-primary transition-colors">Gelişim grafiğini gör</p>
          <p className="text-xs text-muted-foreground">Geçmiş performansınızı karşılaştırın</p>
        </Link>
      </div>

      {weaknesses && weaknesses.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-3 space-y-1.5">
          <p className="text-xs font-semibold text-destructive">⚡ Odaklanmanız Gereken Alanlar:</p>
          <div className="flex flex-wrap gap-1.5">
            {weaknesses.slice(0, 4).map((w, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-[11px] font-medium">{w}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PostSessionActions;
