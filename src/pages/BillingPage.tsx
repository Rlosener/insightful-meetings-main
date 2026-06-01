import { CreditCard, Zap, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/dashboard/PageHeader";

const plans = [
  {
    name: "Ücretsiz",
    price: "₺0",
    period: "/ay",
    description: "Bireysel kullanıcılar için",
    features: ["5 toplantı kaydı/ay", "Temel AI analizi", "1 kullanıcı", "E-posta destek"],
    current: true,
  },
  {
    name: "Pro",
    price: "₺299",
    period: "/ay",
    description: "Büyüyen ekipler için",
    features: ["Sınırsız toplantı kaydı", "Gelişmiş AI analizi", "5 kullanıcı", "Zoom entegrasyonu", "Öncelikli destek", "PDF rapor dışa aktarma"],
    recommended: true,
  },
  {
    name: "Enterprise",
    price: "Özel",
    period: "",
    description: "Büyük organizasyonlar için",
    features: ["Her şey Pro'da dahil", "Sınırsız kullanıcı", "SSO / SAML", "API erişimi", "Özel entegrasyonlar", "SLA garantisi"],
  },
];

const BillingPage = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Faturalandırma"
        description="Plan ve abonelik yönetimi"
      />

      {/* Current plan */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold">Mevcut Plan: Ücretsiz</h3>
              <p className="text-xs text-muted-foreground">5 toplantı kaydı hakkınız kalmıştır</p>
            </div>
          </div>
          <Button size="sm" className="text-xs">
            <ArrowRight className="mr-1.5 h-3 w-3" /> Yükselt
          </Button>
        </div>
      </div>

      {/* Plans */}
      <div className="grid sm:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-xl border p-5 flex flex-col ${
              plan.recommended
                ? "border-primary bg-primary/[0.02] shadow-glow"
                : "border-border bg-card shadow-card"
            }`}
          >
            {plan.recommended && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary mb-3">Önerilen</span>
            )}
            <h3 className="font-display text-lg font-bold">{plan.name}</h3>
            <div className="flex items-baseline gap-0.5 mt-1 mb-1">
              <span className="font-display text-2xl font-bold">{plan.price}</span>
              <span className="text-xs text-muted-foreground">{plan.period}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{plan.description}</p>

            <ul className="space-y-2 flex-1 mb-5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Button
              variant={plan.current ? "outline" : plan.recommended ? "default" : "outline"}
              size="sm"
              className="w-full text-xs"
              disabled={plan.current}
            >
              {plan.current ? "Mevcut Plan" : plan.name === "Enterprise" ? "İletişime Geç" : "Yükselt"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BillingPage;
