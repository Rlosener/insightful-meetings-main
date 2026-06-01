import { Button } from "@/components/ui/button";
import { ArrowRight, Bird } from "lucide-react";
import { Link } from "react-router-dom";

const CTASection = () => {
  return (
    <section id="insights" className="py-24 md:py-32 relative">
      <div className="absolute inset-0 bg-gradient-surface pointer-events-none" />
      <div className="container relative z-10">
        <div className="max-w-3xl mx-auto text-center rounded-2xl border border-primary/20 bg-card p-12 md:p-16 shadow-card relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
          <div className="relative z-10">
            <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-4">
              İşe alım sürecinizi{" "}
              <span className="text-gradient-primary">dönüştürmeye</span> hazır mısınız?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto">
              Daha akıllı, hızlı ve adil işe alım kararları için Donebird kullanan binlerce şirkete katılın.
            </p>
            <Link to="/auth">
              <Button variant="hero" size="lg" className="text-base px-10">
                Ücretsiz Başlayın — Kart Gerekmez
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

const Footer = () => {
  return (
    <footer className="border-t border-border py-12">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Bird className="h-5 w-5 text-primary" />
            <span className="font-display text-lg font-bold">Donebird</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Gizlilik</a>
            <a href="#" className="hover:text-foreground transition-colors">Kullanım Şartları</a>
            <a href="#" className="hover:text-foreground transition-colors">İletişim</a>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Donebird. Tüm hakları saklıdır.</p>
        </div>
      </div>
    </footer>
  );
};

export { CTASection, Footer };
