import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  FileAudio,
  Globe,
  Loader2,
  MessageSquare,
  Plug,
  RefreshCw,
  Settings2,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/dashboard/PageHeader";
import { EDGE_FUNCTIONS } from "@/config/api";
import { invokeEdgeFunction } from "@/lib/edgeFunctionClient";

type ReadinessStatus = "idle" | "checking" | "ok" | "manual" | "misconfigured" | "next" | "error";

interface HealthResponse {
  status?: "ok" | "misconfigured" | "error";
  function?: string;
  checks?: Record<string, boolean | string>;
  message?: string;
  providers?: Record<string, boolean>;
}

interface HealthState {
  status: ReadinessStatus;
  message: string;
  checks: Record<string, boolean | string>;
}

const healthTargets = [
  {
    key: "transcription",
    title: "Transkript Sağlayıcıları",
    description: "Dosya, canlı kayıt ve manuel toplantı akışlarının transkript altyapısı.",
    functionName: EDGE_FUNCTIONS.TRANSCRIBE_RECORDING,
    icon: FileAudio,
  },
  {
    key: "analysis",
    title: "AI Analiz Motoru",
    description: "Toplantı, mülakat, Google Meet ve Zoom manuel akışlarında kullanılan ana analiz fonksiyonu.",
    functionName: EDGE_FUNCTIONS.ANALYZE_INTERVIEW,
    icon: Settings2,
  },
  {
    key: "assistant",
    title: "AI Toplantı Asistanı",
    description: "Canlı toplantı sırasında öneri üreten stream tabanlı asistan.",
    functionName: EDGE_FUNCTIONS.MEETING_ASSISTANT,
    icon: MessageSquare,
  },
  {
    key: "advisor",
    title: "Şirket Danışmanı ve Sektör Radarı",
    description: "AI danışman, şirket profili ve sektör radarı sorguları.",
    functionName: EDGE_FUNCTIONS.COMPANY_ADVISOR,
    icon: Plug,
  },
  {
    key: "practice",
    title: "Bireysel Pratik ve Koçluk",
    description: "Pratik mülakat soruları ve kariyer koçu içgörüleri.",
    functionName: EDGE_FUNCTIONS.GENERATE_QUESTIONS,
    icon: Cloud,
  },
] as const;

const manualIntegrations = [
  {
    name: "Zoom",
    description: "Kayıt veya transkript dosyasını manuel yükleyerek analiz çalışır. Zoom API ile otomatik çekim sonraki fazdır.",
    status: "manual" as const,
    href: "/dashboard/record?mode=zoom",
    icon: Video,
    badge: "Manuel aktif",
  },
  {
    name: "Google Meet",
    description: "Meet transkriptini yapıştırarak veya dosya ile yükleyerek analiz çalışır. Otomatik Google API bağlantısı sonraki fazdır.",
    status: "manual" as const,
    href: "/dashboard/record?mode=meet",
    icon: Globe,
    badge: "Manuel aktif",
  },
  {
    name: "Microsoft Teams",
    description: "Teams API otomatik içe aktarımı bu fazın dışında. Dosya/transkript export'u dosya yükleme modu ile analiz edilebilir.",
    status: "next" as const,
    href: "/dashboard/record?mode=file",
    icon: Globe,
    badge: "Canlı API sonraki faz",
  },
] as const;

const deployItems = [
  {
    title: "Deploy fonksiyon kapsamı",
    description: "supabase/config.toml içindeki fonksiyonların deploy script'i ve readiness kontrolü ile kapsanması beklenir.",
    status: "manual" as const,
    badge: "Readiness script ile doğrulanır",
  },
  {
    title: "Canlı deploy",
    description: "Bu MVP fazında canlı deploy yapılmadı. Üretime çıkış öncesi npm run check:readiness ve health kontrolü çalıştırılmalı.",
    status: "next" as const,
    badge: "Manuel release adımı",
  },
] as const;

const statusText: Record<ReadinessStatus, string> = {
  idle: "Kontrol bekliyor",
  checking: "Kontrol ediliyor",
  ok: "Aktif",
  manual: "Manuel aktif",
  misconfigured: "Konfigürasyon gerekli",
  next: "Canlı API sonraki faz",
  error: "Kontrol başarısız",
};

const statusClass: Record<ReadinessStatus, string> = {
  idle: "border-border bg-muted/40 text-muted-foreground",
  checking: "border-muted bg-muted/40 text-muted-foreground",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  manual: "border-primary/20 bg-primary/5 text-primary",
  misconfigured: "border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  next: "border-border bg-muted/40 text-muted-foreground",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

const iconForStatus = (status: ReadinessStatus) => {
  if (status === "checking") return Loader2;
  if (status === "ok" || status === "manual") return CheckCircle2;
  return AlertCircle;
};

const normalizeHealth = (data: HealthResponse | null): HealthState => {
  const checks = data?.checks || data?.providers || {};
  const booleanChecks = Object.values(checks).filter((value) => typeof value === "boolean") as boolean[];
  const hasConfiguredProvider = data?.providers ? Object.values(data.providers).some(Boolean) : false;
  const hasFailedCheck = booleanChecks.length > 0 && booleanChecks.some((value) => !value);
  const status: ReadinessStatus =
    data?.status === "ok" || hasConfiguredProvider
      ? "ok"
      : data?.status === "error"
        ? "error"
        : data?.status === "misconfigured" || hasFailedCheck
          ? "misconfigured"
          : "ok";

  return {
    status,
    checks,
    message: data?.message || (status === "ok" ? "Yan etkisiz health kontrolü başarılı." : statusText[status]),
  };
};

const StatusPill = ({ status, label }: { status: ReadinessStatus; label?: string }) => {
  const Icon = iconForStatus(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass[status]}`}>
      <Icon className={`h-3.5 w-3.5 ${status === "checking" ? "animate-spin" : ""}`} />
      {label || statusText[status]}
    </span>
  );
};

const IntegrationsPage = () => {
  const [health, setHealth] = useState<Record<string, HealthState>>({});

  const isChecking = useMemo(
    () => Object.values(health).some((item) => item.status === "checking"),
    [health],
  );

  const runHealthChecks = useCallback(async () => {
    setHealth(Object.fromEntries(healthTargets.map((target) => [
      target.key,
      { status: "checking", message: "Health kontrolü çalışıyor.", checks: {} },
    ])));

    const results = await Promise.all(healthTargets.map(async (target) => {
      const result = await invokeEdgeFunction<HealthResponse>(
        target.functionName,
        { health: true },
        { maxRetries: 0, timeoutMs: 30000 },
      );
      return [
        target.key,
        result.error
          ? {
            status: result.error.type === "VALIDATION" ? "misconfigured" : "error",
            message: result.error.type === "VALIDATION"
              ? "Health kontratı deploy/config güncellemesi bekliyor."
              : result.error.message,
            checks: {},
          }
          : normalizeHealth(result.data),
      ] as const;
    }));

    setHealth(Object.fromEntries(results));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <PageHeader
          title="Entegrasyonlar"
          description="Modül durumları, manuel fallback akışları ve edge function readiness kontrolleri"
        />
        <Button type="button" variant="outline" onClick={runHealthChecks} disabled={isChecking} className="w-full md:w-auto">
          {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Health Kontrolü
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {manualIntegrations.map((integration) => (
          <div key={integration.name} className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <integration.icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-sm font-semibold">{integration.name}</h2>
                  <StatusPill status={integration.status} label={integration.badge} />
                </div>
              </div>
            </div>
            <p className="min-h-[72px] text-sm leading-relaxed text-muted-foreground">{integration.description}</p>
            <Link to={integration.href}>
              <Button variant="outline" size="sm" className="mt-4 w-full">
                <ArrowRight className="h-4 w-4" />
                Kullan
              </Button>
            </Link>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {healthTargets.map((target) => {
          const state = health[target.key] || {
            status: "idle" as const,
            message: "Canlı deploy sonrası Health Kontrolü ile yan etkisiz smoke test yapın.",
            checks: {},
          };
          return (
            <div key={target.key} className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                    <target.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-sm font-semibold">{target.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{target.description}</p>
                    <p className="mt-3 text-sm">{state.message}</p>
                  </div>
                </div>
                <StatusPill status={state.status} />
              </div>
              {Object.keys(state.checks).length > 0 && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {Object.entries(state.checks).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                      <span className="truncate text-muted-foreground">{key}</span>
                      <span className={value === true ? "text-emerald-600" : value === false ? "text-[hsl(var(--warning))]" : "text-foreground"}>
                        {typeof value === "boolean" ? (value ? "hazır" : "eksik") : value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {deployItems.map((item) => (
          <div key={item.title} className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
              <StatusPill status={item.status} label={item.badge} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IntegrationsPage;
