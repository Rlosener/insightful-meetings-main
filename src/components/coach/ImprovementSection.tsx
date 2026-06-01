import { AlertTriangle, Lightbulb, Dumbbell, ArrowRightLeft } from "lucide-react";

interface WeaknessItem {
  area: string;
  why_it_matters?: string;
  tip: string;
  example?: string;
  rewritten_example?: string;
  practice_exercise?: string;
}

interface ImprovementSectionProps {
  weaknesses: WeaknessItem[];
  personalAdvice: {
    communication?: string;
    structure?: string;
    confidence?: string;
  } | null;
}

const ImprovementSection = ({ weaknesses, personalAdvice }: ImprovementSectionProps) => {
  if (!weaknesses?.length && !personalAdvice) return null;

  return (
    <div className="space-y-4">
      {weaknesses?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
          <h3 className="font-display text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Nasıl Geliştirilir?
          </h3>
          <div className="space-y-3">
            {weaknesses.map((w, i) => (
              <div key={i} className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 space-y-2">
                <p className="text-sm font-semibold text-destructive">{w.area}</p>
                {w.why_it_matters && (
                  <p className="text-[11px] text-muted-foreground">📌 <span className="font-medium">Neden önemli:</span> {w.why_it_matters}</p>
                )}
                <p className="text-xs text-muted-foreground">{w.tip}</p>

                {/* Rewrite comparison */}
                {w.example && w.rewritten_example && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <ArrowRightLeft className="h-3 w-3" />
                      Önce / Sonra
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <div className="text-xs text-muted-foreground bg-destructive/5 rounded p-2 border border-destructive/10">
                        <span className="text-[9px] font-bold text-destructive uppercase">Zayıf</span>
                        <p className="mt-0.5 italic">"{w.example}"</p>
                      </div>
                      <div className="text-xs text-muted-foreground bg-primary/5 rounded p-2 border border-primary/10">
                        <span className="text-[9px] font-bold text-primary uppercase">Güçlü</span>
                        <p className="mt-0.5 italic">"{w.rewritten_example}"</p>
                      </div>
                    </div>
                  </div>
                )}
                {!w.rewritten_example && w.example && (
                  <p className="text-xs text-muted-foreground italic bg-muted/30 rounded p-2">💬 "{w.example}"</p>
                )}

                {w.practice_exercise && (
                  <div className="flex items-start gap-1.5 text-xs text-primary bg-primary/5 rounded p-2">
                    <Dumbbell className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{w.practice_exercise}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {personalAdvice && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
          <h3 className="font-display text-sm font-bold flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-accent" />
            Kişisel Öneriler
          </h3>
          <div className="grid gap-2">
            {personalAdvice.communication && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">İletişim</p>
                <p className="text-sm">{personalAdvice.communication}</p>
              </div>
            )}
            {personalAdvice.structure && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Cevap Yapısı</p>
                <p className="text-sm">{personalAdvice.structure}</p>
              </div>
            )}
            {personalAdvice.confidence && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Özgüven</p>
                <p className="text-sm">{personalAdvice.confidence}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImprovementSection;
