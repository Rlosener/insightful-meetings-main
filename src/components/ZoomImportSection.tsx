import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Video, Loader2, FileText, BarChart3, AlertCircle, CheckCircle2, Upload, FileVideo,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";

type ProcessingState = "idle" | "analyzing" | "completed" | "failed";

const formatFileSize = (bytes: number) => {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const parseTranscriptText = (rawText: string, fileName = "") => {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension !== "vtt" && extension !== "srt") {
    return rawText.trim();
  }

  const cleanedLines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line === "WEBVTT") return false;
      if (/^\d+$/.test(line)) return false;
      if (/^NOTE\b/i.test(line)) return false;
      if (/^\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s+-->/i.test(line)) return false;
      if (/^\d{2}:\d{2}[,.]\d{3}\s+-->/i.test(line)) return false;
      return true;
    });

  return cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const safeFileName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "zoom-recording";

const ZoomImportSection = () => {
  const navigate = useNavigate();
  const [processingState, setProcessingState] = useState<ProcessingState>("idle");
  const [failReason, setFailReason] = useState("");
  const [transcript, setTranscript] = useState("");
  const [type, setType] = useState<"toplantı" | "mülakat">("toplantı");
  const [manualTopic, setManualTopic] = useState("");
  const [manualDuration, setManualDuration] = useState("");
  const [manualParticipants, setManualParticipants] = useState("");
  const [recordingFile, setRecordingFile] = useState<File | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);

  const hasTranscript = transcript.trim().length >= 50;

  const reset = () => {
    setProcessingState("idle");
    setFailReason("");
    setTranscript("");
    setManualTopic("");
    setManualDuration("");
    setManualParticipants("");
    setRecordingFile(null);
    setTranscriptFile(null);
  };

  const handleTranscriptFile = async (file: File | null) => {
    setTranscriptFile(file);
    if (!file) {
      setTranscript("");
      return;
    }

    const text = await file.text();
    const parsed = parseTranscriptText(text, file.name);
    setTranscript(parsed);
    if (parsed.length >= 50) {
      toast.success("Zoom transkript dosyası yüklendi.");
    } else {
      toast.warning("Transkript dosyası çok kısa görünüyor. Analiz için en az 50 karakter gerekir.");
    }
  };

  const analyzeAndSave = async () => {
    if (!recordingFile) {
      toast.error("Lütfen Zoom kayıt dosyasını yükleyin.");
      return;
    }

    if (!hasTranscript) {
      toast.error("Transkript yok veya çok kısa. Gerçek transkript olmadan analiz yapılamaz.");
      return;
    }

    setProcessingState("analyzing");
    setFailReason("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProcessingState("failed");
        setFailReason("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
        return;
      }

      const participants = manualParticipants
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

      const filePath = `${user.id}/zoom-upload-${Date.now()}-${safeFileName(recordingFile.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("recordings")
        .upload(filePath, recordingFile, { contentType: recordingFile.type || "application/octet-stream", upsert: false });

      if (uploadError) {
        setProcessingState("failed");
        setFailReason("Zoom kayıt dosyası yüklenemedi.");
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from("recordings").getPublicUrl(filePath);
      const title = manualTopic.trim() || recordingFile.name || "Zoom Kaydı";
      const duration = manualDuration.trim() || null;

      const { data: recording, error: saveError } = await supabase
        .from("recordings")
        .insert({
          title,
          type,
          transcript: transcript.trim(),
          user_id: user.id,
          duration,
          video_url: publicUrl,
          summary: `Zoom kayıt ve transkript dosyası yüklenerek içe aktarıldı. Katılımcı: ${participants.length}. Analiz hazırlanıyor...`,
        })
        .select()
        .single();

      if (saveError) {
        setProcessingState("failed");
        setFailReason("Kayıt veritabanına eklenemedi.");
        return;
      }

      const participantContext = participants.length > 0
        ? `\n\nKATILIMCILAR:\n${participants.map((participant) => `- ${participant}`).join("\n")}`
        : "";

      const recordingInfo = type === "mülakat"
        ? {
            type: "mülakat",
            sourceType: "zoom_upload",
            transcriptSource: "uploaded_zoom_transcript",
          }
        : {
            type: "toplantı",
            meetingTopic: title,
            participants,
            sourceType: "zoom_upload",
            transcriptSource: "uploaded_zoom_transcript",
          };

      const analysisResult = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_INTERVIEW, {
        transcript: `${transcript.trim()}${participantContext}`,
        recordingInfo,
      });

      if (analysisResult.error || !analysisResult.data?.analysis) {
        await supabase.from("recordings").update({
          summary: "Zoom transkripti kaydedildi ancak AI analizi başarısız oldu.",
        }).eq("id", recording.id);

        setProcessingState("failed");
        setFailReason(analysisResult.error ? getErrorToastMessage(analysisResult.error) : "AI analiz yanıt vermedi.");
        return;
      }

      await supabase.from("recordings").update({
        analysis_data: analysisResult.data.analysis,
        summary: analysisResult.data.analysis.summary || "Analiz tamamlandı",
        biveyos_signals: {
          metadata: {
            source_type: "zoom_upload",
            transcript_source: "uploaded_zoom_transcript",
            uploaded_recording_file: recordingFile.name,
            uploaded_transcript_file: transcriptFile?.name || null,
          },
        },
      }).eq("id", recording.id);

      setProcessingState("completed");
      toast.success("Analiz tamamlandı!");

      setTimeout(() => {
        navigate(`/dashboard/meetings/${recording.id}`);
      }, 1500);
    } catch (error: unknown) {
      console.error("[ZoomImport] Analysis error:", error);
      setProcessingState("failed");
      setFailReason(getErrorMessage(error, "Analiz sırasında hata oluştu"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Video className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold mb-0.5">Zoom Kayıt Yükleme</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Zoom kayıt dosyasını ve Zoom transkript dosyasını yükleyerek toplantı veya mülakat analizi başlatın.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>Analiz Türü</Label>
            <div className="flex gap-3">
              {(["toplantı", "mülakat"] as const).map((nextType) => (
                <button
                  key={nextType}
                  type="button"
                  onClick={() => setType(nextType)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    type === nextType ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {nextType === "toplantı" ? "Toplantı" : "Mülakat"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Zoom Kayıt Dosyası</Label>
            <Input
              type="file"
              accept="video/*,audio/*,.mp4,.m4a,.mp3,.webm,.wav"
              onChange={(event) => setRecordingFile(event.target.files?.[0] || null)}
              disabled={processingState === "analyzing"}
            />
            {recordingFile && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <FileVideo className="h-4 w-4 text-primary" />
                <span className="font-medium">{recordingFile.name}</span>
                <span className="text-xs text-muted-foreground">{formatFileSize(recordingFile.size)}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Zoom Transkript Dosyası</Label>
            <Input
              type="file"
              accept=".vtt,.srt,.txt,.text"
              onChange={(event) => handleTranscriptFile(event.target.files?.[0] || null)}
              disabled={processingState === "analyzing"}
            />
            {transcriptFile && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium">{transcriptFile.name}</span>
                <span className="text-xs text-muted-foreground">{formatFileSize(transcriptFile.size)}</span>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="manualTopic">Başlık</Label>
              <Input
                id="manualTopic"
                value={manualTopic}
                onChange={(event) => setManualTopic(event.target.value)}
                placeholder="örn. Zoom Satış Toplantısı"
                disabled={processingState === "analyzing"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manualDuration">Süre</Label>
              <Input
                id="manualDuration"
                value={manualDuration}
                onChange={(event) => setManualDuration(event.target.value)}
                placeholder="örn. 42 dk veya 00:42"
                disabled={processingState === "analyzing"}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manualParticipants">Katılımcılar</Label>
            <Input
              id="manualParticipants"
              value={manualParticipants}
              onChange={(event) => setManualParticipants(event.target.value)}
              placeholder="Virgül veya satır ile ayırın"
              disabled={processingState === "analyzing"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manualTranscript">Transkript Önizleme / Düzeltme</Label>
            <Textarea
              id="manualTranscript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="Zoom transkriptini buraya yapıştırabilir veya dosya yükleyebilirsiniz..."
              className="min-h-[180px]"
              disabled={processingState === "analyzing"}
            />
            <p className="text-xs text-muted-foreground">{transcript.trim().length} karakter</p>
          </div>

          <Button
            variant="hero"
            className="w-full"
            onClick={analyzeAndSave}
            disabled={processingState === "analyzing" || !recordingFile || !hasTranscript}
          >
            {processingState === "analyzing" ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analiz Ediliyor...</>
            ) : (
              <><BarChart3 className="h-4 w-4 mr-2" /> Kayıt ve Transkript ile Analiz Et</>
            )}
          </Button>
        </CardContent>
      </Card>

      {processingState === "failed" && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">İşlem Başarısız</p>
            <p className="text-xs text-muted-foreground mt-1">{failReason}</p>
            <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={reset}>
              Tekrar Dene
            </Button>
          </div>
        </div>
      )}

      {processingState === "completed" && (
        <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/5 p-4">
          <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] shrink-0" />
          <div>
            <p className="text-sm font-medium text-[hsl(var(--success))]">Analiz Tamamlandı</p>
            <p className="text-xs text-muted-foreground mt-0.5">Rapor sayfasına yönlendiriliyorsunuz...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZoomImportSection;
