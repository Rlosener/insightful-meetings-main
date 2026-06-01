import {
  Mic, PauseCircle, Gauge, Zap, MessageCircle, AlertTriangle,
  TrendingUp, Volume2, Brain,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SpeechInsight {
  icon: typeof Mic;
  title: string;
  description: string;
  severity: "info" | "warning" | "success";
}

interface Props {
  analysisData: any;
  className?: string;
}

const severityStyles = {
  warning: {
    border: "border-[hsl(var(--warning))]/20",
    bg: "bg-[hsl(var(--warning))]/5",
    iconBg: "bg-[hsl(var(--warning))]/10",
    iconColor: "text-[hsl(var(--warning))]",
  },
  info: {
    border: "border-[hsl(var(--info))]/20",
    bg: "bg-[hsl(var(--info))]/5",
    iconBg: "bg-[hsl(var(--info))]/10",
    iconColor: "text-[hsl(var(--info))]",
  },
  success: {
    border: "border-[hsl(var(--success))]/20",
    bg: "bg-[hsl(var(--success))]/5",
    iconBg: "bg-[hsl(var(--success))]/10",
    iconColor: "text-[hsl(var(--success))]",
  },
};

function generateSpeechInsights(a: any): SpeechInsight[] {
  const insights: SpeechInsight[] = [];
  if (!a) return insights;

  // From speech_insights field (AI-generated)
  if (a.speech_insights?.length) {
    return a.speech_insights.map((si: any) => ({
      icon: si.type === "filler" ? MessageCircle
        : si.type === "hesitation" ? PauseCircle
        : si.type === "speed" ? Gauge
        : si.type === "emphasis" ? Volume2
        : Brain,
      title: si.title,
      description: si.description,
      severity: si.severity || "info",
    }));
  }

  // Fallback: generate from voice_analysis data
  const va = a.voice_analysis;
  if (!va) return insights;

  // Filler words
  if (va.filler_words_usage === "high") {
    insights.push({
      icon: MessageCircle,
      title: "Sık dolgu kelime kullanımı tespit edildi",
      description: va.filler_words_description || "AI gözlemlerine göre, konuşmalarda dolgu kelime kullanımı beklenenin üzerinde. Bu durum, hazırlıksız konuşma veya düşünce toparlaması olarak yorumlanabilir.",
      severity: "warning",
    });
  } else if (va.filler_words_usage === "low") {
    insights.push({
      icon: MessageCircle,
      title: "Düşük dolgu kelime kullanımı",
      description: va.filler_words_description || "Konuşmalarda dolgu kelime kullanımı minimum düzeyde. Bu, hazırlıklı ve özgüvenli bir iletişim tarzına işaret edebilir.",
      severity: "success",
    });
  }

  // Hesitation
  if (va.hesitation_level === "high") {
    insights.push({
      icon: PauseCircle,
      title: "Belirgin tereddüt kalıpları gözlemlendi",
      description: va.hesitation_description || "Yanıtlar arasında sık duraksamalar ve tereddüt sinyalleri algılandı. Bu durum, konuya hâkimiyet eksikliği veya stres göstergesi olabilir.",
      severity: "warning",
    });
  } else if (va.hesitation_level === "low") {
    insights.push({
      icon: PauseCircle,
      title: "Akıcı ve tutarlı konuşma",
      description: va.hesitation_description || "Minimum tereddüt ile akıcı konuşma gözlemlendi. Bu, konuya hâkimiyet ve özgüveni yansıtıyor olabilir.",
      severity: "success",
    });
  }

  // Speech speed
  if (va.speech_speed === "fast") {
    insights.push({
      icon: Gauge,
      title: "Hızlı konuşma hızı tespit edildi",
      description: va.speech_speed_description || "Konuşma hızı ortalamanın üzerinde. Bu durum heyecan, zaman baskısı hissi veya konuya hâkimiyetten kaynaklanıyor olabilir.",
      severity: "warning",
    });
  } else if (va.speech_speed === "slow") {
    insights.push({
      icon: Gauge,
      title: "Yavaş ve ölçülü konuşma",
      description: va.speech_speed_description || "Konuşma hızı ortalamanın altında. Bu, düşünceli ve dikkatli bir iletişim tarzını yansıtıyor olabilir.",
      severity: "info",
    });
  }

  // Energy
  if (va.energy_level === "high") {
    insights.push({
      icon: Zap,
      title: "Yüksek enerji seviyesi",
      description: va.energy_description || "Konuşmalarda yüksek enerji ve coşku gözlemlendi. Bu, konuya olan ilgi ve motivasyonu yansıtıyor olabilir.",
      severity: "success",
    });
  } else if (va.energy_level === "low") {
    insights.push({
      icon: Zap,
      title: "Düşük enerji seviyesi gözlemlendi",
      description: va.energy_description || "Konuşmalarda düşük enerji ve monoton ton algılandı. Bu, yorgunluk, ilgisizlik veya doğal konuşma tarzı olabilir.",
      severity: "warning",
    });
  }

  // Tone
  if (va.tone === "confident") {
    insights.push({
      icon: Volume2,
      title: "Güvenli ses tonu",
      description: va.tone_description || "Konuşma tonu güven ve kararlılık sinyalleri içeriyor. Bu, konuya hâkimiyet ve profesyonel duruş göstergesi olabilir.",
      severity: "success",
    });
  } else if (va.tone === "nervous") {
    insights.push({
      icon: Volume2,
      title: "Gergin ses tonu tespit edildi",
      description: va.tone_description || "Ses tonunda gerginlik sinyalleri algılandı. Bu, stres, hazırlıksızlık veya doğal heyecan göstergesi olabilir.",
      severity: "warning",
    });
  }

  return insights;
}

const SpeechInsightsSection = ({ analysisData, className = "" }: Props) => {
  const insights = generateSpeechInsights(analysisData);

  if (insights.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {insights.map((insight, i) => {
        const style = severityStyles[insight.severity] || severityStyles.info;
        const Icon = insight.icon;
        return (
          <div key={i} className={`rounded-xl border ${style.border} ${style.bg} p-4 flex items-start gap-3 transition-all hover:shadow-sm`}>
            <div className={`h-9 w-9 rounded-lg ${style.iconBg} flex items-center justify-center shrink-0`}>
              <Icon className={`h-4 w-4 ${style.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold mb-0.5">{insight.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SpeechInsightsSection;
