import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invokeEdgeFunction } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CoachChatProps {
  context: {
    practiceCount: number;
    trainingCount?: number;
    lastScore: number;
    avgScore: number;
    avgComm: number;
    avgConf: number;
    avgTrainingScore?: number;
    recentTrainingScore?: number | null;
    recentTrainingGoal?: any;
    weaknesses: string[];
    strengths: string[];
    patterns?: string[];
  };
}

const quickPrompts = [
  "En büyük sorunum ne?",
  "Cevaplarımı nasıl geliştirebilirim?",
  "Eğitim sonuçlarımı değerlendir",
  "Bir haftalık plan ver",
];

const CoachChat = ({ context }: CoachChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.CAREER_COACH_CHAT, {
        message: text.trim(), context,
      });
      if (result.error) throw new Error(result.error.message);
      setMessages((prev) => [...prev, { role: "assistant", content: result.data.reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Bir hata oluştu, lütfen tekrar deneyin." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-card flex flex-col" style={{ height: 480 }}>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-display text-sm font-bold">🧠 AI Koç ile Sohbet</h3>
        <p className="text-[11px] text-muted-foreground">Sert, dürüst ve kişisel geri bildirim alın</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2 pt-4">
            <p className="text-xs text-muted-foreground text-center mb-3">Hızlı sorulardan birini seçin veya kendi sorunuzu yazın</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {quickPrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => send(p)}
                  className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted px-3 py-2 rounded-xl rounded-bl-sm">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Sorunuzu yazın..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          disabled={loading}
        />
        <Button size="sm" variant="ghost" onClick={() => send(input)} disabled={!input.trim() || loading}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default CoachChat;
