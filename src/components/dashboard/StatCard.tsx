import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  iconColor?: string;
}

const StatCard = ({ icon: Icon, label, value, change, trend = "neutral", iconColor }: StatCardProps) => (
  <div className="rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:shadow-card-md group">
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${iconColor || "bg-primary/10 text-primary"} group-hover:bg-primary/15`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <div className="font-display text-2xl font-bold tracking-tight">{value}</div>
    {change && (
      <p className={`text-xs mt-1 font-medium ${
        trend === "up" ? "text-[hsl(var(--success))]" : trend === "down" ? "text-destructive" : "text-muted-foreground"
      }`}>
        {change}
      </p>
    )}
  </div>
);

export default StatCard;
