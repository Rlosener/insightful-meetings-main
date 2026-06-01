import { Activity } from "lucide-react";

interface PerformanceSignalsProps {
  signals: {
    clarity: string;
    structure: string;
    confidence: string;
    knowledge: string;
  } | null;
}

const levelColors: Record<string, string> = {
  "Düşük": "bg-destructive/15 text-destructive border-destructive/20",
  "Orta": "bg-accent/15 text-accent border-accent/20",
  "İyi": "bg-primary/15 text-primary border-primary/20",
  "Çok İyi": "bg-primary/20 text-primary border-primary/30",
};

const levelDots: Record<string, number> = {
  "Düşük": 1,
  "Orta": 2,
  "İyi": 3,
  "Çok İyi": 4,
};

const labels: Record<string, string> = {
  clarity: "Netlik",
  structure: "Yapı",
  confidence: "Özgüven",
  knowledge: "Bilgi",
};

const PerformanceSignals = ({ signals }: PerformanceSignalsProps) => {
  if (!signals) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
      <h3 className="font-display text-sm font-bold flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        Performans Sinyalleri
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(signals).map(([key, value]) => {
          const dots = levelDots[value] || 2;
          return (
            <div key={key} className={`p-2.5 rounded-lg border ${levelColors[value] || "bg-muted border-border"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1">{labels[key] || key}</p>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4].map((d) => (
                    <div
                      key={d}
                      className={`h-1.5 w-3 rounded-full ${d <= dots ? "bg-current opacity-80" : "bg-current opacity-15"}`}
                    />
                  ))}
                </div>
                <span className="text-xs font-semibold ml-1">{value}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PerformanceSignals;
