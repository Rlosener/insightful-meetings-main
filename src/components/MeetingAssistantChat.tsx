import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { SUPABASE_URL, SUPABASE_ANON_KEY, EDGE_FUNCTIONS } from "@/config/api";

type Message = { role: "user" | "assistant"; content: string };

interface MeetingAssistantChatProps {
  transcript: string;
  meetingContext?: {
    topic?: string;
    agenda?: string;
    participants?: string[];
  };
  isRecording: boolean;
}

const CHAT_URL = `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTIONS.MEETING_ASSISTANT}`;

const MeetingAssistantChat = ({ transcript, meetingContext, isRecording }: MeetingAssistantChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [autoSuggested, setAutoSuggested] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTranscriptRef = useRef("");

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-suggest when enough new transcript content arrives
  useEffect(() => {
    if (!isRecording || !transcript) return;
    
    const newContent = transcript.slice(lastTranscriptRef.current.length);
    // Trigger auto-suggestion every ~100 chars of new content
    if (newContent.length > 100 && !isLoading && !autoSuggested) {
      lastTranscriptRef.current = transcript;
      setAutoSuggested(true);
      
      const autoMsg: Message = {
        role: "user",
        content: `Şu ana kadarki toplantı transkripti:\n\n"${transcript.slice(-500)}"\n\nBu konuşma akışına göre anlık önerilerini ver. Eksik kalan noktalar, sorulabilecek sorular veya dikkat edilmesi gereken konular neler?`
      };
      
      streamChat([...messages, autoMsg], autoMsg);
      
      // Reset auto suggest after 30 seconds
      setTimeout(() => setAutoSuggested(false), 30000);
    }
  }, [transcript, isRecording]);

  const streamChat = async (allMessages: Message[], newUserMsg: Message) => {
    setMessages(prev => {
      const hasMsg = prev.find(m => m.content === newUserMsg.content && m.role === "user");
      return hasMsg ? prev : [...prev, newUserMsg];
    });
    setIsLoading(true);

    let assistantSoFar = "";
    
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          messages: allMessages.map(m => ({ role: m.role, content: m.content })),
          meetingContext,
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          setMessages(prev => [...prev, { role: "assistant", content: "⚠️ İstek limiti aşıldı, lütfen biraz bekleyin." }]);
        } else if (resp.status === 402) {
          setMessages(prev => [...prev, { role: "assistant", content: "⚠️ AI kredisi tükendi." }]);
        }
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && !last.content.startsWith("⚠️")) {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error("Chat error:", e);
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Bir hata oluştu, tekrar deneyin." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    
    const contextPrefix = transcript 
      ? `[Şu ana kadarki transkript özeti: "${transcript.slice(-300)}"]\n\nKullanıcı sorusu: ` 
      : "";
    
    const userMsg: Message = { role: "user", content: input.trim() };
    const fullMsg: Message = { role: "user", content: contextPrefix + input.trim() };
    
    setInput("");
    streamChat([...messages, fullMsg], userMsg);
  };

  const quickActions = [
    "Bu konuda ne önerirsin?",
    "Eksik kalan noktalar neler?",
    "Bir sonraki adım ne olmalı?",
    "Karar alınması gereken konular neler?",
  ];

  const handleQuickAction = (action: string) => {
    const contextPrefix = transcript 
      ? `[Şu ana kadarki transkript: "${transcript.slice(-500)}"]\n\nSoru: ` 
      : "";
    
    const userMsg: Message = { role: "user", content: action };
    const fullMsg: Message = { role: "user", content: contextPrefix + action };
    
    streamChat([...messages, fullMsg], userMsg);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-card flex flex-col h-[500px]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-accent" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold">AI Toplantı Asistanı</h3>
          <p className="text-[10px] text-muted-foreground">Anlık öneriler ve destek</p>
        </div>
        {isRecording && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium animate-pulse">
            Canlı
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <Bot className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
            <p className="text-sm text-muted-foreground">
              Toplantı sırasında size yardımcı olmaya hazırım. Sorularınızı sorun veya önerilerimi takip edin.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {quickActions.map((action) => (
                <button
                  key={action}
                  onClick={() => handleQuickAction(action)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-6 w-6 rounded-md bg-accent/10 flex items-center justify-center shrink-0 mt-1">
                <Bot className="h-3 w-3 text-accent" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              msg.role === "user" 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted/50 text-foreground"
            }`}>
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:m-0 [&_ul]:my-1 [&_li]:my-0">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
            {msg.role === "user" && (
              <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <User className="h-3 w-3 text-primary" />
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-2 items-center">
            <div className="h-6 w-6 rounded-md bg-accent/10 flex items-center justify-center">
              <Bot className="h-3 w-3 text-accent" />
            </div>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Quick actions when there are messages */}
      {messages.length > 0 && !isLoading && (
        <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
          {quickActions.slice(0, 2).map((action) => (
            <button
              key={action}
              onClick={() => handleQuickAction(action)}
              className="text-[10px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              {action}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Toplantı hakkında soru sor..."
            className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
            disabled={isLoading}
          />
          <Button size="sm" onClick={handleSend} disabled={isLoading || !input.trim()} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MeetingAssistantChat;
