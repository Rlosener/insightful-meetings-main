import { useState, useEffect, useRef } from "react";
import {
  Brain, Send, Loader2, AlertTriangle, CheckCircle2,
  Clock, Users, FileText, TrendingUp, Sparkles, RotateCcw,
  Briefcase, Target, RefreshCw, ArrowRight, BarChart3,
  Zap, Shield, Activity, ChevronRight, Search, Eye,
  PieChart, Lightbulb, MessageSquare, Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import ReactMarkdown from "react-markdown";

/* ── Types ── */

interface AdvisorAnswer {
  executive_summary: string;
  key_findings: string[];
  risks: string[];
  recommended_actions: string[];
  trend_observation?: string | null;
  data_basis: string;
  confidence: string;
  root_causes?: string[];
  missing_information?: string[];
  immediate_actions?: string[];
  seven_day_plan?: string[];
  thirty_day_plan?: string[];
  stakeholders?: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  answer?: AdvisorAnswer;
  sources?: string[];
  timestamp: Date;
  problemCategory?: string;
}

/* ── Problem Categories ── */

const PROBLEM_CATEGORIES = [
  {
    id: "sales_decline",
    icon: TrendingUp,
    title: "Satış ve Gelir",
    description: "Gelir düşüşü, pipeline sorunları, dönüşüm problemleri",
    prompt: "Şirketimizde satış performansı düşüyor. Toplantılar ve veriler üzerinden kök nedenleri analiz et ve aksiyon planı çıkar.",
    color: "text-destructive",
    bg: "bg-destructive/5 border-destructive/15",
  },
  {
    id: "meeting_inefficiency",
    icon: Clock,
    title: "Toplantı Verimliliği",
    description: "Düşük karar kalitesi, çözümsüz konular, zaman kaybı",
    prompt: "Toplantılarımız verimli değil. Karar kalitesi düşük, konular çözümsüz kalıyor. Toplantı verilerimizi analiz et.",
    color: "text-[hsl(var(--warning))]",
    bg: "bg-[hsl(var(--warning))]/5 border-[hsl(var(--warning))]/15",
  },
  {
    id: "hiring_slowdown",
    icon: Briefcase,
    title: "İşe Alım ve Yetenek",
    description: "Yavaş işe alım, düşük aday kalitesi, ekip açıkları",
    prompt: "İşe alım sürecimiz yavaşlıyor veya doğru adayları bulamıyoruz. Mülakat verilerini analiz et ve önerilerde bulun.",
    color: "text-accent",
    bg: "bg-accent/5 border-accent/15",
  },
  {
    id: "team_communication",
    icon: Users,
    title: "Ekip ve İletişim",
    description: "İletişim darboğazları ve ekip hizalanma sorunları",
    prompt: "Ekip içi iletişimde sorunlar var. Toplantı ve personel verileri üzerinden iletişim darboğazlarını tespit et.",
    color: "text-[hsl(var(--info))]",
    bg: "bg-[hsl(var(--info))]/5 border-[hsl(var(--info))]/15",
  },
  {
    id: "performance_drop",
    icon: Activity,
    title: "Operasyonel Performans",
    description: "Düşen KPI'lar, süreç darboğazları, kalite sorunları",
    prompt: "Operasyonel performansımız düşüyor. Süreçlerde darboğazlar ve kalite sorunları var. Veriler üzerinden analiz et.",
    color: "text-primary",
    bg: "bg-primary/5 border-primary/15",
  },
  {
    id: "management_focus",
    icon: Target,
    title: "Stratejik Odak",
    description: "Yönetim bu hafta neye odaklanmalı?",
    prompt: "Yönetim bu hafta neye odaklanmalı? Tüm şirket verilerini (toplantılar, aksiyonlar, mülakatlar, sektörel radar) tarayarak öncelikli odak alanlarını belirle.",
    color: "text-[hsl(var(--success))]",
    bg: "bg-[hsl(var(--success))]/5 border-[hsl(var(--success))]/15",
  },
];

const FOLLOW_UP_QUESTIONS = [
  "Bu sorunun kök nedenleri neler olabilir?",
  "Hangi aksiyonlar en acil uygulanmalı?",
  "Benzer sorunlar geçmişte nasıl çözüldü?",
  "Bu konuda 7 günlük bir plan öner",
  "Hangi ekip veya kişiler bu soruna dahil edilmeli?",
  "Sektörel gelişmeler bu durumu nasıl etkiliyor?",
];

/* ── Component ── */

const CompanyAdvisorPage = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const askQuestion = async (q: string, category?: string) => {
    if (!q.trim() || asking) return;
    const userMsg: ChatMessage = {
      role: "user",
      content: q.trim(),
      timestamp: new Date(),
      problemCategory: category,
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setAsking(true);
    if (category) setSelectedCategory(category);

    const chatHistory = updatedMessages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
      answer: m.answer,
    }));

    const { data, error } = await invokeEdgeFunction(EDGE_FUNCTIONS.COMPANY_ADVISOR, {
      type: "chat",
      question: q.trim(),
      chatHistory: chatHistory.slice(0, -1),
    });

    if (error) {
      toast.error(error.message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Bir hata oluştu. Lütfen tekrar deneyin.", timestamp: new Date() },
      ]);
    } else {
      const answer = data?.answer as AdvisorAnswer | string;
      const isStructured = typeof answer === "object" && answer !== null;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: isStructured ? (answer as AdvisorAnswer).executive_summary : typeof answer === "string" ? answer : "Cevap alınamadı.",
          answer: isStructured ? (answer as AdvisorAnswer) : undefined,
          sources: data?.sources_used,
          timestamp: new Date(),
        },
      ]);
    }
    setAsking(false);
  };

  const confidenceBadge = (c: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      high: { label: "Yüksek Güven", cls: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20" },
      medium: { label: "Orta Güven", cls: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20" },
      low: { label: "Düşük Güven", cls: "bg-accent/10 text-accent border-accent/20" },
    };
    const item = map[c] || { label: "Sınırlı Veri", cls: "bg-muted text-muted-foreground border-border" };
    return <Badge variant="outline" className={`text-[10px] ${item.cls}`}>{item.label}</Badge>;
  };

  const sourceLabel = (s: string) => {
    const map: Record<string, string> = {
      meetings: "Toplantılar", interviews: "Mülakatlar", actions: "Aksiyonlar",
      members: "Ekip", practices: "Pratik", profile: "Şirket Profili", sector: "Sektör Radarı",
      advisor_history: "Danışman Geçmişi",
    };
    return map[s] || s;
  };

  const showIntro = messages.length === 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-card">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">AI Şirket Danışmanı</h1>
              <p className="text-xs text-muted-foreground">Yapılandırılmış iş zekası ve karar desteği</p>
            </div>
          </div>
          {showIntro && (
            <p className="text-sm text-muted-foreground mt-4 max-w-2xl leading-relaxed">
              Bir iş problemini, hedefi veya endişeyi açıklayın. Donebird toplantı kayıtlarınızı, mülakat analizlerinizi,
              aksiyon maddelerinizi, ekip verilerinizi ve sektör gelişmelerini tarayarak uygulanabilir öneriler içeren yapılandırılmış bir teşhis üretir.
            </p>
          )}
        </div>
      </div>

      {/* Problem Category Cards - shown only when no messages */}
      {showIntro && (
        <div>
          <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Hangi iş problemini analiz etmek istiyorsunuz?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROBLEM_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => askQuestion(cat.prompt, cat.id)}
                  disabled={asking}
                  className={`text-left rounded-xl border p-5 transition-all hover:shadow-card-md hover:scale-[1.01] active:scale-[0.99] ${cat.bg} group`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-9 w-9 rounded-lg bg-background/80 flex items-center justify-center shrink-0 shadow-xs`}>
                      <Icon className={`h-4.5 w-4.5 ${cat.color}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-semibold mb-0.5">{cat.title}</h3>
                      <p className="text-[11px] text-muted-foreground leading-snug">{cat.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                    <span>Analiz Et</span>
                    <ChevronRight className="h-3 w-3" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Diagnostic Results / Chat Area */}
      {messages.length > 0 && (
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <div className="flex justify-end mb-2">
                  <div className="max-w-[80%] rounded-xl bg-primary text-primary-foreground px-5 py-3 text-sm shadow-card">
                    {msg.problemCategory && (
                      <Badge className="mb-1.5 text-[9px] bg-primary-foreground/15 text-primary-foreground border-0">
                        {PROBLEM_CATEGORIES.find((c) => c.id === msg.problemCategory)?.title || "Özel"}
                      </Badge>
                    )}
                    <p>{msg.content}</p>
                  </div>
                </div>
              ) : msg.answer ? (
                /* Structured Diagnostic Card */
                <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-border bg-muted/30">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" />
                        <span className="font-display text-sm font-semibold">AI Teşhis Raporu</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {confidenceBadge(msg.answer.confidence)}
                        {msg.sources && msg.sources.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            Kaynaklar: {msg.sources.map(sourceLabel).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Executive Summary */}
                    <div className="rounded-xl bg-primary/5 border border-primary/10 p-5">
                      <h3 className="font-display text-xs font-semibold text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" /> Yönetici Özeti
                      </h3>
                      <p className="text-sm text-foreground leading-relaxed">{msg.answer.executive_summary}</p>
                    </div>

                    {/* Key Findings + Risks side by side */}
                    <div className="grid lg:grid-cols-2 gap-4">
                      {msg.answer.key_findings?.length > 0 && (
                        <div className="rounded-xl border border-border p-5">
                          <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                            <Search className="h-3.5 w-3.5" /> Temel Bulgular
                          </h4>
                          <ul className="space-y-2">
                            {msg.answer.key_findings.map((f, j) => (
                              <li key={j} className="text-sm flex items-start gap-2">
                                <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                  <span className="text-[10px] font-bold text-primary">{j + 1}</span>
                                </div>
                                <span className="text-muted-foreground leading-relaxed">{f}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {msg.answer.risks?.length > 0 && (
                        <div className="rounded-xl border border-destructive/15 bg-destructive/5 p-5">
                          <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-destructive mb-3 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" /> Risk Sinyalleri
                          </h4>
                          <ul className="space-y-2">
                            {msg.answer.risks.map((r, j) => (
                              <li key={j} className="text-sm flex items-start gap-2">
                                <Shield className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                                <span className="text-muted-foreground leading-relaxed">{r}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Recommended Actions */}
                    {msg.answer.recommended_actions?.length > 0 && (
                      <div className="rounded-xl border border-[hsl(var(--success))]/15 bg-[hsl(var(--success))]/5 p-5">
                        <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-[hsl(var(--success))] mb-3 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Önerilen Aksiyonlar
                        </h4>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {msg.answer.recommended_actions.map((a, j) => (
                            <div key={j} className="text-sm flex items-start gap-2 rounded-lg bg-background/60 p-3 border border-[hsl(var(--success))]/10">
                              <Zap className="h-4 w-4 text-[hsl(var(--success))] shrink-0 mt-0.5" />
                              <span className="text-muted-foreground">{a}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Trend Observation */}
                    {msg.answer.trend_observation && (
                      <div className="rounded-xl bg-[hsl(var(--info))]/5 border border-[hsl(var(--info))]/15 p-4">
                        <h4 className="font-display text-xs font-semibold text-[hsl(var(--info))] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5" /> Örüntü Algılandı
                        </h4>
                        <p className="text-sm text-muted-foreground">{msg.answer.trend_observation}</p>
                      </div>
                    )}

                    {/* Data Basis */}
                    {msg.answer.data_basis && (
                      <div className="text-[11px] text-muted-foreground italic border-t border-border pt-3 flex items-center gap-1.5">
                        <Layers className="h-3 w-3" />
                        {msg.answer.data_basis}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-xl bg-muted/70 border border-border px-4 py-3 text-sm">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {asking && (
            <div className="flex justify-start">
              <div className="rounded-xl bg-muted/70 border border-border px-5 py-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <div>
                    <span className="text-sm font-medium">Şirket verileri analiz ediliyor...</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Toplantılar, mülakatlar, aksiyonlar ve sektör verileri taranıyor</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Follow-up Suggestions */}
      {messages.length > 0 && !asking && messages[messages.length - 1]?.role === "assistant" && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">İncelemeye Devam Et</p>
          <div className="flex flex-wrap gap-2">
            {FOLLOW_UP_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => askQuestion(q)}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/30 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="sticky bottom-0 rounded-2xl border border-border bg-card p-4 shadow-card-md backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-2 text-[10px] text-muted-foreground">
          <MessageSquare className="h-3 w-3" />
          <span>Bir iş problemi, soru veya hedef yazın ya da yukarıdan kategori seçin</span>
        </div>
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Örn. Son bir ayda toplantılarımızdaki karar kalitesi düşüyor..."
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                askQuestion(input);
              }
            }}
          />
          <Button onClick={() => askQuestion(input)} disabled={!input.trim() || asking} size="icon" className="shrink-0 h-11 w-11">
            {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {messages.length > 0 && (
          <div className="flex justify-end mt-2">
            <Button variant="ghost" size="sm" className="text-[11px] h-7" onClick={() => { setMessages([]); setSelectedCategory(null); }}>
              <RotateCcw className="h-3 w-3 mr-1" /> Yeni Analiz
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyAdvisorPage;
