import { TrendingUp, TrendingDown, Clock } from "lucide-react";

interface CareerTrajectoryProps {
  trajectory: {
    current_path: string;
    improved_path: string;
    timeline: string;
  } | null;
}

const CareerTrajectory = ({ trajectory }: CareerTrajectoryProps) => {
  if (!trajectory) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
      <h3 className="font-display text-sm font-bold flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        Kariyer Trajektorisi
      </h3>
      <div className="space-y-2">
        <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="h-3 w-3 text-destructive" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-destructive/70">Mevcut Gidişat</p>
          </div>
          <p className="text-sm text-muted-foreground">{trajectory.current_path}</p>
        </div>
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3 w-3 text-primary" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">İyileşme Senaryosu</p>
          </div>
          <p className="text-sm text-muted-foreground">{trajectory.improved_path}</p>
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Tahmini süre: <span className="font-semibold text-foreground">{trajectory.timeline}</span></p>
        </div>
      </div>
    </div>
  );
};

export default CareerTrajectory;
