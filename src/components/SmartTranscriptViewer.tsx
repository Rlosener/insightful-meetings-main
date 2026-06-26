import { useState, useMemo, useRef } from "react";
import {
  Search, ChevronDown, ChevronRight, Clock, User,
  AlertTriangle, Star, CheckCircle2, MessageSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Common filler words in Turkish and English
const FILLER_WORDS = [
  "şey", "yani", "hani", "işte", "aslında", "mesela", "bir nevi", "ee", "eee",
  "um", "uh", "like", "you know", "basically", "actually", "so", "well",
  "bir bakıma", "diyelim ki", "nasıl desem", "şöyle ki",
];

const DECISION_KEYWORDS = [
  "karar", "kabul", "onay", "yapılacak", "belirlen", "sonuç",
  "decide", "agreed", "approved", "conclusion", "action",
];

const IMPORTANT_KEYWORDS = [
  "önemli", "kritik", "acil", "mutlaka", "kesinlikle", "öncelik",
  "important", "critical", "urgent", "must", "priority", "key",
];

interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp?: string;
  index: number;
}

function parseTranscript(raw: string): TranscriptSegment[] {
  if (!raw?.trim()) return [];

  const lines = raw.split("\n").filter(l => l.trim());
  const segments: TranscriptSegment[] = [];
  let currentSpeaker = "";
  let currentText = "";
  let currentTimestamp = "";
  let idx = 0;

  for (const line of lines) {
    // Match patterns like "[Speaker 1]:", "Speaker 1:", "[00:01:23] Speaker:", etc.
    const speakerMatch = line.match(/^(?:\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*)?(?:\[?([^:[\]]+?)\]?\s*:\s*)(.+)/);

    if (speakerMatch) {
      // Save previous segment
      if (currentSpeaker && currentText.trim()) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim(), timestamp: currentTimestamp || undefined, index: idx++ });
      }
      currentTimestamp = speakerMatch[1] || "";
      currentSpeaker = speakerMatch[2].trim();
      currentText = speakerMatch[3];
    } else {
      // Continuation of current speaker
      if (currentSpeaker) {
        currentText += " " + line.trim();
      } else {
        // No speaker detected, use "Konuşmacı"
        currentSpeaker = "Konuşmacı";
        currentText += (currentText ? " " : "") + line.trim();
      }
    }
  }

  // Push last segment
  if (currentSpeaker && currentText.trim()) {
    segments.push({ speaker: currentSpeaker, text: currentText.trim(), timestamp: currentTimestamp || undefined, index: idx });
  }

  // If nothing parsed with speakers, split by sentences
  if (segments.length === 0 && raw.trim()) {
    segments.push({ speaker: "Konuşmacı", text: raw.trim(), index: 0 });
  }

  return segments;
}

function highlightText(text: string, searchQuery: string) {
  const parts: { text: string; type: "normal" | "filler" | "important" | "decision" | "search" }[] = [];

  // Build a combined regex
  const fillerPattern = FILLER_WORDS.map(w => `\\b${w}\\b`).join("|");
  const decisionPattern = DECISION_KEYWORDS.map(w => w).join("|");
  const importantPattern = IMPORTANT_KEYWORDS.map(w => w).join("|");

  const patterns: { regex: RegExp; type: "filler" | "important" | "decision" | "search" }[] = [];

  if (searchQuery.trim()) {
    patterns.push({ regex: new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi"), type: "search" });
  }
  patterns.push({ regex: new RegExp(`(${fillerPattern})`, "gi"), type: "filler" });
  patterns.push({ regex: new RegExp(`(${importantPattern})`, "gi"), type: "important" });
  patterns.push({ regex: new RegExp(`(${decisionPattern})`, "gi"), type: "decision" });

  // Simple approach: split by all patterns
  const remaining = text;
  const allPattern = patterns.map(p => p.regex.source).join("|");
  if (!allPattern) return [{ text, type: "normal" as const }];

  const combinedRegex = new RegExp(`(${allPattern})`, "gi");
  const splitParts = remaining.split(combinedRegex).filter(Boolean);

  return splitParts.map(part => {
    const lower = part.toLowerCase();
    if (searchQuery && lower.includes(searchQuery.toLowerCase())) return { text: part, type: "search" as const };
    if (FILLER_WORDS.some(f => lower === f.toLowerCase())) return { text: part, type: "filler" as const };
    if (IMPORTANT_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) return { text: part, type: "important" as const };
    if (DECISION_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) return { text: part, type: "decision" as const };
    return { text: part, type: "normal" as const };
  });
}

const highlightStyles = {
  normal: "",
  filler: "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] rounded px-0.5 font-medium",
  important: "bg-primary/15 text-primary rounded px-0.5 font-medium",
  decision: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] rounded px-0.5 font-medium",
  search: "bg-accent/30 text-accent-foreground rounded px-0.5 font-bold",
};

// Generate speaker colors deterministically
const SPEAKER_COLORS = [
  "bg-primary/10 text-primary",
  "bg-accent/10 text-accent",
  "bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]",
  "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  "bg-destructive/10 text-destructive",
];

interface Props {
  transcript: string;
  className?: string;
}

const SmartTranscriptViewer = ({ transcript, className = "" }: Props) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSpeakers, setCollapsedSpeakers] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(() => parseTranscript(transcript), [transcript]);

  const speakers = useMemo(() => {
    const set = new Set<string>();
    segments.forEach(s => set.add(s.speaker));
    return Array.from(set);
  }, [segments]);

  const speakerColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    speakers.forEach((s, i) => { map[s] = SPEAKER_COLORS[i % SPEAKER_COLORS.length]; });
    return map;
  }, [speakers]);

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    return segments.filter(s =>
      s.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.speaker.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [segments, searchQuery]);

  const fillerCount = useMemo(() => {
    let count = 0;
    const pattern = new RegExp(`\\b(${FILLER_WORDS.join("|")})\\b`, "gi");
    segments.forEach(s => { const matches = s.text.match(pattern); if (matches) count += matches.length; });
    return count;
  }, [segments]);

  const toggleSpeaker = (speaker: string) => {
    setCollapsedSpeakers(prev => {
      const next = new Set(prev);
      if (next.has(speaker)) {
        next.delete(speaker);
      } else {
        next.add(speaker);
      }
      return next;
    });
  };

  if (!transcript?.trim()) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-40" />
        <p className="text-xs">Transkript bulunamadı</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search + Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Transkriptte ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Badge variant="outline" className="text-[9px] gap-1">
            <User className="h-2.5 w-2.5" /> {speakers.length} konuşmacı
          </Badge>
          <Badge variant="outline" className="text-[9px] gap-1">
            <MessageSquare className="h-2.5 w-2.5" /> {segments.length} bölüm
          </Badge>
          {fillerCount > 0 && (
            <Badge variant="outline" className="text-[9px] gap-1 border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]">
              <AlertTriangle className="h-2.5 w-2.5" /> {fillerCount} dolgu kelime
            </Badge>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[hsl(var(--warning))]/30" /> Dolgu kelime</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/20" /> Önemli ifade</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[hsl(var(--success))]/20" /> Karar</span>
      </div>

      {/* Speaker filter/collapse */}
      {speakers.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {speakers.map(speaker => (
            <button
              key={speaker}
              onClick={() => toggleSpeaker(speaker)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                collapsedSpeakers.has(speaker) ? "opacity-40 border-border" : `border-transparent ${speakerColorMap[speaker]}`
              }`}
            >
              {collapsedSpeakers.has(speaker) ? <ChevronRight className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
              {speaker}
            </button>
          ))}
        </div>
      )}

      {/* Transcript segments */}
      <div ref={containerRef} className="max-h-[60vh] overflow-y-auto space-y-1 rounded-lg bg-muted/20 p-3 border border-border">
        {filteredSegments.map((seg) => {
          if (collapsedSpeakers.has(seg.speaker)) return null;

          const highlighted = highlightText(seg.text, searchQuery);
          const colorCls = speakerColorMap[seg.speaker] || SPEAKER_COLORS[0];

          return (
            <div key={seg.index} className="flex gap-3 py-2 px-2 rounded-lg hover:bg-muted/40 transition-colors group">
              {/* Speaker label */}
              <div className="shrink-0 w-24">
                <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${colorCls}`}>
                  <User className="h-2.5 w-2.5" />
                  <span className="truncate max-w-[70px]">{seg.speaker}</span>
                </div>
                {seg.timestamp && (
                  <div className="flex items-center gap-0.5 mt-0.5 text-[9px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" /> {seg.timestamp}
                  </div>
                )}
              </div>

              {/* Text */}
              <p className="flex-1 text-sm text-muted-foreground leading-relaxed">
                {highlighted.map((part, i) => (
                  <span key={i} className={highlightStyles[part.type]}>{part.text}</span>
                ))}
              </p>
            </div>
          );
        })}

        {filteredSegments.length === 0 && searchQuery && (
          <div className="text-center py-6 text-muted-foreground text-xs">
            "{searchQuery}" için sonuç bulunamadı
          </div>
        )}
      </div>
    </div>
  );
};

export default SmartTranscriptViewer;
