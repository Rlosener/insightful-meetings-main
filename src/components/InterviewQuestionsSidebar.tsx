import { useState } from "react";
import { InterviewQuestion } from "@/types/recording";
import { ChevronLeft, ChevronRight, Lightbulb, CheckCircle2 } from "lucide-react";

interface Props {
  questions: InterviewQuestion[];
  isRecording: boolean;
}

const InterviewQuestionsSidebar = ({ questions, isRecording }: Props) => {
  const [collapsed, setCollapsed] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [askedQuestions, setAskedQuestions] = useState<Set<number>>(new Set());

  const toggleAsked = (idx: number) => {
    setAskedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Group by category
  const grouped = questions.reduce<Record<string, { question: string; globalIdx: number }[]>>((acc, q, i) => {
    if (!acc[q.category]) acc[q.category] = [];
    acc[q.category].push({ question: q.question, globalIdx: i });
    return acc;
  }, {});

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute top-4 right-4 z-20 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-2 hover:bg-muted transition-colors"
        title="Soruları göster"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="absolute top-0 right-0 bottom-0 z-20 w-80 bg-card/95 backdrop-blur-md border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold">Mülakat Soruları</span>
          <span className="text-xs text-muted-foreground">
            ({askedQuestions.size}/{questions.length})
          </span>
        </div>
        <button onClick={() => setCollapsed(true)} className="hover:bg-muted rounded p-1 transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${questions.length > 0 ? (askedQuestions.size / questions.length) * 100 : 0}%` }}
        />
      </div>

      {/* Questions list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{category}</p>
            <div className="space-y-1">
              {items.map(({ question, globalIdx }) => (
                <button
                  key={globalIdx}
                  onClick={() => {
                    toggleAsked(globalIdx);
                    setCurrentIdx(globalIdx);
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2 text-xs transition-all duration-200 flex items-start gap-2 ${
                    askedQuestions.has(globalIdx)
                      ? "bg-primary/10 text-muted-foreground line-through opacity-60"
                      : currentIdx === globalIdx
                        ? "bg-accent/10 text-foreground border border-accent/30"
                        : "hover:bg-muted/50 text-foreground"
                  }`}
                >
                  {askedQuestions.has(globalIdx) ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0 mt-0.5" />
                  )}
                  <span>{question}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Current question highlight */}
      {isRecording && !askedQuestions.has(currentIdx) && (
        <div className="border-t border-border p-3 bg-accent/5">
          <p className="text-[10px] font-bold text-accent uppercase mb-1">Şu anki soru</p>
          <p className="text-xs text-foreground">{questions[currentIdx]?.question}</p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
              disabled={currentIdx === 0}
              className="text-[10px] px-2 py-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-30 transition-colors"
            >
              ← Önceki
            </button>
            <button
              onClick={() => {
                toggleAsked(currentIdx);
                setCurrentIdx(Math.min(questions.length - 1, currentIdx + 1));
              }}
              className="text-[10px] px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors flex-1"
            >
              Soruldu ✓
            </button>
            <button
              onClick={() => setCurrentIdx(Math.min(questions.length - 1, currentIdx + 1))}
              disabled={currentIdx === questions.length - 1}
              className="text-[10px] px-2 py-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-30 transition-colors"
            >
              Sonraki →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewQuestionsSidebar;
