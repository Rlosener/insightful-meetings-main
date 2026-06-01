import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Upload, FileVideo, X, CheckCircle2, AlertCircle, RotateCcw,
  Loader2, MonitorPlay, Video, CloudUpload, Trash2, Brain, Sparkles,
  HelpCircle, Volume2, Plus, Eye, Mic, ScanEye, FileText, BarChart3,
  Music, FileType,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractBiveyosSignals } from "@/types/biveyos";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { extractFramesFromVideo } from "@/lib/videoProcessing";
import { isTranscriptUsableForAnalysis, normalizeTranscriptResult } from "@/features/transcription/services/transcriptionNormalizer";
import type { TranscriptResult } from "@/features/transcription/types";

// ── Types ──────────────────────────────────────────────────────────────
type FileState = "queued" | "uploading" | "analyzing" | "completed" | "failed";

type ErrorType =
  | "unsupported_format" | "file_too_large" | "corrupted_video"
  | "no_audio" | "transcription_failed" | "ai_processing_failed"
  | "upload_failed" | "db_failed" | "auth_failed" | "network_error" | "unknown";

type PipelineStep = "upload" | "audio" | "transcription" | "voice" | "visual" | "interpretation" | "report";

type SourceType = "upload_video" | "upload_audio" | "upload_transcript";
type AnalysisPayload = Record<string, unknown>;

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
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

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

const toErrorRecord = (error: unknown): Record<string, unknown> =>
  error && typeof error === "object" ? error as Record<string, unknown> : {};

const classifyError = (error: unknown, failedStep: string | null): ErrorType => {
  const record = toErrorRecord(error);
  const message = [record.message, record.detail, record.statusText]
    .filter(Boolean).join(" ").toLowerCase();

  if (record.type === "AUTH" || record.status === 401 || record.status === 403 || message.includes("oturum") || message.includes("yetki")) return "auth_failed";
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

const buildRecordingInfo = (item: QueueItem) =>
  item.type === "mülakat"
    ? { type: "mülakat", position: item.title.trim() || "Yüklenen Mülakat", department: null, requiredSkills: [] }
    : { type: "toplantı", meetingTopic: item.title.trim() || "Yüklenen Toplantı" };

// ── Queue Item Card ────────────────────────────────────────────────────
const QueueItemCard = ({
  item, onUpdateTitle, onUpdateType, onToggleBehavioral, onRetry, onRemove, onViewReport,
}: {
  item: QueueItem;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateType: (id: string, type: "toplantı" | "mülakat") => void;
  onToggleBehavioral: (id: string, value: boolean) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onViewReport: (recordingId: string) => void;
}) => {
  const stateStyles = {
    queued: { icon: FileVideo, color: "text-muted-foreground", bg: "bg-muted", label: "Sırada" },
    uploading: { icon: Loader2, color: "text-primary", bg: "bg-primary/10", label: "Yükleniyor" },
    analyzing: { icon: Brain, color: "text-primary", bg: "bg-primary/10", label: "AI Analiz" },
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
  const isActive = item.state === "uploading" || item.state === "analyzing";
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
            </div>

            {isEditable && (
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  {(["toplantı", "mülakat"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => onUpdateType(item.id, type)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium border transition-all ${
                        item.type === type ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {type === "toplantı" ? "Toplantı" : "Mülakat"}
                    </button>
                  ))}
                </div>
                {!isTranscript && (
                  <div className="flex items-center gap-1.5 border-l border-border pl-3">
                    <Switch checked={item.behavioralAnalysis} onCheckedChange={(checked) => onToggleBehavioral(item.id, checked)} className="scale-75" />
                    <span className={`text-[10px] font-medium ${item.behavioralAnalysis ? "text-primary" : "text-muted-foreground"}`}>BİVEYOS</span>
                    {item.behavioralAnalysis && (
                      <Badge className="text-[8px] px-1 py-0 h-3.5 bg-gradient-to-r from-primary to-accent text-primary-foreground border-0">Premium</Badge>
                    )}
                    <div className="group relative">
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                      <div className="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 rounded-lg bg-popover border border-border shadow-lg text-[10px] text-popover-foreground w-48 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                        Gelişmiş AI ile ses, beden dili ve duygu durumu analizi yapar.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isActive && (() => {
              const allSteps: { key: PipelineStep; label: string; icon: typeof Upload }[] =
                isTranscript
                  ? [
                      { key: "upload", label: "Yükleme", icon: CloudUpload },
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

// ── Main Component ─────────────────────────────────────────────────────
const UploadPage = () => {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);

  const setQueueAndRef = useCallback((updater: QueueItem[] | ((prev: QueueItem[]) => QueueItem[])) => {
    setQueue((prev) => {
      const next = typeof updater === "function" ? (updater as (prev: QueueItem[]) => QueueItem[])(prev) : updater;
      queueRef.current = next;
      return next;
    });
  }, []);

  const updateItem = (id: string, updates: Partial<QueueItem>) => {
    setQueueAndRef((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: QueueItem[] = Array.from(files).map((file) => {
      const error = validateFile(file);
      const sourceType = getSourceType(file.name);
      return {
        id: crypto.randomUUID(),
        file,
        title: generateTitle(file.name),
        type: "toplantı" as const,
        behavioralAnalysis: sourceType === "upload_video",
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
  }, [setQueueAndRef]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  }, [addFiles]);

  const removeItem = (id: string) => setQueueAndRef((prev) => prev.filter((item) => item.id !== id));
  const clearCompleted = () => setQueueAndRef((prev) => prev.filter((item) => item.state !== "completed"));
  const resetAll = () => { setQueueAndRef([]); if (fileInputRef.current) fileInputRef.current.value = ""; };

  // ── Processing Pipeline ────────────────────────────────────────────
  const processQueue = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

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

        try {
          const isTranscriptFile = next.sourceType === "upload_transcript";
          const isVideoFile = next.sourceType === "upload_video";
          const isAudioFile = next.sourceType === "upload_audio";

          console.log(`[Upload] Starting: ${next.file.name} (${next.sourceType}, ${next.type}, biveyos=${next.behavioralAnalysis})`);

          // ── Step 1: Upload to storage ──────────────────────────
          updateItem(next.id, { state: "uploading", progress: 5, pipelineStep: "upload", failedStep: null });

          let filePath: string | null = null;
          let rawTranscript = "";

          if (isTranscriptFile) {
            // Read transcript file content directly
            rawTranscript = await next.file.text();
            console.log(`[Upload] Transcript file read, length: ${rawTranscript.length}`);
          } else {
            // Upload media file to storage
            filePath = `${user.id}/${Date.now()}_${next.file.name}`;
            const { error: uploadError } = await supabase.storage
              .from("recordings")
              .upload(filePath, next.file, { cacheControl: "3600", upsert: false });

            if (uploadError) {
              console.error("[Upload] Storage upload failed", uploadError);
              updateItem(next.id, { state: "failed", errorType: classifyError(uploadError, "upload"), failedStep: "upload" });
              continue;
            }
            console.log(`[Upload] File uploaded to storage: ${filePath}`);
          }

          updateItem(next.id, { progress: 20, pipelineStep: isTranscriptFile ? "interpretation" : "audio" });

          // ── Step 2: Create DB record ───────────────────────────
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
            console.error("[Upload] DB insert failed", dbError);
            updateItem(next.id, { state: "failed", errorType: "db_failed", failedStep: "save" });
            continue;
          }

          updateItem(next.id, { recordingId: recording.id });
          console.log(`[Upload] DB record created: ${recording.id}`);

          // ── Step 3: Extract frames (video only + behavioral) ───
          let frames: string[] = [];
          if (isVideoFile && next.behavioralAnalysis) {
            try {
              console.log("[Upload] Extracting frames from video");
              frames = await extractFramesFromVideo(next.file, { count: 5, maxWidth: 960, quality: 0.72 });
              console.log(`[Upload] Frames extracted: ${frames.length}`);
            } catch (frameError) {
              console.warn("[Upload] Frame extraction failed (continuing without)", frameError);
            }
          }

          const recordingInfo = {
            ...buildRecordingInfo(next),
            sourceType: next.sourceType,
          };

          // ── Step 4: Transcription ──────────────────────────────
          let transcript = "";
          let transcriptWarnings: string[] = [];

          if (isTranscriptFile) {
            const normalized = normalizeTranscriptResult(rawTranscript, { provider: "manual" });
            transcript = normalized.text;
            transcriptWarnings = normalized.warnings;
            console.log(`[Upload] Using uploaded transcript, length: ${transcript.length}`);
          } else {
            updateItem(next.id, { state: "analyzing", progress: 35, pipelineStep: "transcription" });

            const transcriptResult = await invokeEdgeFunction<{
              transcript?: string;
              transcriptResult?: TranscriptResult;
              provider?: string;
              providerError?: string;
              warnings?: string[];
            }>(
              EDGE_FUNCTIONS.TRANSCRIBE_RECORDING,
              { filePath, recordingId: recording.id, recordingType: next.type, recordingInfo },
              { maxRetries: 1, timeoutMs: 180000 }
            );

            const normalized = normalizeTranscriptResult(transcriptResult.data, {
              provider: transcriptResult.data?.provider,
              error: transcriptResult.error ? getErrorToastMessage(transcriptResult.error) : undefined,
              warnings: transcriptResult.data?.warnings,
            });
            transcript = normalized.text;
            transcriptWarnings = normalized.warnings;

            if (transcriptResult.error) {
              console.error("[Upload] Transcription error", transcriptResult.error);
            }
            console.log(`[Upload] Transcription result, length: ${transcript.length}, provider=${normalized.provider}, warnings=${transcriptWarnings.length}`);
          }

          // ── Step 5: Facial analysis (video + behavioral only) ──
          let facialAnalysis: AnalysisPayload | null = null;
          if (isVideoFile && next.behavioralAnalysis && frames.length > 0) {
            updateItem(next.id, { progress: 55, pipelineStep: "visual" });

            const facialResult = await invokeEdgeFunction<{ analysis: AnalysisPayload }>(
              EDGE_FUNCTIONS.ANALYZE_FACIAL,
              { frames },
              { maxRetries: 1, timeoutMs: 90000 }
            );

            if (facialResult.error) {
              console.warn("[Upload] Facial analysis failed (continuing)", facialResult.error);
            } else {
              facialAnalysis = facialResult.data?.analysis ?? null;
              console.log("[Upload] Facial analysis complete", facialAnalysis);
            }
          }

          // ── Step 6: Main AI Analysis ───────────────────────────
          updateItem(next.id, {
            progress: isVideoFile && next.behavioralAnalysis ? 70 : 60,
            pipelineStep: "interpretation",
          });

          // ── CREDIT PROTECTION: Don't call AI without valid transcript ──
          if (!isTranscriptUsableForAnalysis(transcript)) {
            console.warn(`[Upload] Transcript too short or empty (${transcript?.length || 0} chars). Skipping AI analysis.`);
            await supabase.from("recordings").update({
              transcript: transcript || null,
              summary: transcript
                ? `Transkript çok kısa. AI analizi için yeterli veri yok. ${transcriptWarnings.slice(0, 2).join(" ")}`
                : "Transkript oluşturulamadı. Lütfen farklı bir dosya deneyin veya metin transkript dosyası yükleyin.",
            }).eq("id", recording.id);

            updateItem(next.id, {
              state: "failed",
              errorType: "transcription_failed",
              failedStep: "transcription",
              progress: 60,
            });
            continue;
          }

          console.log(`[Upload] Transcript validated: ${transcript.length} chars. Proceeding to AI analysis.`);

          const analysisResult = await invokeEdgeFunction<{ analysis: AnalysisPayload }>(
            EDGE_FUNCTIONS.ANALYZE_INTERVIEW,
            {
              transcript,
              recordingInfo,
              behavioralAnalysis: next.behavioralAnalysis && !isTranscriptFile,
              facialAnalysis,
            },
            { maxRetries: 1, timeoutMs: 180000 }
          );

          if (analysisResult.error || !analysisResult.data?.analysis) {
            console.error("[Upload] Analysis error", analysisResult.error);
            await supabase.from("recordings").update({
              transcript,
              summary: "Transkript hazırlandı ancak AI analizi başarısız oldu",
            }).eq("id", recording.id);

            updateItem(next.id, {
              state: "failed",
              errorType: analysisResult.error ? classifyError(analysisResult.error, "analyze") : "ai_processing_failed",
              failedStep: "analyze",
              progress: 70,
            });
            continue;
          }

          // ── Step 7: Save report ────────────────────────────────
          updateItem(next.id, { progress: 92, pipelineStep: "report" });

          const analysis = analysisResult.data.analysis;
          const fullAnalysis = facialAnalysis ? { ...analysis, facial_analysis: facialAnalysis } : analysis;
          const biveyosSignals = extractBiveyosSignals(fullAnalysis, next.type);
          const finalSummary = typeof analysis.summary === "string" ? analysis.summary : "Analiz tamamlandı";

          const { error: updateError } = await supabase.from("recordings").update({
            transcript,
            analysis_data: fullAnalysis,
            summary: finalSummary,
            biveyos_signals: biveyosSignals,
          } as Partial<{
            transcript: string;
            analysis_data: AnalysisPayload;
            summary: string;
            biveyos_signals: unknown;
          }>).eq("id", recording.id);

          if (updateError) {
            console.error("[Upload] DB update failed", updateError);
            updateItem(next.id, { state: "failed", errorType: "db_failed", failedStep: "save" });
            continue;
          }

          console.log(`[Upload] Complete: ${next.title} → ${recording.id}`);
          updateItem(next.id, { state: "completed", progress: 100, pipelineStep: "report" });

        } catch (error: unknown) {
          console.error("[Upload] Unexpected error", error);
          updateItem(next.id, {
            state: "failed",
            errorType: classifyError(error, next.failedStep),
            failedStep: next.failedStep || "upload",
          });
        }
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }

    // Summary toast
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

  // ── Derived state ──────────────────────────────────────────────────
  const queuedCount = queue.filter((item) => item.state === "queued").length;
  const activeCount = queue.filter((item) => item.state === "uploading" || item.state === "analyzing").length;
  const completedCount = queue.filter((item) => item.state === "completed").length;
  const failedCount = queue.filter((item) => item.state === "failed").length;
  const hasItems = queue.length > 0;
  const allDone = hasItems && queuedCount === 0 && activeCount === 0;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Kayıt Yükle"
        description="Ses, video veya transkript dosyası yükleyin — AI otomatik olarak analiz etsin"
      />

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
            {hasItems
              ? "Birden fazla dosya seçebilirsiniz"
              : "Video: MP4, MOV, WebM, MKV, AVI • Ses: MP3, WAV, M4A • Transkript: TXT, VTT • Maks 2GB"}
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
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /><span>{label}</span>
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
              onUpdateTitle={(id, title) => updateItem(id, { title })}
              onUpdateType={(id, type) => setQueueAndRef((prev) => prev.map((q) => q.id === id ? { ...q, type, behavioralAnalysis: type === "mülakat" ? true : q.behavioralAnalysis } : q))}
              onToggleBehavioral={(id, value) => updateItem(id, { behavioralAnalysis: value })}
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
            <Button variant="hero" className="flex-1" onClick={handleStartAll}>
              <Upload className="mr-2 h-4 w-4" />
              {queuedCount === 1 ? "Yükle ve Analiz Et" : `${queuedCount} Dosyayı Yükle ve Analiz Et`}
            </Button>
          )}
          {isProcessing && (
            <div className="flex-1 flex items-center justify-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">İşleniyor... ({activeCount} aktif, {queuedCount} sırada)</span>
            </div>
          )}
          {allDone && completedCount > 0 && (
            <Button variant="hero" className="flex-1" onClick={() => navigate("/dashboard/meetings")}>
              <Sparkles className="mr-2 h-4 w-4" /> Toplantılara Git
            </Button>
          )}
          {allDone && <Button variant="outline" onClick={resetAll}><Upload className="mr-2 h-4 w-4" /> Yeni Yükleme</Button>}
        </div>
      )}
    </div>
  );
};

export default UploadPage;
