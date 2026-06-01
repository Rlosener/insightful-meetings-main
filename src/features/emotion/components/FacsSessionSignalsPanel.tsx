import { Activity, AlertCircle, ScanEye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { FacsAuSessionResult } from "../facs/facsSessionAggregator";

interface FacsSessionSignalsPanelProps {
  result: FacsAuSessionResult;
  analyzing?: boolean;
  error?: string | null;
  className?: string;
}

const pct = (value: number) => Math.round(Math.max(0, Math.min(1, value || 0)) * 100);

const scoreRows = (result: FacsAuSessionResult) => [
  { label: "Katılım sinyali", value: result.scores.engagement, text: result.labels.engagement },
  { label: "Odak sinyali", value: result.scores.focus, text: result.labels.focus },
  { label: "Gerilim sinyali", value: result.scores.stressSignal, text: result.labels.stressSignal },
];

const collectingEvidence = "Görsel kanıt toplanıyor. 10 saniyelik yorum için en az 3 örnek bekleniyor.";

export const FacsSessionSignalsPanel = ({
  result,
  analyzing = false,
  error,
  className = "",
}: FacsSessionSignalsPanelProps) => (
  <Card className={`border border-border bg-card p-4 shadow-card ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <ScanEye className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-semibold">Biveyos Canlı Oturum Sinyalleri</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          10 saniyelik rolling average, görsel kanıt özeti ve FACS/AU ipuçlarıyla üretilir.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={analyzing ? "default" : result.window.sampleCount >= 3 ? "secondary" : "outline"}>
          {analyzing ? "Analiz ediliyor" : `${result.window.sampleCount} örnek`}
        </Badge>
        <Badge variant="outline">{result.labels.trend}</Badge>
      </div>
    </div>

    <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs font-medium">10 saniyelik İK gözlem yorumu</p>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">{result.interpretation.summary}</p>
          <p className="mt-2 text-xs leading-5 text-foreground">{result.interpretation.hrNote}</p>
        </div>
      </div>

      <div className="space-y-2">
        {scoreRows(result).map((row) => (
          <div key={row.label} className="rounded-lg border border-border bg-background p-2.5">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium">{row.label}</span>
              <span className="text-muted-foreground">%{pct(row.value)} · {row.text}</span>
            </div>
            <Progress value={pct(row.value)} className="h-1.5" />
          </div>
        ))}
      </div>
    </div>

    <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
      <p className="mb-2 text-xs font-medium">FACS/AU tabanlı genel çıkarım ve görsel kanıt özeti</p>
      <div className="space-y-2 text-xs leading-5 text-muted-foreground">
        <p>{result.window.sampleCount < 3 ? collectingEvidence : result.signal.facsAuInference}</p>
        {result.window.sampleCount >= 3 && <p>{result.evidence.expressionSummary}</p>}
      </div>
    </div>

    {result.limitations.length > 0 && (
      <div className="mt-3 rounded-lg border border-border bg-background p-3">
        <p className="mb-2 text-xs font-medium">Sınırlılıklar</p>
        <div className="space-y-1 text-xs leading-5 text-muted-foreground">
          {result.limitations.slice(0, 4).map((limitation) => <p key={limitation}>{limitation}</p>)}
        </div>
      </div>
    )}

    {error && (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{error}</span>
      </div>
    )}

    {analyzing && (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5 animate-pulse text-primary" />
        Kamera kareleri analiz ediliyor.
      </div>
    )}
  </Card>
);
