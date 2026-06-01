import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp: number;
}

interface TranscriptViewerProps {
  entries?: TranscriptEntry[];
  transcript?: string;
  className?: string;
  title?: string;
  description?: string;
  emptyMessage?: string;
  heightClassName?: string;
  statusLabel?: string;
  providerLabel?: string;
  warnings?: string[];
}

const SPEAKER_COLORS = [
  "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "bg-green-500/10 text-green-600 border-green-500/20",
  "bg-purple-500/10 text-purple-600 border-purple-500/20",
  "bg-orange-500/10 text-orange-600 border-orange-500/20",
  "bg-pink-500/10 text-pink-600 border-pink-500/20",
  "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
];

export function TranscriptViewer({
  entries = [],
  transcript = "",
  className = "",
  title = "Konuşma Transkripti",
  description = "Her konuşmacı farklı renkle işaretlenmiştir",
  emptyMessage = "Henüz transkript bulunmuyor. Kayıt başladığında konuşmalar burada görünecek.",
  heightClassName = "h-[400px]",
  statusLabel,
  providerLabel,
  warnings = [],
}: TranscriptViewerProps) {
  const speakerColorMap = new Map<string, string>();
  let colorIndex = 0;
  const rawSegments = transcript
    .trim()
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const getSpeakerColor = (speaker: string) => {
    if (!speakerColorMap.has(speaker)) {
      speakerColorMap.set(speaker, SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length]);
      colorIndex++;
    }
    return speakerColorMap.get(speaker);
  };

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const copyTranscript = async () => {
    const text = transcript.trim() || entries.map((entry) => `[${entry.speaker} • ${formatTimestamp(entry.timestamp)}]\n${entry.text}`).join("\n\n");
    if (!text.trim()) {
      toast.error("Kopyalanacak transkript yok.");
      return;
    }
    await navigator.clipboard.writeText(text);
    toast.success("Transkript kopyalandı");
  };

  const header = (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 className="font-display text-lg font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {statusLabel && <Badge variant="outline">{statusLabel}</Badge>}
          {providerLabel && <Badge variant="secondary">{providerLabel}</Badge>}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={copyTranscript} disabled={entries.length === 0 && rawSegments.length === 0}>
        <Copy className="h-4 w-4" /> Kopyala
      </Button>
    </div>
  );

  if (entries.length === 0 && rawSegments.length === 0) {
    return (
      <Card className={`p-6 ${className}`}>
        {header}
        <p className="text-sm text-muted-foreground text-center">
          {emptyMessage}
        </p>
        {warnings.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-muted/25 p-3 text-xs text-muted-foreground">
            {warnings.slice(0, 3).map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className={`p-6 ${className}`}>
      {header}
      {warnings.length > 0 && (
        <div className="mb-3 rounded-lg border border-border bg-muted/25 p-3 text-xs text-muted-foreground">
          {warnings.slice(0, 4).map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
      
      <ScrollArea className={`${heightClassName} pr-4`}>
        <div className="space-y-4">
          {entries.length > 0
            ? entries.map((entry, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`${getSpeakerColor(entry.speaker)} font-medium`}
                  >
                    {entry.speaker}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed pl-4 border-l-2 border-border">
                  {entry.text}
                </p>
              </div>
            ))
            : rawSegments.map((segment, index) => {
              const speakerMatch = segment.match(/^\[([^\]]+)\]\s*:?\s*([\s\S]*)$/);
              const speaker = speakerMatch?.[1];
              const text = speakerMatch?.[2]?.trim() || segment;
              return (
                <div key={index} className="space-y-2">
                  {speaker && (
                    <Badge
                      variant="outline"
                      className={`${getSpeakerColor(speaker)} font-medium`}
                    >
                      {speaker}
                    </Badge>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed pl-4 border-l-2 border-border">
                    {text}
                  </p>
                </div>
              );
            })}
        </div>
      </ScrollArea>
    </Card>
  );
}
