import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Upload, FileVideo, X, CheckCircle2, AlertCircle, RotateCcw,
  Loader2, CloudUpload, Trash2, Brain, Sparkles,
  HelpCircle, Volume2, Plus, Eye, Mic, ScanEye, FileText, BarChart3,
  Music, FileType, ArrowRight, ArrowLeft, Briefcase, Users, UserCheck,
  Target, ClipboardList, Star, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractBiveyosSignals } from "@/types/biveyos";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { extractFramesFromVideo } from "@/lib/videoProcessing";
import { extractAudioFromVideo, needsAudioExtraction } from "@/lib/audioExtraction";
import { formatTranscriptionFailure, type TranscriptionInvokePayload } from "@/features/transcription/services/transcriptionErrors";

// ── Types ──────────────────────────────────────────────────────────────
type FileState = "queued" | "uploading" | "analyzing" | "completed" | "failed" | "server_processing";

type ErrorType =
  | "unsupported_format" | "file_too_large" | "corrupted_video"
  | "no_audio" | "transcription_failed" | "ai_processing_failed"
  | "upload_failed" | "db_failed" | "auth_failed" | "network_error" | "unknown";

type PipelineStep = "upload" | "audio" | "transcription" | "chunking" | "merging" | "voice" | "visual" | "interpretation" | "report";

type SourceType = "upload_video" | "upload_audio" | "upload_transcript";

type UploadPhase = "setup" | "files" | "processing";

// ── Setup Context Types ──────────────────────────────────────────────
interface InterviewSetupContext {
  position: string;
  department: string;
  seniorityLevel: string;
  interviewNotes: string;
  candidateName: string;
  candidateSummary: string;
  focusCompetencies: string[];
  evaluationCriteria: string[];
  customQuestions: string[];
}

interface MeetingSetupContext {
  meetingTopic: string;
  agenda: string;
  participants: string[];
  meetingPurpose: string;
  expectedOutcomes: string;
  decisionTopics: string;
  additionalNotes: string;
}

type SetupContext = 
  | { type: "mülakat"; data: InterviewSetupContext }
  | { type: "toplantı"; data: MeetingSetupContext };

type QueueItem = {
  id: string;
  file: File;
  title: string;
  type: "toplantı" | "mülakat";
  behavioralAnalysis: boolean;
  state: FileState;
  progress: number;
  pipelineStep: PipelineStep;
  errorType: ErrorType;
  failedStep: string | null;
  recordingId: string | null;
  sourceType: SourceType;
};

// ── Constants ──────────────────────────────────────────────────────────
const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "webm", "avi"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a"];
const TRANSCRIPT_EXTENSIONS = ["txt", "vtt"];
const ALL_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...TRANSCRIPT_EXTENSIONS];
const ACCEPTED_FORMATS = ALL_EXTENSIONS.map(e => `.${e}`).join(",");
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const INLINE_MEDIA_LIMIT = 50 * 1024 * 1024;

// ── Helpers ────────────────────────────────────────────────────────────
const getSourceType = (filename: string): SourceType => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (VIDEO_EXTENSIONS.includes(ext)) return "upload_video";
  if (AUDIO_EXTENSIONS.includes(ext)) return "upload_audio";
  return "upload_transcript";
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const generateTitle = (name: string) => {
  const clean = name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const validateFile = (file: File): ErrorType | null => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALL_EXTENSIONS.includes(ext)) return "unsupported_format";
  if (file.size > MAX_FILE_SIZE) return "file_too_large";
  if (file.size < 512) return "corrupted_video";
  return null;
};

const classifyError = (error: any, failedStep: string | null): ErrorType => {
  const message = [error?.message, error?.detail, error?.statusText]
    .filter(Boolean).join(" ").toLowerCase();
  if (error?.type === "AUTH" || error?.status === 401 || error?.status === 403 || message.includes("oturum") || message.includes("yetki")) return "auth_failed";
  if (message.includes("fetch") || message.includes("network") || message.includes("failed to fetch")) return "network_error";
  if (message.includes("audio") || message.includes("ses") || message.includes("konuşma metni")) return "no_audio";
  if (message.includes("transcri") || message.includes("transkript")) return "transcription_failed";
  if (message.includes("corrupt") || message.includes("bozuk") || message.includes("invalid")) return "corrupted_video";
  if (failedStep === "analyze") return "ai_processing_failed";
  if (failedStep === "upload") return "upload_failed";
  if (failedStep === "save") return "db_failed";
  return "unknown";
};

const ERROR_TITLES: Record<ErrorType, string> = {
  unsupported_format: "Desteklenmeyen format",
  file_too_large: "Dosya çok büyük (maks 2GB)",
  corrupted_video: "Bozuk dosya",
  no_audio: "Ses algılanamadı",
  transcription_failed: "Transkript başarısız",
  ai_processing_failed: "AI analizi başarısız",
  upload_failed: "Yükleme başarısız",
  db_failed: "Kayıt oluşturulamadı",
  auth_failed: "Oturum süresi dolmuş",
  network_error: "Bağlantı hatası",
  unknown: "Beklenmeyen hata",
};

const canRetryError = (errorType: ErrorType) =>
  ["transcription_failed", "ai_processing_failed", "upload_failed", "db_failed", "network_error", "unknown"].includes(errorType);

const buildRecordingInfo = (item: QueueItem, setupContext?: SetupContext) => {
  if (setupContext?.type === "mülakat") {
    const d = setupContext.data;
    return {
      type: "mülakat" as const,
      position: d.position || item.title.trim() || "Yüklenen Mülakat",
      department: d.department || null,
      requiredSkills: d.focusCompetencies || [],
      candidateName: d.candidateName || null,
      candidateSummary: d.candidateSummary || null,
      seniorityLevel: d.seniorityLevel || null,
      interviewNotes: d.interviewNotes || null,
      evaluationCriteria: d.evaluationCriteria || [],
      customQuestions: d.customQuestions || [],
    };
  }
  if (setupContext?.type === "toplantı") {
    const d = setupContext.data;
    return {
      type: "toplantı" as const,
      meetingTopic: d.meetingTopic || item.title.trim() || "Yüklenen Toplantı",
      meetingAgenda: d.agenda || null,
      participants: d.participants || [],
      meetingPurpose: d.meetingPurpose || null,
      expectedOutcomes: d.expectedOutcomes || null,
      decisionTopics: d.decisionTopics || null,
      additionalNotes: d.additionalNotes || null,
    };
  }
  return item.type === "mülakat"
    ? { type: "mülakat" as const, position: item.title.trim() || "Yüklenen Mülakat", department: null, requiredSkills: [] }
    : { type: "toplantı" as const, meetingTopic: item.title.trim() || "Yüklenen Toplantı" };
};

// ── helpers for processing_jobs persistence ──
const upsertJob = async (data: Record<string, any>) => {
  try { await (supabase as any).from("processing_jobs").upsert(data, { onConflict: "id" }); } catch (e) { console.warn("[jobs] upsert failed", e); }
};
const updateJob = async (recordingId: string, data: Record<string, any>) => {
  try { await (supabase as any).from("processing_jobs").update(data).eq("recording_id", recordingId); } catch (e) { console.warn("[jobs] update failed", e); }
};

// ═══════════════════════════════════════════════════════════════════════
// ── Interview Setup Form ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
const InterviewSetupForm = ({ data, onChange }: { data: InterviewSetupContext; onChange: (d: InterviewSetupContext) => void }) => {
  const [competencyInput, setCompetencyInput] = useState("");
  const [criteriaInput, setCriteriaInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");

  const addToList = (field: "focusCompetencies" | "evaluationCriteria" | "customQuestions", value: string, setter: (v: string) => void) => {
    if (value.trim()) {
      onChange({ ...data, [field]: [...data[field], value.trim()] });
      setter("");
    }
  };

  const removeFromList = (field: "focusCompetencies" | "evaluationCriteria" | "customQuestions", idx: number) => {
    onChange({ ...data, [field]: data[field].filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-5">
      {/* Position & Department */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Pozisyon <span className="text-destructive">*</span></Label>
          <Input value={data.position} onChange={(e) => onChange({ ...data, position: e.target.value })} placeholder="Ör: Senior Frontend Developer" className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Departman / Rol Tipi</Label>
          <Input value={data.department} onChange={(e) => onChange({ ...data, department: e.target.value })} placeholder="Ör: Mühendislik" className="h-9 text-sm" />
        </div>
      </div>

      {/* Seniority & Candidate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Kıdem Seviyesi</Label>
          <Input value={data.seniorityLevel} onChange={(e) => onChange({ ...data, seniorityLevel: e.target.value })} placeholder="Ör: Mid-Senior (3-5 yıl)" className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Aday Adı <span className="text-destructive">*</span></Label>
          <Input value={data.candidateName} onChange={(e) => onChange({ ...data, candidateName: e.target.value })} placeholder="Ör: Ahmet Yılmaz" className="h-9 text-sm" />
        </div>
      </div>

      {/* Candidate Summary */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Aday Geçmişi / Kısa Özet</Label>
        <Textarea value={data.candidateSummary} onChange={(e) => onChange({ ...data, candidateSummary: e.target.value })} placeholder="Adayın mevcut rolü, deneyim süresi, önemli projeleri..." className="min-h-[60px] text-sm resize-none" />
      </div>

      {/* Focus Competencies */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Odaklanılacak Yetkinlikler</Label>
        <div className="flex gap-2">
          <Input value={competencyInput} onChange={(e) => setCompetencyInput(e.target.value)} placeholder="Ör: React, Liderlik, Problem Çözme" className="h-9 text-sm" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addToList("focusCompetencies", competencyInput, setCompetencyInput))} />
          <Button type="button" variant="outline" size="sm" className="h-9 px-3 shrink-0" onClick={() => addToList("focusCompetencies", competencyInput, setCompetencyInput)}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        {data.focusCompetencies.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {data.focusCompetencies.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] gap-1 pr-1">
                {c}
                <button onClick={() => removeFromList("focusCompetencies", i)} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Evaluation Criteria */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Özel Değerlendirme Kriterleri</Label>
        <div className="flex gap-2">
          <Input value={criteriaInput} onChange={(e) => setCriteriaInput(e.target.value)} placeholder="Ör: STAR metoduyla cevaplama, Teknik derinlik" className="h-9 text-sm" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addToList("evaluationCriteria", criteriaInput, setCriteriaInput))} />
          <Button type="button" variant="outline" size="sm" className="h-9 px-3 shrink-0" onClick={() => addToList("evaluationCriteria", criteriaInput, setCriteriaInput)}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        {data.evaluationCriteria.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {data.evaluationCriteria.map((c, i) => (
              <Badge key={i} variant="outline" className="text-[10px] gap-1 pr-1">
                {c}
                <button onClick={() => removeFromList("evaluationCriteria", i)} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Interview Notes */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Görüşme Notları</Label>
        <Textarea value={data.interviewNotes} onChange={(e) => onChange({ ...data, interviewNotes: e.target.value })} placeholder="Görüşme hakkında ek bağlam, özel beklentiler..." className="min-h-[50px] text-sm resize-none" />
      </div>

      {/* Custom Questions */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Referans Soru Seti <span className="text-muted-foreground">(opsiyonel)</span></Label>
        <p className="text-[10px] text-muted-foreground">Bu sorular AI'ın analiz sırasında cevapları değerlendirmesine yardımcı olur.</p>
        <div className="flex gap-2">
          <Input value={questionInput} onChange={(e) => setQuestionInput(e.target.value)} placeholder="Soru ekle..." className="h-9 text-sm" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addToList("customQuestions", questionInput, setQuestionInput))} />
          <Button type="button" variant="outline" size="sm" className="h-9 px-3 shrink-0" onClick={() => addToList("customQuestions", questionInput, setQuestionInput)}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        {data.customQuestions.length > 0 && (
          <div className="space-y-1 mt-1.5">
            {data.customQuestions.map((q, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-2.5 py-1.5">
                <span className="text-muted-foreground font-mono text-[10px]">{i + 1}.</span>
                <span className="flex-1">{q}</span>
                <button onClick={() => removeFromList("customQuestions", i)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// ── Meeting Setup Form ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
const MeetingSetupForm = ({ data, onChange }: { data: MeetingSetupContext; onChange: (d: MeetingSetupContext) => void }) => {
  const [participantInput, setParticipantInput] = useState("");

  const addParticipant = () => {
    if (participantInput.trim()) {
      onChange({ ...data, participants: [...data.participants, participantInput.trim()] });
      setParticipantInput("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Toplantı Konusu <span className="text-destructive">*</span></Label>
        <Input value={data.meetingTopic} onChange={(e) => onChange({ ...data, meetingTopic: e.target.value })} placeholder="Ör: Q2 Sprint Planlama Toplantısı" className="h-9 text-sm" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Toplantı Amacı</Label>
          <Input value={data.meetingPurpose} onChange={(e) => onChange({ ...data, meetingPurpose: e.target.value })} placeholder="Ör: Sprint hedeflerini belirlemek" className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Beklenen Çıktılar</Label>
          <Input value={data.expectedOutcomes} onChange={(e) => onChange({ ...data, expectedOutcomes: e.target.value })} placeholder="Ör: Sprint backlog onayı" className="h-9 text-sm" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Gündem</Label>
        <Textarea value={data.agenda} onChange={(e) => onChange({ ...data, agenda: e.target.value })} placeholder="Toplantı gündem maddeleri..." className="min-h-[60px] text-sm resize-none" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Karar Verilmesi Gereken Başlıklar</Label>
        <Textarea value={data.decisionTopics} onChange={(e) => onChange({ ...data, decisionTopics: e.target.value })} placeholder="Hangi konularda karar alınması bekleniyor?" className="min-h-[50px] text-sm resize-none" />
      </div>

      {/* Participants */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Katılımcılar</Label>
        <div className="flex gap-2">
          <Input value={participantInput} onChange={(e) => setParticipantInput(e.target.value)} placeholder="Katılımcı adı ekle" className="h-9 text-sm" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addParticipant())} />
          <Button type="button" variant="outline" size="sm" className="h-9 px-3 shrink-0" onClick={addParticipant}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        {data.participants.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {data.participants.map((p, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] gap-1 pr-1">
                {p}
                <button onClick={() => onChange({ ...data, participants: data.participants.filter((_, j) => j !== i) })} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Ek Notlar / Bağlam</Label>
        <Textarea value={data.additionalNotes} onChange={(e) => onChange({ ...data, additionalNotes: e.target.value })} placeholder="Toplantı hakkında ek bilgi..." className="min-h-[50px] text-sm resize-none" />
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// ── Queue Item Card ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
const QueueItemCard = ({
  item, setupType, onUpdateTitle, onRetry, onRemove, onViewReport,
}: {
  item: QueueItem;
  setupType: "toplantı" | "mülakat";
  onUpdateTitle: (id: string, title: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onViewReport: (recordingId: string) => void;
}) => {
  const stateStyles = {
    queued: { icon: FileVideo, color: "text-muted-foreground", bg: "bg-muted", label: "Sırada" },
    uploading: { icon: Loader2, color: "text-primary", bg: "bg-primary/10", label: "Yükleniyor" },
    analyzing: { icon: Brain, color: "text-primary", bg: "bg-primary/10", label: "AI Analiz" },
    server_processing: { icon: Loader2, color: "text-accent", bg: "bg-accent/10", label: "Sunucu İşliyor" },
    completed: { icon: CheckCircle2, color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10", label: "Tamamlandı" },
    failed: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Başarısız" },
  };

  const sourceIcons: Record<SourceType, typeof FileVideo> = {
    upload_video: FileVideo,
    upload_audio: Music,
    upload_transcript: FileType,
  };

  const stateStyle = stateStyles[item.state];
  const Icon = stateStyle.icon;
  const SourceIcon = sourceIcons[item.sourceType];
  const isEditable = item.state === "queued";
  const isActive = item.state === "uploading" || item.state === "analyzing" || item.state === "server_processing";
  const isTranscript = item.sourceType === "upload_transcript";

  return (
    <Card className={`transition-all ${item.state === "completed" ? "border-[hsl(var(--success))]/20" : item.state === "failed" ? "border-destructive/20" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-xl ${stateStyle.bg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${stateStyle.color} ${isActive ? "animate-spin" : ""}`} />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                {isEditable ? (
                  <Input value={item.title} onChange={(e) => onUpdateTitle(item.id, e.target.value)} className="h-8 text-sm font-medium" placeholder="Başlık girin..." />
                ) : (
                  <p className="text-sm font-medium truncate">{item.title}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${stateStyle.bg} ${stateStyle.color}`}>{stateStyle.label}</span>
                {(isEditable || item.state === "failed") && (
                  <button onClick={() => onRemove(item.id)} className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><SourceIcon className="h-3 w-3" />{item.file.name}</span>
              <span>•</span>
              <span>{formatFileSize(item.file.size)}</span>
              <span>•</span>
              <span>{item.file.name.split(".").pop()?.toUpperCase()}</span>
              <span>•</span>
              <span className="font-medium text-primary">{setupType === "mülakat" ? "Mülakat" : "Toplantı"}</span>
              {needsAudioExtraction(item.file, INLINE_MEDIA_LIMIT) && (
                <>
                  <span>•</span>
                  <span className="text-accent font-medium">Ses çıkarımı yapılacak</span>
                </>
              )}
            </div>

            {isActive && (() => {
              const isLargeVideo = item.sourceType === "upload_video" && item.file.size > INLINE_MEDIA_LIMIT;
              const allSteps: { key: PipelineStep; label: string; icon: typeof Upload }[] =
                isTranscript
                  ? [
                      { key: "upload", label: "Yükleme", icon: CloudUpload },
                      { key: "interpretation", label: "AI Analiz", icon: Brain },
                      { key: "report", label: "Rapor", icon: BarChart3 },
                    ]
                  : isLargeVideo
                  ? [
                      { key: "upload", label: "Yükleme", icon: CloudUpload },
                      { key: "audio", label: "Ses Çözümü", icon: Volume2 },
                      { key: "chunking", label: "Parçalama", icon: FileText },
                      { key: "transcription", label: "Transkript", icon: Mic },
                      { key: "merging", label: "Birleştirme", icon: FileText },
                      { key: "interpretation", label: "AI Analiz", icon: Brain },
                      { key: "report", label: "Rapor", icon: BarChart3 },
                    ]
                  : item.behavioralAnalysis && item.sourceType === "upload_video"
                  ? [
                      { key: "upload", label: "Yükleme", icon: CloudUpload },
                      { key: "audio", label: "Ses Çözümü", icon: Volume2 },
                      { key: "transcription", label: "Transkript", icon: FileText },
                      { key: "voice", label: "Ses Analizi", icon: Mic },
                      { key: "visual", label: "Mimik", icon: ScanEye },
                      { key: "interpretation", label: "AI Yorum", icon: Brain },
                      { key: "report", label: "Rapor", icon: BarChart3 },
                    ]
                  : [
                      { key: "upload", label: "Yükleme", icon: CloudUpload },
                      { key: "audio", label: "Ses Çözümü", icon: Volume2 },
                      { key: "transcription", label: "Transkript", icon: FileText },
                      { key: "interpretation", label: "AI Analiz", icon: Brain },
                      { key: "report", label: "Rapor", icon: BarChart3 },
                    ];

              const currentIdx = allSteps.findIndex((step) => step.key === item.pipelineStep);

              return (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1">
                    {allSteps.map((step, index) => {
                      const isDone = index < currentIdx;
                      const isCurrent = index === currentIdx;
                      const StepIcon = step.icon;
                      return (
                        <div key={step.key} className="flex items-center gap-1 flex-1">
                          <div className="flex flex-col items-center gap-0.5 flex-1">
                            <div className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all duration-500 ${
                              isDone ? "bg-[hsl(var(--success))]/15" : isCurrent ? "bg-primary/15 ring-1 ring-primary/30" : "bg-muted/50"
                            }`}>
                              {isDone ? <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> : isCurrent ? <StepIcon className="h-3.5 w-3.5 text-primary animate-pulse" /> : <StepIcon className="h-3 w-3 text-muted-foreground/50" />}
                            </div>
                            <span className={`text-[8px] leading-tight text-center font-medium transition-colors ${
                              isDone ? "text-[hsl(var(--success))]" : isCurrent ? "text-primary" : "text-muted-foreground/50"
                            }`}>{step.label}</span>
                          </div>
                          {index < allSteps.length - 1 && (
                            <div className={`h-[2px] w-2 rounded-full shrink-0 mb-3 transition-colors duration-500 ${isDone ? "bg-[hsl(var(--success))]/40" : "bg-border"}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <Progress value={item.progress} className="h-1" />
                  <p className="text-[10px] text-muted-foreground font-mono">{Math.round(item.progress)}%</p>
                </div>
              );
            })()}

            {item.state === "failed" && (
              <div className="flex items-center justify-between rounded-lg bg-destructive/5 border border-destructive/15 px-3 py-2">
                <span className="text-[11px] text-destructive">{ERROR_TITLES[item.errorType]}</span>
                <div className="flex items-center gap-1.5">
                  {canRetryError(item.errorType) && (
                    <button onClick={() => onRetry(item.id)} className="text-[10px] font-medium text-primary hover:underline flex items-center gap-1">
                      <RotateCcw className="h-3 w-3" /> Tekrar Dene
                    </button>
                  )}
                </div>
              </div>
            )}

            {item.state === "completed" && item.recordingId && (
              <button onClick={() => onViewReport(item.recordingId!)} className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1">
                <Eye className="h-3 w-3" /> Raporu Görüntüle
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// ── Main Component ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
const FileUploadSection = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<UploadPhase>("setup");
  const [selectedType, setSelectedType] = useState<"mülakat" | "toplantı" | null>(null);
  const [behavioralAnalysis, setBehavioralAnalysis] = useState(true);

  // Setup context
  const [interviewSetup, setInterviewSetup] = useState<InterviewSetupContext>({
    position: "", department: "", seniorityLevel: "", interviewNotes: "",
    candidateName: "", candidateSummary: "", focusCompetencies: [], evaluationCriteria: [], customQuestions: [],
  });
  const [meetingSetup, setMeetingSetup] = useState<MeetingSetupContext>({
    meetingTopic: "", agenda: "", participants: [], meetingPurpose: "",
    expectedOutcomes: "", decisionTopics: "", additionalNotes: "",
  });

  // File queue
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Setup context reference for processing
  const setupContextRef = useRef<SetupContext | undefined>(undefined);

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const setQueueAndRef = useCallback((updater: QueueItem[] | ((prev: QueueItem[]) => QueueItem[])) => {
    setQueue((prev) => {
      const next = typeof updater === "function" ? (updater as (prev: QueueItem[]) => QueueItem[])(prev) : updater;
      queueRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const updateItem = useCallback((id: string, updates: Partial<QueueItem>) => {
    setQueueAndRef((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }, [setQueueAndRef]);

  // ── Job polling for server-side processing ──
  const pollJobStatus = useCallback(async (jobId: string, recordingId: string, itemId: string) => {
    try {
      const { data: job } = await (supabase as any)
        .from("processing_jobs")
        .select("status, pipeline_step, progress, metadata, failure_reason, transcript_length")
        .eq("id", jobId)
        .single();

      if (!job) return null;

      // Map server pipeline_step to client PipelineStep
      const stepMap: Record<string, PipelineStep> = {
        transcribing: "transcription",
        chunking: "chunking",
        transcribing_chunks: "transcription",
        merging_transcript: "merging",
        transcribed: "interpretation",
      };

      const mappedStep = stepMap[job.pipeline_step] || "transcription";
      const serverProgress = job.progress || 0;

      if (job.status === "transcribed") {
        // Transcription complete - fetch transcript and continue to analysis
        return { status: "transcribed" as const, progress: serverProgress, step: mappedStep };
      } else if (job.status === "failed") {
        return { status: "failed" as const, reason: job.failure_reason, step: mappedStep };
      } else {
        // Still processing
        updateItem(itemId, {
          state: "server_processing",
          progress: Math.max(30, Math.min(85, serverProgress)),
          pipelineStep: mappedStep,
        });
        return { status: "processing" as const, progress: serverProgress, step: mappedStep };
      }
    } catch (e) {
      console.warn("[Upload] Poll error", e);
      return null;
    }
  }, [updateItem]);

  // Load existing jobs and mark stale ones as failed
  useEffect(() => {
    const loadExistingJobs = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: jobs } = await (supabase as any)
          .from("processing_jobs")
          .select("*")
          .eq("user_id", user.id)
          .in("status", ["uploaded", "queued", "transcribing", "transcribed", "analyzing", "extracting_audio"])
          .order("created_at", { ascending: false })
          .limit(10);

        if (jobs && jobs.length > 0) {
          const now = Date.now();
          for (const job of jobs) {
            const elapsed = now - new Date(job.updated_at).getTime();
            if (elapsed > 15 * 60 * 1000) {
              await (supabase as any).from("processing_jobs").update({
                status: "failed",
                failure_reason: "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
                error_type: "timeout",
              }).eq("id", job.id);
            }
          }
        }
      } catch (e) {
        console.warn("[Upload] Failed to load existing jobs", e);
      }
    };
    loadExistingJobs();
    return clearPollInterval;
  }, [clearPollInterval]);

  const setupContext: SetupContext | undefined = selectedType
    ? selectedType === "mülakat"
      ? { type: "mülakat", data: interviewSetup }
      : { type: "toplantı", data: meetingSetup }
    : undefined;

  const isSetupValid = selectedType === "mülakat"
    ? interviewSetup.position.trim() && interviewSetup.candidateName.trim()
    : selectedType === "toplantı"
      ? meetingSetup.meetingTopic.trim()
      : false;

  const handleProceedToFiles = () => {
    if (!isSetupValid || !selectedType) return;
    setupContextRef.current = setupContext;
    setPhase("files");
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: QueueItem[] = Array.from(files).map((file) => {
      const error = validateFile(file);
      const sourceType = getSourceType(file.name);
      return {
        id: crypto.randomUUID(),
        file,
        title: generateTitle(file.name),
        type: selectedType || "toplantı",
        behavioralAnalysis: behavioralAnalysis && sourceType === "upload_video",
        state: error ? ("failed" as const) : ("queued" as const),
        progress: 0,
        pipelineStep: "upload" as const,
        errorType: error || ("unknown" as ErrorType),
        failedStep: null,
        recordingId: null,
        sourceType,
      };
    });
    setQueueAndRef((prev) => [...prev, ...newItems]);
  }, [selectedType, behavioralAnalysis, setQueueAndRef]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  }, [addFiles]);

  const removeItem = (id: string) => setQueueAndRef((prev) => prev.filter((item) => item.id !== id));
  const clearCompleted = () => setQueueAndRef((prev) => prev.filter((item) => item.state !== "completed"));
  const resetAll = () => {
    setQueueAndRef([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Processing Pipeline ────────────────────────────────────────────
  const processQueue = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    setPhase("processing");

    const ctx = setupContextRef.current;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Lütfen giriş yapın"); return; }

      while (true) {
        const next = queueRef.current.find((item) => item.state === "queued");
        if (!next) break;

        if (!next.title.trim()) {
          updateItem(next.id, { state: "failed", errorType: "unknown", failedStep: null });
          continue;
        }

        const jobId = crypto.randomUUID();

        try {
          const isTranscriptFile = next.sourceType === "upload_transcript";
          const isVideoFile = next.sourceType === "upload_video";
          const requiresExtraction = isVideoFile && needsAudioExtraction(next.file, INLINE_MEDIA_LIMIT);

          console.log(`[Upload] Starting: ${next.file.name} (${next.sourceType}, ${next.type}, size=${formatFileSize(next.file.size)}, extraction=${requiresExtraction})`);

          // ── Step 1: Upload to storage ──
          updateItem(next.id, { state: "uploading", progress: 5, pipelineStep: "upload", failedStep: null });

          let filePath: string | null = null;
          let transcriptionFilePath: string | null = null;
          let rawTranscript = "";

          if (isTranscriptFile) {
            rawTranscript = await next.file.text();
          } else {
            filePath = `${user.id}/${Date.now()}_${next.file.name}`;
            const { error: uploadError } = await supabase.storage
              .from("recordings")
              .upload(filePath, next.file, { cacheControl: "3600", upsert: false });
            if (uploadError) {
              updateItem(next.id, { state: "failed", errorType: classifyError(uploadError, "upload"), failedStep: "upload" });
              continue;
            }
          }

          updateItem(next.id, { progress: 15, pipelineStep: isTranscriptFile ? "interpretation" : "audio" });

          // ── Step 1.5: Client-side audio extraction for large videos ──
          if (requiresExtraction) {
            updateItem(next.id, { progress: 16, pipelineStep: "audio" });
            try {
              const result = await extractAudioFromVideo(next.file, (progress) => {
                updateItem(next.id, { progress: 16 + Math.round(progress * 0.14) });
              });
              const audioPath = `${user.id}/${Date.now()}_extracted_audio.wav`;
              const { error: audioUploadError } = await supabase.storage
                .from("recordings")
                .upload(audioPath, result.blob, { cacheControl: "3600", upsert: false });
              if (audioUploadError) throw audioUploadError;
              transcriptionFilePath = audioPath;
            } catch (extractError: any) {
              updateItem(next.id, { state: "failed", errorType: "no_audio", failedStep: "audio_extraction" });
              toast.error(extractError.message || "Ses çıkarımı başarısız.");
              continue;
            }
          }

          updateItem(next.id, { progress: 30, pipelineStep: isTranscriptFile ? "interpretation" : "transcription" });

          // ── Step 2: Create DB record ──
          const { data: recording, error: dbError } = await supabase
            .from("recordings")
            .insert({
              title: next.title.trim(),
              type: next.type,
              user_id: user.id,
              video_url: filePath,
              duration: null,
              summary: isTranscriptFile ? "Transkript dosyası yüklendi, analiz hazırlanıyor..." : "Medya dosyası yüklendi, işlem başladı...",
            })
            .select("id")
            .single();

          if (dbError || !recording?.id) {
            updateItem(next.id, { state: "failed", errorType: "db_failed", failedStep: "save" });
            continue;
          }

          updateItem(next.id, { recordingId: recording.id });

          // ── Create processing_jobs record with setup context ──
          await upsertJob({
            id: jobId,
            user_id: user.id,
            recording_id: recording.id,
            status: "transcribing",
            pipeline_step: isTranscriptFile ? "analyzing" : "transcribing",
            file_name: next.file.name,
            file_size: next.file.size,
            source_type: next.sourceType,
            recording_type: next.type,
            title: next.title.trim(),
            behavioral_analysis: next.behavioralAnalysis,
            file_path: transcriptionFilePath || filePath,
            started_at: new Date().toISOString(),
            metadata: ctx ? { setup_context: ctx } : {},
          });

          // ── Step 3: Extract frames (video only + behavioral) ──
          let frames: string[] = [];
          if (isVideoFile && next.behavioralAnalysis) {
            try {
              frames = await extractFramesFromVideo(next.file, { count: 5, maxWidth: 960, quality: 0.72 });
            } catch (frameError) {
              console.warn("[Upload] Frame extraction failed", frameError);
            }
          }

          const recordingInfo = {
            ...buildRecordingInfo(next, ctx),
            sourceType: next.sourceType,
          };

          // ── Step 4: Transcription ──
          let transcript = "";

          if (isTranscriptFile) {
            transcript = rawTranscript;
          } else if (requiresExtraction && transcriptionFilePath) {
            // ── LARGE FILE: Server-side chunked transcription ──
            updateItem(next.id, { state: "server_processing", progress: 32, pipelineStep: "chunking" });
            console.log(`[Upload] Using process-recording for large file: ${transcriptionFilePath}`);

            const processResult = await invokeEdgeFunction<{ transcript: string; chunks?: number; transcriptLength?: number }>(
              EDGE_FUNCTIONS.PROCESS_RECORDING,
              {
                filePath: transcriptionFilePath,
                recordingId: recording.id,
                jobId,
                recordingType: next.type,
                participants: ctx?.type === "toplantı" ? ctx.data.participants : undefined,
                recordingInfo,
              },
              { maxRetries: 1, timeoutMs: 300000 }
            );

            if (processResult.error) {
              // Check if server is still processing (timeout on client side)
              if (processResult.error.type === "TIMEOUT") {
                console.log("[Upload] process-recording timed out on client, polling for completion...");
                updateItem(next.id, { state: "server_processing", progress: 50, pipelineStep: "transcription" });

                // Poll for up to 3 minutes
                let pollAttempts = 0;
                const maxPollAttempts = 36; // 36 × 5s = 3 min
                let pollResult: any = null;

                while (pollAttempts < maxPollAttempts) {
                  await new Promise(r => setTimeout(r, 5000));
                  pollAttempts++;
                  pollResult = await pollJobStatus(jobId, recording.id, next.id);

                  if (!pollResult || pollResult.status === "failed") break;
                  if (pollResult.status === "transcribed") break;
                }

                if (pollResult?.status === "transcribed") {
                  // Fetch transcript from recording
                  const { data: rec } = await supabase.from("recordings").select("transcript").eq("id", recording.id).single();
                  transcript = rec?.transcript?.trim() || "";
                } else {
                  console.error("[Upload] Polling failed or timed out", pollResult);
                  updateItem(next.id, { state: "failed", errorType: "transcription_failed", failedStep: "transcription", progress: 60 });
                  await updateJob(recording.id, { status: "failed", failure_reason: pollResult?.reason || "Sunucu transkripsiyon zaman aşımına uğradı", failed_step: "transcription", error_type: "timeout" });
                  continue;
                }
              } else {
                const failureMessage = formatTranscriptionFailure(processResult.error, processResult.data as TranscriptionInvokePayload);
                console.error("[Upload] process-recording error", processResult.error, processResult.data);
                toast.error(failureMessage);
                updateItem(next.id, { state: "failed", errorType: "transcription_failed", failedStep: "transcription", progress: 60 });
                await updateJob(recording.id, {
                  status: "failed",
                  failure_reason: failureMessage,
                  failed_step: "transcription",
                  error_type: "transcription_failed",
                });
                continue;
              }
            } else {
              transcript = processResult.data?.transcript?.trim() || "";
              console.log(`[Upload] Server transcription complete: ${transcript.length} chars, chunks=${processResult.data?.chunks}`);
            }

            updateItem(next.id, { state: "analyzing", progress: 60, pipelineStep: "interpretation" });
          } else {
            // ── SMALL FILE: Existing inline transcription ──
            updateItem(next.id, { state: "analyzing", progress: 35, pipelineStep: "transcription" });
            const transcribeFilePath = transcriptionFilePath || filePath;
            const transcriptResult = await invokeEdgeFunction<TranscriptionInvokePayload>(
              EDGE_FUNCTIONS.TRANSCRIBE_RECORDING,
              {
                filePath: transcribeFilePath,
                recordingId: recording.id,
                recordingType: next.type,
                participants: ctx?.type === "toplantı" ? ctx.data.participants : undefined,
                recordingInfo,
              },
              { maxRetries: 1, timeoutMs: 300000 }
            );
            if (transcriptResult.error) {
              const failureMessage = formatTranscriptionFailure(transcriptResult.error, transcriptResult.data);
              console.error("[Upload] Transcription error", transcriptResult.error, transcriptResult.data);
              toast.error(failureMessage);
              updateItem(next.id, { state: "failed", errorType: "transcription_failed", failedStep: "transcription", progress: 45 });
              await updateJob(recording.id, {
                status: "failed",
                failure_reason: failureMessage,
                failed_step: "transcription",
                error_type: "transcription_failed",
              });
              continue;
            }
            transcript = transcriptResult.data?.transcript?.trim() || "";
          }

          // ── Step 5: Facial analysis (video + behavioral only) ──
          let facialAnalysis: any = null;
          if (isVideoFile && next.behavioralAnalysis && frames.length > 0) {
            updateItem(next.id, { progress: 55, pipelineStep: "visual" });
            const facialResult = await invokeEdgeFunction<{ analysis: any }>(
              EDGE_FUNCTIONS.ANALYZE_FACIAL,
              { frames },
              { maxRetries: 1, timeoutMs: 90000 }
            );
            if (!facialResult.error) {
              facialAnalysis = facialResult.data?.analysis ?? null;
            }
          }

          // ── Step 6: CREDIT PROTECTION ──
          updateItem(next.id, {
            progress: isVideoFile && next.behavioralAnalysis ? 70 : 60,
            pipelineStep: "interpretation",
          });

          if (!transcript || transcript.trim().length < 50) {
            await supabase.from("recordings").update({
              transcript: transcript || null,
              summary: transcript
                ? "Transkript çok kısa. AI analizi için yeterli veri yok."
                : "Transkript oluşturulamadı. Lütfen farklı bir dosya deneyin.",
            }).eq("id", recording.id);
            await updateJob(recording.id, { status: "failed", failure_reason: "Transkript çok kısa veya oluşturulamadı", failed_step: "transcription", error_type: "transcription_failed" });
            updateItem(next.id, { state: "failed", errorType: "transcription_failed", failedStep: "transcription", progress: 60 });
            continue;
          }

          await updateJob(recording.id, { status: "analyzing", pipeline_step: "analyzing", transcript_length: transcript.length });

          // ── Step 7: Main AI Analysis with setup context ──
          const analysisResult = await invokeEdgeFunction<{ analysis: any }>(
            EDGE_FUNCTIONS.ANALYZE_INTERVIEW,
            {
              transcript,
              recordingInfo,
              behavioralAnalysis: next.behavioralAnalysis && !isTranscriptFile,
              facialAnalysis,
            },
            { maxRetries: 1, timeoutMs: 300000 }
          );

          if (analysisResult.error || !analysisResult.data?.analysis) {
            await supabase.from("recordings").update({ transcript, summary: "Transkript hazırlandı ancak AI analizi başarısız oldu" }).eq("id", recording.id);
            await updateJob(recording.id, { status: "failed", failure_reason: "AI analizi başarısız oldu", failed_step: "analyzing", error_type: "ai_processing_failed" });
            updateItem(next.id, { state: "failed", errorType: analysisResult.error ? classifyError(analysisResult.error, "analyze") : "ai_processing_failed", failedStep: "analyze", progress: 70 });
            continue;
          }

          // ── Step 8: Save report ──
          updateItem(next.id, { progress: 92, pipelineStep: "report" });

          const analysis = analysisResult.data.analysis;
          const fullAnalysis = facialAnalysis ? { ...analysis, facial_analysis: facialAnalysis } : analysis;
          const biveyosSignals = extractBiveyosSignals(fullAnalysis, next.type);
          const finalSummary = analysis?.summary || "Analiz tamamlandı";

          const { error: updateError } = await supabase.from("recordings").update({
            transcript,
            analysis_data: fullAnalysis,
            summary: finalSummary,
            biveyos_signals: biveyosSignals,
          } as any).eq("id", recording.id);

          if (updateError) {
            updateItem(next.id, { state: "failed", errorType: "db_failed", failedStep: "save" });
            continue;
          }

          await updateJob(recording.id, { status: "completed", pipeline_step: "completed", progress: 100, completed_at: new Date().toISOString() });
          updateItem(next.id, { state: "completed", progress: 100, pipelineStep: "report" });

        } catch (error: any) {
          console.error("[Upload] Unexpected error", error);
          updateItem(next.id, { state: "failed", errorType: classifyError(error, next.failedStep), failedStep: next.failedStep || "upload" });
        }
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }

    setQueueAndRef((prev) => {
      const completed = prev.filter((item) => item.state === "completed").length;
      const failed = prev.filter((item) => item.state === "failed").length;
      if (completed > 0) {
        toast.success(`${completed} kayıt başarıyla işlendi${failed > 0 ? `, ${failed} başarısız` : ""}`, {
          description: "Raporları toplantılar sayfasından görüntüleyebilirsiniz.",
          action: { label: "Toplantılara Git", onClick: () => navigate("/dashboard/meetings") },
          duration: 8000,
        });
      }
      return prev;
    });
  };

  const retryItem = (id: string) => {
    updateItem(id, { state: "queued", progress: 0, errorType: "unknown", failedStep: null });
    if (!processingRef.current) setTimeout(processQueue, 100);
  };

  const handleStartAll = () => {
    const hasQueued = queueRef.current.some((item) => item.state === "queued" && item.title.trim());
    if (!hasQueued) { toast.error("Lütfen en az bir dosya ekleyin ve başlık girin"); return; }
    processQueue();
  };

  // ── Derived state ──
  const queuedCount = queue.filter((item) => item.state === "queued").length;
  const activeCount = queue.filter((item) => item.state === "uploading" || item.state === "analyzing" || item.state === "server_processing").length;
  const completedCount = queue.filter((item) => item.state === "completed").length;
  const failedCount = queue.filter((item) => item.state === "failed").length;
  const hasItems = queue.length > 0;
  const allDone = hasItems && queuedCount === 0 && activeCount === 0;

  // ═══════════════════════════════════════════════════════════════════
  // ── PHASE 1: SETUP ────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  if (phase === "setup") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Settings2 className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold mb-0.5">Analiz Bağlamını Tanımlayın</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Önce kayıt tipini seçin ve bağlam bilgilerini doldurun. Bu bilgiler AI'ın daha güçlü ve bağlama duyarlı analiz üretmesini sağlar.
              </p>
            </div>
          </div>
        </div>

        {/* Type Selection */}
        {!selectedType ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => { setSelectedType("mülakat"); setBehavioralAnalysis(true); }}
              className="group relative flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-center"
            >
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <UserCheck className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h4 className="font-display text-base font-semibold mb-1">Mülakat</h4>
                <p className="text-xs text-muted-foreground">İş görüşmesi kaydını analiz et. Aday değerlendirmesi, rol uyumu ve işe alım önerisi üret.</p>
              </div>
            </button>

            <button
              onClick={() => { setSelectedType("toplantı"); setBehavioralAnalysis(false); }}
              className="group relative flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-center"
            >
              <div className="h-14 w-14 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="h-7 w-7 text-accent" />
              </div>
              <div>
                <h4 className="font-display text-base font-semibold mb-1">Toplantı</h4>
                <p className="text-xs text-muted-foreground">Toplantı kaydını analiz et. Kararlar, aksiyon maddeleri, katılım dengesi ve verimlilik raporu üret.</p>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Selected type header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${selectedType === "mülakat" ? "bg-primary/10" : "bg-accent/10"}`}>
                  {selectedType === "mülakat" ? <UserCheck className="h-5 w-5 text-primary" /> : <Users className="h-5 w-5 text-accent" />}
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold">{selectedType === "mülakat" ? "Mülakat Bilgileri" : "Toplantı Bilgileri"}</h3>
                  <p className="text-[10px] text-muted-foreground">Bu bilgiler analiz kalitesini doğrudan artırır.</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedType(null)} className="text-xs">
                <ArrowLeft className="h-3 w-3 mr-1" /> Geri
              </Button>
            </div>

            {/* Setup Form */}
            <Card>
              <CardContent className="pt-6">
                {selectedType === "mülakat" ? (
                  <InterviewSetupForm data={interviewSetup} onChange={setInterviewSetup} />
                ) : (
                  <MeetingSetupForm data={meetingSetup} onChange={setMeetingSetup} />
                )}
              </CardContent>
            </Card>

            {/* BİVEYOS toggle */}
            {selectedType === "mülakat" && (
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">BİVEYOS Davranışsal Analiz</span>
                  <Badge className="text-[8px] px-1.5 py-0 h-4 bg-gradient-to-r from-primary to-accent text-primary-foreground border-0">Premium</Badge>
                </div>
                <Switch checked={behavioralAnalysis} onCheckedChange={setBehavioralAnalysis} />
              </div>
            )}

            {/* Setup Summary + Continue */}
            <Button
              onClick={handleProceedToFiles}
              disabled={!isSetupValid}
              className="w-full"
              size="lg"
            >
              Dosya Yüklemeye Geç
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ── PHASE 2 & 3: FILES + PROCESSING ───────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Context summary banner */}
      {setupContext && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              {selectedType === "mülakat" ? <UserCheck className="h-4 w-4 text-primary" /> : <Users className="h-4 w-4 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-display text-sm font-semibold">
                  {selectedType === "mülakat" ? "Mülakat Analizi" : "Toplantı Analizi"}
                </h3>
                {!isProcessing && (
                  <Button variant="ghost" size="sm" onClick={() => setPhase("setup")} className="text-[10px] h-6 px-2">
                    <Settings2 className="h-3 w-3 mr-1" /> Düzenle
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                {selectedType === "mülakat" && (
                  <>
                    <span><strong>Pozisyon:</strong> {interviewSetup.position}</span>
                    <span><strong>Aday:</strong> {interviewSetup.candidateName}</span>
                    {interviewSetup.department && <span><strong>Departman:</strong> {interviewSetup.department}</span>}
                    {interviewSetup.focusCompetencies.length > 0 && <span><strong>Yetkinlikler:</strong> {interviewSetup.focusCompetencies.join(", ")}</span>}
                  </>
                )}
                {selectedType === "toplantı" && (
                  <>
                    <span><strong>Konu:</strong> {meetingSetup.meetingTopic}</span>
                    {meetingSetup.meetingPurpose && <span><strong>Amaç:</strong> {meetingSetup.meetingPurpose}</span>}
                    {meetingSetup.participants.length > 0 && <span><strong>Katılımcılar:</strong> {meetingSetup.participants.join(", ")}</span>}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold mb-0.5">Dosya Yükleme</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong>Desteklenen:</strong> MP4, MOV, WebM, MP3, WAV, M4A, TXT, VTT (maks 2GB).
              <br />
              <strong>Uzun kayıtlar (40+ dk):</strong> Büyük videolardan otomatik ses çıkarımı yapılır.
              Başarısız durumlarda krediniz düşürülmez.
            </p>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <Card
        className={`relative border-2 border-dashed transition-all duration-200 cursor-pointer group ${
          isDragging ? "border-primary bg-primary/5 shadow-lg" : "border-border hover:border-primary/40 hover:bg-muted/30"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent className={`flex flex-col items-center justify-center px-6 ${hasItems ? "py-8" : "py-14"}`}>
          <div className={`${hasItems ? "h-10 w-10 rounded-xl" : "h-16 w-16 rounded-2xl"} flex items-center justify-center mb-3 transition-colors ${isDragging ? "bg-primary/10" : "bg-muted"}`}>
            {hasItems ? (
              <Plus className={`h-5 w-5 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            ) : (
              <CloudUpload className={`h-8 w-8 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            )}
          </div>
          <h3 className={`font-display ${hasItems ? "text-sm" : "text-lg"} font-semibold mb-1`}>
            {isDragging ? "Dosyaları bırakın" : hasItems ? "Daha fazla dosya ekleyin" : "Dosyaları sürükleyin veya seçin"}
          </h3>
          <p className="text-xs text-muted-foreground text-center max-w-md">
            {hasItems ? "Birden fazla dosya seçebilirsiniz" : "Video: MP4, MOV, WebM • Ses: MP3, WAV, M4A • Transkript: TXT, VTT • Maks 2GB"}
          </p>
          {!hasItems && (
            <>
              <Button variant="outline" size="sm" className="pointer-events-none mt-4">
                <Upload className="mr-2 h-4 w-4" /> Dosya Seç
              </Button>
              <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border w-full max-w-sm justify-center">
                {[
                  { icon: FileVideo, label: "Video" },
                  { icon: Music, label: "Ses" },
                  { icon: FileType, label: "Transkript" },
                ].map(({ icon: FIcon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FIcon className="h-3.5 w-3.5" /><span>{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FORMATS}
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
        />
      </Card>

      {hasItems && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">{queue.length} dosya</span>
            {activeCount > 0 && <span className="flex items-center gap-1 text-primary font-medium"><Loader2 className="h-3 w-3 animate-spin" /> {activeCount} işleniyor</span>}
            {completedCount > 0 && <span className="flex items-center gap-1 text-[hsl(var(--success))] font-medium"><CheckCircle2 className="h-3 w-3" /> {completedCount} tamamlandı</span>}
            {failedCount > 0 && <span className="flex items-center gap-1 text-destructive font-medium"><AlertCircle className="h-3 w-3" /> {failedCount} başarısız</span>}
          </div>
          <div className="flex items-center gap-2">
            {completedCount > 0 && <Button variant="ghost" size="sm" onClick={clearCompleted} className="text-xs h-7">Tamamlananları Temizle</Button>}
            {allDone && <Button variant="ghost" size="sm" onClick={resetAll} className="text-xs h-7"><Trash2 className="mr-1 h-3 w-3" /> Tümünü Temizle</Button>}
          </div>
        </div>
      )}

      {hasItems && (
        <div className="space-y-2">
          {queue.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              setupType={selectedType || "toplantı"}
              onUpdateTitle={(id, title) => updateItem(id, { title })}
              onRetry={retryItem}
              onRemove={removeItem}
              onViewReport={(recordingId) => navigate(`/dashboard/meetings/${recordingId}`)}
            />
          ))}
        </div>
      )}

      {hasItems && (
        <div className="flex items-center gap-3">
          {queuedCount > 0 && !isProcessing && (
            <Button variant="default" className="flex-1" onClick={handleStartAll}>
              <Upload className="mr-2 h-4 w-4" />
              Tümünü İşle ({queuedCount} dosya)
            </Button>
          )}
          {isProcessing && (
            <Button variant="outline" className="flex-1" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              İşleniyor...
            </Button>
          )}
        </div>
      )}

      {hasItems && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            💡 <strong>Kredi Koruması:</strong> Transkript oluşturulamayan veya doğrulanamayan dosyalarda AI analizi başlatılmaz ve krediniz düşürülmez.
          </p>
        </div>
      )}
    </div>
  );
};

export default FileUploadSection;
