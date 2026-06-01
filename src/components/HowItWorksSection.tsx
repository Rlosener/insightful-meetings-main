import { Upload, Cpu, FileBarChart } from "lucide-react";

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Yükleyin veya Bağlayın",
    description: "Zoom, Teams, Google Meet'ten toplantı kayıtlarını içe aktarın veya doğrudan yükleyin. Tüm popüler formatları destekliyoruz.",
  },
  {
    icon: Cpu,
    step: "02",
    title: "Yapay Zeka Analiz Eder",
    description: "Motorumuz video, ses ve transkriptleri eş zamanlı işler — ton, katılım ve içeriği değerlendirir.",
  },
  {
    icon: FileBarChart,
    step: "03",
    title: "Raporunuzu Alın",
    description: "Puanlar, özetler, aksiyon maddeleri ve işe alım önerileri içeren yapılandırılmış raporları dakikalar içinde alın.",
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="py-24 md:py-32">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Üç adımda <span className="text-gradient-primary">daha akıllı toplantılar</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Karmaşık kurulum yok. Toplantılarınızı bağlayın, gerisini yapay zekaya bırakın.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map((step, i) => (
            <div key={step.step} className="relative text-center">
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-gradient-to-r from-primary/40 to-transparent" />
              )}
              <div className="inline-flex items-center justify-center h-24 w-24 rounded-2xl bg-secondary border border-border mb-6 relative">
                <step.icon className="h-10 w-10 text-primary" />
                <span className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center font-display">
                  {step.step}
                </span>
              </div>
              <h3 className="font-display text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
