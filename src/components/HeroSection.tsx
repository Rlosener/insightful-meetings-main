import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "react-router-dom";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />

      <div className="container relative z-10 py-24 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 mb-8 animate-fade-up">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
            <span className="text-xs font-medium text-primary">Yapay Zeka Destekli Toplantı Zekası</span>
          </div>

          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            Her toplantıyı{" "}
            <span className="text-gradient-primary">aksiyona dönüştürün</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            Donebird, video toplantılarını ve mülakatları bilgisayarlı görü, konuşma analizi ve yapay zeka ile analiz ederek içgörüler, raporlar ve işe alım önerileri üretir.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: "0.3s" }}>
            <Link to="/auth">
              <Button variant="hero" size="lg" className="text-base px-8">
                Ücretsiz Deneyin
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Button variant="hero-outline" size="lg" className="text-base px-8">
              <Play className="mr-1 h-4 w-4" />
              Demo İzleyin
            </Button>
          </div>

          <div className="mt-20 grid grid-cols-3 gap-8 max-w-lg mx-auto animate-fade-up" style={{ animationDelay: "0.4s" }}>
            {[
              { value: "10K+", label: "Analiz Edilen Toplantı" },
              { value: "%94", label: "Doğruluk Oranı" },
              { value: "3dk", label: "Ort. Rapor Süresi" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-display text-2xl md:text-3xl font-bold text-gradient-primary">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
