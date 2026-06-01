import { Video, Globe, Mic, CheckCircle2, ExternalLink, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/dashboard/PageHeader";
import { Link } from "react-router-dom";

const integrations = [
  {
    name: "Zoom",
    description: "Zoom kayıt ve transkript dosyalarını yükleyerek AI ile analiz edin.",
    icon: Video,
    status: "active" as const,
    href: "/dashboard/record",
    hrefLabel: "Kayıt Analizi'nde Kullan",
  },
  {
    name: "Google Meet",
    description: "Google Meet transkript dosyasını yükleyin veya yapıştırarak analiz edin.",
    icon: Globe,
    status: "active" as const,
    href: "/dashboard/record",
    hrefLabel: "Kayıt Analizi'nde Kullan",
  },
  {
    name: "Microsoft Teams",
    description: "Teams toplantı kayıtlarını içe aktarın.",
    icon: Globe,
    status: "coming_soon" as const,
  },
  {
    name: "Ses Tanıma API",
    description: "Gelişmiş ses tanıma ve transkript hizmeti.",
    icon: Mic,
    status: "coming_soon" as const,
  },
];

const IntegrationsPage = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Entegrasyonlar"
        description="Dış hizmetleri bağlayarak iş akışınızı otomatikleştirin"
      />

      <div className="grid sm:grid-cols-2 gap-4">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className="rounded-xl border border-border bg-card p-5 shadow-card flex flex-col gap-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                  integration.status === "active" ? "bg-primary/10" : "bg-muted"
                }`}>
                  <integration.icon className={`h-5 w-5 ${
                    integration.status === "active" ? "text-primary" : "text-muted-foreground"
                  }`} />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold">{integration.name}</h3>
                  {integration.status === "active" && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--success))]">
                      <CheckCircle2 className="h-3 w-3" /> Aktif
                    </span>
                  )}
                  {integration.status === "coming_soon" && (
                    <span className="text-[10px] font-medium text-muted-foreground">Yakında</span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{integration.description}</p>
            {integration.status === "active" && integration.href && (
              <Link to={integration.href}>
                <Button variant="outline" size="sm" className="w-full text-xs">
                  <ArrowRight className="mr-1.5 h-3 w-3" /> {integration.hrefLabel}
                </Button>
              </Link>
            )}
            {integration.status === "coming_soon" && (
              <Button variant="outline" size="sm" className="w-full text-xs" disabled>
                Yakında
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default IntegrationsPage;
