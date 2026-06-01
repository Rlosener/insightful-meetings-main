import { Eye } from "lucide-react";

interface PatternDetectionProps {
  patterns: string[] | null;
}

const PatternDetection = ({ patterns }: PatternDetectionProps) => {
  if (!patterns || patterns.length === 0) return null;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 space-y-3">
      <h3 className="font-display text-sm font-bold flex items-center gap-2">
        <Eye className="h-4 w-4 text-accent" />
        Tekrarlayan Kalıplar
      </h3>
      <div className="space-y-2">
        {patterns.map((p, i) => (
          <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-card border border-border">
            <span className="h-5 w-5 rounded-full bg-accent/10 text-accent text-[10px] flex items-center justify-center font-bold shrink-0 mt-0.5">⟳</span>
            <p className="text-sm text-muted-foreground">{p}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PatternDetection;
