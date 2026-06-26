import { Activity, AlertCircle, Camera, Eye, Lightbulb, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EMOTION_SAFETY_NOTICE } from "../constants";
import type { EmotionAnalysisResult, EmotionProviderName, EmotionProviderStatus } from "../types";

interface LiveEmotionPanelProps {
  status: EmotionProviderStatus;
  provider: EmotionProviderName;
  latestResult: EmotionAnalysisResult | null;
  confidence?: number;
  error?: string | null;
  className?: string;
}

const statusLabels: Record<EmotionProviderStatus, string> = {
  idle: "Bekliyor",
  initializing: "Hazırlanıyor",
  camera_waiting: "Kamera bekleniyor",
  running: "Aktif",
  analyzing: "Analiz ediliyor",
  low_visibility: "Yüz görünürlüğü düşük",
  error: "Hata",
  disabled: "Devre dışı",
};

const providerLabels: Record<EmotionProviderName, string> = {
  internal_vision: "AI vision analizi aktif",
  morphcast: "AI vision analizi aktif (MorphCast entegrasyonu devre dışı)",
  disabled: "Duygu analizi devre dışı",
};

const signalLabels: Record<string, string> = {
  neutral: "Nötr",
  positive: "Pozitif sinyal",
  focused: "Odaklı",
  confused: "Kararsız/karışık",
  stressed: "Stres sinyali",
  uncertain: "Belirsiz/temkinli",
  engaged: "Katılımlı",
  low_engagement: "Düşük katılım",
  unknown: "Bilinmiyor",
};

const ekmanLabels: Record<string, string> = {
  happiness: "Mutluluk benzeri",
  sadness: "Üzüntü/düşük enerji benzeri",
  anger: "Gerilim/öfke benzeri",
  fear: "Kaygı/stres benzeri",
  surprise: "Şaşırma/ani tepki benzeri",
  disgust: "Rahatsızlık/mesafe benzeri",
  neutral: "Nötr",
  unknown: "Belirsiz",
};

const pct = (value: number | undefined) => Math.round(Math.max(0, Math.min(1, value || 0)) * 100);

export const LiveEmotionPanel = ({
  status,
  provider,
  latestResult,
  confidence = latestResult?.ekman_style_emotion?.confidence ?? 0,
  error,
  className = "",
}: LiveEmotionPanelProps) => {
  const warnings = [
    latestResult?.face_visibility === "low" || latestResult?.face_visibility === "none" || latestResult?.face_visibility === "unknown" ? "Yüz görünürlüğü düşük veya belirsiz" : "",
    latestResult?.lighting_quality === "poor" ? "Işık yetersiz" : "",
    latestResult?.camera_quality === "poor" ? "Kamera açısı veya kalite sınırlı" : "",
    confidence < 0.45 ? "Duygu yorumu sınırlı güvenilirlikte" : "",
    error || "",
  ].filter(Boolean);

  return (
    <Card className={`border border-border bg-card p-4 shadow-card ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold">Canlı Duygu Sinyali</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{providerLabels[provider]}</p>
        </div>
        <Badge variant={status === "error" ? "destructive" : status === "running" || status === "analyzing" ? "default" : "outline"}>
          {statusLabels[status]}
        </Badge>
      </div>

      {!latestResult ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          Kamera izni ve ilk analiz bekleniyor. Sonuç gelene kadar duygu yorumu üretilmez.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/35 p-3">
              <span className="text-muted-foreground">Anlık gözlem</span>
              <p className="mt-1 font-semibold">{signalLabels[latestResult.dominant_signal] || latestResult.dominant_signal}</p>
            </div>
            <div className="rounded-lg bg-muted/35 p-3">
              <span className="text-muted-foreground">Ekman benzeri etiket</span>
              <p className="mt-1 font-semibold">{ekmanLabels[latestResult.ekman_style_emotion.label] || latestResult.ekman_style_emotion.label}</p>
            </div>
            <div className="rounded-lg bg-muted/35 p-3">
              <span className="text-muted-foreground">Trend</span>
              <p className="mt-1 font-semibold">{latestResult.engagement.trend}</p>
            </div>
            <div className="rounded-lg bg-muted/35 p-3">
              <span className="flex items-center gap-1 text-muted-foreground"><Camera className="h-3.5 w-3.5" /> Yüz</span>
              <p className="mt-1 font-semibold">{latestResult.face_visibility}</p>
            </div>
            <div className="rounded-lg bg-muted/35 p-3">
              <span className="flex items-center gap-1 text-muted-foreground"><Eye className="h-3.5 w-3.5" /> Bakış kanıtı</span>
              <p className="mt-1 font-semibold">%{pct(latestResult.eye_contact.confidence)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Gözlem güveni</span>
              <span className="font-semibold">%{pct(confidence)}</span>
            </div>
            <Progress value={pct(confidence)} className="h-1.5" />
          </div>

          <p className="rounded-lg bg-background p-3 text-xs leading-5 text-muted-foreground">
            {latestResult.interpretation}
          </p>

          {latestResult.visual_evidence.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-medium">Görsel kanıt özeti</p>
              <div className="space-y-1">
                {latestResult.visual_evidence.slice(0, 4).map((evidence) => (
                  <p key={evidence} className="text-xs leading-5 text-muted-foreground">{evidence}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {warnings.slice(0, 4).map((warning) => (
            <div key={warning} className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/25 p-3 text-[11px] leading-4 text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{EMOTION_SAFETY_NOTICE}</span>
      </div>

      {latestResult?.facs_action_unit_hints && latestResult.facs_action_unit_hints.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium">FACS/AU ipuçları</p>
          {latestResult.facs_action_unit_hints.slice(0, 3).map((hint) => (
            <div key={`${hint.au}-${hint.name}`} className="space-y-1">
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Lightbulb className="h-3 w-3" />
                {hint.au}: {hint.name} · %{pct(hint.confidence)}
              </Badge>
              <p className="text-[11px] leading-4 text-muted-foreground">{hint.observed_signal}</p>
              <p className="text-[11px] leading-4 text-muted-foreground">{hint.possible_interpretation}</p>
            </div>
          ))}
        </div>
      )}

      {latestResult?.decision_warning && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-4 text-muted-foreground">
          {latestResult.decision_warning}
        </div>
      )}
    </Card>
  );
};
