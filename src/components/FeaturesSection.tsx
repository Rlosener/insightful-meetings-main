import { Video, Brain, FileText, Users, BarChart3, Shield } from "lucide-react";

const features = [
  {
    icon: Video,
    title: "Mülakat Analizi",
    description: "Adayları beden dili, konuşma kalıpları ve iletişim becerileri üzerinden yapay zeka ile değerlendirin.",
  },
  {
    icon: Brain,
    title: "Yapay Zeka İçgörü Motoru",
    description: "Gelişmiş bilgisayarlı görü ve doğal dil işleme ile her toplantıdan kilit anları, duygu durumunu ve katılım metriklerini çıkarır.",
  },
  {
    icon: FileText,
    title: "Akıllı Özetler",
    description: "Aksiyon maddeleri, kararlar ve önemli çıkarımlarla otomatik oluşturulan toplantı özetleri — dakikalar içinde hazır.",
  },
  {
    icon: Users,
    title: "Liderlik Değerlendirmesi",
    description: "Yapılandırılmış puanlama ve kıyaslama çerçeveleriyle iletişim ve liderlik becerilerini değerlendirin.",
  },
  {
    icon: BarChart3,
    title: "İK Analiz Paneli",
    description: "İşe alım kalıplarını, ekip dinamiklerini ve toplantı etkinliğini kapsamlı analizlerle takip edin.",
  },
  {
    icon: Shield,
    title: "Uyumluluk ve Gizlilik",
    description: "KVKK uyumlu, kurumsal düzeyde şifreleme. Verileriniz her zaman gizli ve güvende kalır.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-24 md:py-32 relative">
      <div className="absolute inset-0 bg-gradient-surface pointer-events-none" />
      <div className="container relative z-10">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Toplantılarınızı <span className="text-gradient-accent">anlamak</span> için ihtiyacınız olan her şey
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Aday mülakatlarından ekip toplantılarına kadar, Donebird size derin ve uygulanabilir içgörüler sunar.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-xl border border-border bg-card p-8 shadow-card hover:border-primary/30 transition-all duration-300"
            >
              <div className="mb-5 inline-flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 text-primary group-hover:shadow-glow transition-shadow duration-300">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
