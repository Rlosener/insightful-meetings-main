import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Globe, Upload, Loader2, AlertCircle, CheckCircle2, BarChart3,
  FileText, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";

type ProcessingState = "idle" | "uploading" | "analyzing" | "completed" | "failed";

const ACCEPTED_TRANSCRIPT_FORMATS = ".txt,.vtt,.srt";
const MAX_TRANSCRIPT_FILE_SIZE = 50 * 1024 * 1024; // 50MB for text files

// Clean VTT/SRT timestamps
const cleanTranscriptText = (raw: string): string => {
  return raw
    .replace(/^WEBVTT.*$/m, "")
    .replace(/^\d+$/gm, "")
    .replace(/\d{2}:\d{2}[:.]\d{3}\s*-->\s*\d{2}:\d{2}[:.]\d{3}/g, "")
    .replace(/\d{2}:\d{2}:\d{2}[:.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[:.]\d{3}/g, "")
    .replace(/^NOTE\s.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const GoogleMeetSection = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transcript, setTranscript] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [type, setType] = useState<"toplantı" | "mülakat">("toplantı");
  const [processingState, setProcessingState] = useState<ProcessingState>("idle");
  const [failReason, setFailReason] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");

  const reset = () => {
    setTranscript("");
    setMeetingTitle("");
    setUploadedFileName("");
    setProcessingState("idle");
    setFailReason("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_TRANSCRIPT_FILE_SIZE) {
      toast.error("Dosya çok büyük (maks 50MB)");
      return;
    }

    try {
      const text = await file.text();
      const cleaned = cleanTranscriptText(text);
      setTranscript(cleaned);
      setUploadedFileName(file.name);

      if (!meetingTitle) {
        setMeetingTitle(file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "));
      }

      toast.success("Transkript dosyası yüklendi");
    } catch {
      toast.error("Dosya okunamadı");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const analyzeTranscript = async () => {
    const trimmed = transcript.trim();

    if (!trimmed || trimmed.length < 50) {
      toast.error("Transkript çok kısa veya boş. En az 50 karakter gerekli.");
      return;
    }

    if (!meetingTitle.trim()) {
      toast.error("Lütfen toplantı başlığı girin");
      return;
    }

    setProcessingState("uploading");
    setFailReason("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProcessingState("failed");
        setFailReason("Oturum bulunamadı.");
        return;
      }

      // Save recording
      const { data: recording, error: saveError } = await supabase
        .from("recordings")
        .insert({
          title: meetingTitle.trim(),
          type,
          transcript: trimmed,
          user_id: user.id,
          summary: "Google Meet transkripti yüklendi, analiz hazırlanıyor...",
        })
        .select()
        .single();

      if (saveError || !recording) {
        setProcessingState("failed");
        setFailReason("Kayıt oluşturulamadı.");
        return;
      }

      setProcessingState("analyzing");

      // Analyze
      const analysisResult = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_INTERVIEW, {
        transcript: trimmed,
        recordingInfo: {
          type,
          meetingTopic: meetingTitle.trim(),
          sourceType: "google_meet",
        },
      });

      if (analysisResult.error || !analysisResult.data?.analysis) {
        await supabase.from("recordings").update({
          summary: "Transkript yüklendi ancak AI analizi başarısız oldu.",
        }).eq("id", recording.id);

        setProcessingState("failed");
        setFailReason(analysisResult.error ? getErrorToastMessage(analysisResult.error) : "AI analiz yanıt vermedi.");
        return;
      }

      await supabase.from("recordings").update({
        analysis_data: analysisResult.data.analysis,
        summary: analysisResult.data.analysis.summary || "Analiz tamamlandı",
      }).eq("id", recording.id);

      setProcessingState("completed");
      toast.success("Analiz tamamlandı!");

      setTimeout(() => {
        navigate(`/dashboard/meetings/${recording.id}`);
      }, 1500);
    } catch (error: any) {
      console.error("[GoogleMeet] Error:", error);
      setProcessingState("failed");
      setFailReason(error.message || "Beklenmeyen hata oluştu");
    }
  };

  const hasTranscript = transcript.trim().length >= 50;
  const isProcessing = processingState === "uploading" || processingState === "analyzing";

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Globe className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold mb-0.5">Google Meet Analizi</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Google Meet transkript dosyasını (.txt, .vtt, .srt) yükleyin veya transkript metnini yapıştırın.
              AI otomatik olarak analiz raporu oluşturacak.
            </p>
          </div>
        </div>
      </div>

      {/* Failed state */}
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

      {/* Completed state */}
      {processingState === "completed" && (
        <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/5 p-4">
          <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] shrink-0" />
          <div>
            <p className="text-sm font-medium text-[hsl(var(--success))]">Analiz Tamamlandı</p>
            <p className="text-xs text-muted-foreground mt-0.5">Rapor sayfasına yönlendiriliyorsunuz...</p>
          </div>
        </div>
      )}

      {processingState !== "completed" && (
        <Card>
          <CardContent className="pt-6 space-y-5">
            {/* Title */}
            <div className="space-y-2">
              <Label>Toplantı Başlığı</Label>
              <input
                type="text"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="Örn: Sprint Planning - 20 Mart"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={isProcessing}
              />
            </div>

            {/* Type selector */}
            <div className="space-y-2">
              <Label>Analiz Türü</Label>
              <div className="flex gap-3">
                {(["toplantı", "mülakat"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    disabled={isProcessing}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "toplantı" ? "Toplantı" : "Mülakat"}
                  </button>
                ))}
              </div>
            </div>

            {/* File upload */}
            <div className="space-y-2">
              <Label>Transkript Dosyası Yükle</Label>
              <div
                className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-all"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">
                  {uploadedFileName || "Dosya seçin veya sürükleyin"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  TXT, VTT, SRT • Maks 50MB
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TRANSCRIPT_FORMATS}
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {/* Or paste */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">veya yapıştırın</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Textarea
                placeholder="Google Meet transkript metnini buraya yapıştırın..."
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={8}
                className="font-mono text-xs"
                disabled={isProcessing}
              />
              {transcript && (
                <p className="text-[10px] text-muted-foreground">
                  {transcript.trim().length} karakter
                  {transcript.trim().length < 50 && " • En az 50 karakter gerekli"}
                </p>
              )}
            </div>

            {/* Analyze button */}
            <Button
              variant="hero"
              className="w-full"
              onClick={analyzeTranscript}
              disabled={isProcessing || !hasTranscript || !meetingTitle.trim()}
            >
              {processingState === "uploading" ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Kaydediliyor...</>
              ) : processingState === "analyzing" ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> AI Analiz Yapıyor...</>
              ) : (
                <><BarChart3 className="h-4 w-4 mr-2" /> AI ile Analiz Et</>
              )}
            </Button>

            {!hasTranscript && transcript.length > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Transkript çok kısa. Gerçek transkript olmadan analiz yapılamaz.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GoogleMeetSection;
