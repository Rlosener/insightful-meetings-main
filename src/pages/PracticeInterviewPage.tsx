import { useState, useRef, useCallback, useEffect, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Video, Square, Camera, Loader2, Clock, RotateCcw, CheckCircle2, ArrowRight,
  Mic, Briefcase, GraduationCap, Lightbulb, ChevronRight, ChevronLeft,
  Target, TrendingUp, BookOpen, Shield, AlertTriangle, Zap, Award, Brain,
  MapPin, DollarSign, Users, Rocket, Play, Timer
} from "lucide-react";
import PostSessionActions from "@/components/coach/PostSessionActions";
import { TranscriptViewer } from "@/components/TranscriptViewer";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { captureVideoFrameDataUrl, sampleLatestFrames } from "@/lib/frameSampling";
import { attachStreamAndPlay } from "@/lib/mediaPlayback";
import { formatTranscriptionFailure, type TranscriptionInvokePayload } from "@/features/transcription/services/transcriptionErrors";
import { isTranscriptUsableForAnalysis, normalizeTranscriptResult } from "@/features/transcription/services/transcriptionNormalizer";
import { getAudioExtensionByMime, normalizeAudioMimeType } from "@/features/transcription/services/audioMime";
import type { TranscriptPipelineStatus, TranscriptResult } from "@/features/transcription/types";

type PracticeState = "setup" | "loading-questions" | "countdown" | "idle" | "previewing" | "recording" | "recorded" | "analyzing" | "done";

interface TranscriptEntry { speaker: string; text: string; timestamp: number; }
interface PracticeQuestion {
  category: string;
  question: string;
  difficulty: string;
  tip: string;
  questionType?: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionErrorLike { error?: string; }
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
interface SpeechRecognitionConstructor { new (): SpeechRecognitionLike; }
type WindowWithSpeechRecognition = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};
interface PracticeAnalysisScores {
  communication_score?: number;
  technical_score?: number;
  confidence_score?: number;
  body_language_score?: number;
  problem_solving_score?: number;
  interview_readiness?: string;
  summary?: string;
  position_fit?: string;
  [key: string]: unknown;
}
interface PracticeCharacterAnalysis {
  overall_score?: number;
  character_summary?: string;
  communication_style?: string;
  thinking_style?: string;
  stress_management?: string;
  emotional_intelligence?: string;
  interview_strengths?: string[];
  interview_weaknesses?: string[];
  weaknesses?: string[];
  behavioral_patterns?: string[];
  [key: string]: unknown;
}
interface AnswerFeedback {
  question?: string;
  score?: number;
  good?: string;
  missing?: string;
  how_to_improve?: string;
  better_answer?: string;
}
interface WeaknessRecommendation {
  weakness?: string;
  suggestion?: string;
  example?: string;
  tip?: string;
}
interface SkillDevelopment {
  skill?: string;
  current_level?: number;
  target_level?: number;
}
interface CareerManagement {
  current_level?: string;
  short_term_goals?: string[];
  mid_term_goals?: string[];
  long_term_goals?: string[];
  skill_development?: SkillDevelopment[];
}
interface ActionPlan {
  immediate?: string[];
  before_next_interview?: string[];
  practice_exercises?: string[];
}
interface PracticeAnalysisData {
  analysis: PracticeAnalysisScores;
  character_analysis: PracticeCharacterAnalysis;
  answer_feedback?: AnswerFeedback[];
  improvement_system?: { top_weaknesses?: WeaknessRecommendation[] };
  swot?: Record<string, string[]>;
  career_management?: CareerManagement;
  action_plan?: ActionPlan;
  [key: string]: unknown;
}

const chooseAudioMimeType = () => {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const extensionForBlob = (blob: Blob) => {
  if (blob.type.startsWith("audio/")) return getAudioExtensionByMime(normalizeAudioMimeType(blob.type));
  return "webm";
};
const FRAME_CAPTURE_INTERVAL_MS = 2000;
const FACIAL_ANALYSIS_FRAME_COUNT = 4;

const transcriptStatusLabels: Record<TranscriptPipelineStatus, string> = {
  idle: "Hazır",
  live_starting: "Canlı transkript başlatılıyor",
  live_active: "Canlı transkript açık",
  live_unsupported: "Canlı destek yok",
  recording: "Kayıt alınıyor",
  final_preparing: "Kesin transkript hazırlanıyor",
  completed: "Kesin transkript hazır",
  partial: "Kısmi transkript tamamlandı",
  failed: "Transkript başarısız",
  final_done: "Kesin transkript hazır",
  final_failed: "Transkript başarısız",
  insufficient: "Transkript yetersiz",
};

const averageScore = (values: unknown[]) => {
  const scores = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return scores.length > 0 ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 55;
};

const buildFallbackPracticeCharacterAnalysis = (analysis: PracticeAnalysisScores | undefined, transcript: string): PracticeCharacterAnalysis => {
  const score = averageScore([
    analysis?.communication_score,
    analysis?.confidence_score,
    analysis?.clarity_score,
    analysis?.technical_score,
    analysis?.body_language_score,
    analysis?.problem_solving_score,
  ]);
  const transcriptSignal = transcript.length > 800
    ? "Yanıtlar analiz için yeterli uzunlukta; değerlendirme transkript ve skor sinyallerine göre oluşturuldu."
    : "Transkript kısa olduğu için karakter yorumu sınırlı güvenle değerlendirilmelidir.";

  return {
    overall_score: score,
    character_summary: `${transcriptSignal} Genel profil, mülakat pratiğindeki iletişim netliği, özgüven ve cevap yapılandırma sinyallerine dayanır.`,
    communication_style: analysis?.summary || "İletişim tarzı için temel transkript sinyalleri kullanıldı; daha net sonuç için daha uzun cevaplar gerekli.",
    thinking_style: analysis?.question_handling || "Düşünme tarzı, cevapların yapı ve örnek derinliği üzerinden sınırlı olarak çıkarıldı.",
    interview_strengths: ["Pratik oturumu tamamlandı", "Analize uygun transkript üretildi"],
    interview_weaknesses: analysis?.improvement_areas?.slice?.(0, 3) || ["Daha somut örnek ve ölçülebilir sonuç eklenmeli"],
    behavioral_patterns: ["Yanıt yapısı ve iletişim netliği üzerinden davranış sinyali okundu"],
    stress_management: score >= 70 ? "Genel performans baskı altında yönetilebilir görünüyor." : "Baskı altında cevap yapılandırma ayrıca çalışılmalı.",
    emotional_intelligence: "Duygusal zeka çıkarımı yalnızca mülakat yanıtlarının dili üzerinden sınırlı olarak yapılmıştır.",
    hireability_signals: analysis?.position_fit || "Pozisyon uyumu için daha fazla pratik verisi gerekli.",
    personality_traits: ["Pratik odaklı", "Gelişime açık", "Yapılandırılabilir iletişim", "Kanıt ihtiyacı yüksek"],
    strengths: ["Analiz akışını tamamladı"],
    weaknesses: analysis?.improvement_areas?.slice?.(0, 3) || ["Cevap kanıtlarını güçlendirme"],
    recommendations: analysis?.improvement_areas?.slice?.(0, 3) || ["STAR formatıyla daha uzun cevaplar verin"],
  };
};

const PracticeInterviewPage = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<PracticeState>("setup");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [skills, setSkills] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [interviewStyle, setInterviewStyle] = useState("formal");
  const [questionCount, setQuestionCount] = useState("12");
  const [targetCompany, setTargetCompany] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [duration, setDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState("");
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptPipelineStatus>("idle");
  const [transcriptWarnings, setTranscriptWarnings] = useState<string[]>([]);
  const [transcriptProviderLabel, setTranscriptProviderLabel] = useState("");
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [analysisData, setAnalysisData] = useState<PracticeAnalysisData | null>(null);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [countdownValue, setCountdownValue] = useState(5);

  // Questions state
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(new Set());
  const [showQuestions, setShowQuestions] = useState(true);
  const [showTip, setShowTip] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);

  const stopStream = useCallback(() => {
    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
      audioRecorderRef.current.onstop = null;
      audioRecorderRef.current.stop();
    }
    audioRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!position.trim()) { toast.error("Pozisyon gerekli"); return; }
    setState("loading-questions");

    try {
      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.GENERATE_QUESTIONS, {
        position,
        department,
        experienceYears,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        difficulty,
        interviewStyle,
        questionCount: parseInt(questionCount),
        targetCompany: targetCompany.trim() || undefined,
        userNotes: userNotes.trim() || undefined,
      });
      if (result.error) { toast.error(getErrorToastMessage(result.error)); setState("setup"); return; }
      setQuestions(result.data.questions || []);
      toast.success(`${result.data.questions?.length || 0} mülakat sorusu oluşturuldu!`);
    } catch (err) {
      console.error(err);
      toast.error("Sorular oluşturulamadı, yine de devam edebilirsiniz");
    }
    // Start countdown
    setState("countdown");
    setCountdownValue(5);
  };

  // Countdown effect
  useEffect(() => {
    if (state !== "countdown") return;
    if (countdownValue <= 0) {
      setState("idle");
      return;
    }
    const t = setTimeout(() => setCountdownValue((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [state, countdownValue]);

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { await attachStreamAndPlay(videoRef.current, stream, "practice camera preview"); }
      setState("previewing");
    } catch { toast.error("Kamera erişimi reddedildi"); }
  };

  const captureFrame = useCallback(() => {
    const frameDataUrl = captureVideoFrameDataUrl(videoRef.current);
    if (frameDataUrl) setCapturedFrames((previous) => [...previous, frameDataUrl].slice(-90));
  }, []);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    audioChunksRef.current = [];
    setTranscript("");
    setTranscriptStatus("recording");
    setTranscriptWarnings([]);
    setTranscriptProviderLabel("");
    setTranscriptEntries([]);
    setCapturedFrames([]);
    durationRef.current = 0;

    const SpeechRecognition = (window as WindowWithSpeechRecognition).SpeechRecognition
      || (window as WindowWithSpeechRecognition).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setTranscriptStatus("live_starting");
      const recognition = new SpeechRecognition();
      recognition.continuous = true; recognition.interimResults = true; recognition.lang = "tr-TR";
      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let final = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) final += event.results[i][0].transcript + " ";
          else interim += event.results[i][0].transcript + " ";
        }
        if (final.trim()) {
          setTranscriptStatus("live_active");
          const entry: TranscriptEntry = { speaker: "Ben", text: final.trim(), timestamp: durationRef.current };
          setTranscriptEntries((p) => [...p, entry]);
          setTranscript((previous) => {
            const cleaned = previous.replace(/\n\n\[Canlı Taslak\]:.*$/s, "").trim();
            return `${cleaned ? `${cleaned}\n\n` : ""}[Ben]: ${final.trim()}\n\n`;
          });
        } else if (interim.trim()) {
          setTranscriptStatus("live_active");
          setTranscript((previous) => [
            previous.replace(/\n\n\[Canlı Taslak\]:.*$/s, "").trim(),
            `[Canlı Taslak]: ${interim.trim()}`,
          ].filter(Boolean).join("\n\n"));
        }
      };
      recognition.onerror = (e: SpeechRecognitionErrorLike) => {
        console.error("Speech error:", e.error);
        const message = e.error === "not-allowed"
          ? "Tarayıcı canlı transkript için mikrofon izni vermedi."
          : "Canlı transkript kesildi. Nihai transkript kayıt sonundaki ses dosyasından hazırlanacak.";
        setTranscriptWarnings((previous) => Array.from(new Set([...previous, message])));
        setTranscript((previous) => previous.trim() ? previous : `[Canlı Transkript Uyarısı]\n${message}`);
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        if (mediaRecorderRef.current?.state !== "recording") return;
        window.setTimeout(() => {
          if (recognitionRef.current !== recognition) return;
          try { recognition.start(); } catch (error) { console.warn("Practice speech restart failed", error); }
        }, 500);
      };
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (error) {
        console.warn("Practice speech start failed", error);
        recognitionRef.current = null;
        const message = "Tarayıcı canlı transkripti başlatamadı. Kayıt sonunda ses dosyasından transkript hazırlanacak.";
        setTranscriptStatus("live_unsupported");
        setTranscriptWarnings((previous) => Array.from(new Set([...previous, message])));
        setTranscript(`[Canlı Transkript Uyarısı]\n${message}`);
      }
    } else {
      const message = "Tarayıcı canlı transkript desteği sunmuyor. Kayıt bitince mikrofon sesinden transkript hazırlanacak.";
      setTranscriptStatus("live_unsupported");
      setTranscriptWarnings((previous) => Array.from(new Set([...previous, message])));
      setTranscript(`[Sistem]\n${message}`);
    }

    frameIntervalRef.current = setInterval(captureFrame, FRAME_CAPTURE_INTERVAL_MS);

    const mr = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm",
    });
    const audioTracks = streamRef.current.getAudioTracks();
    if (audioTracks.length > 0) {
      const audioMimeType = chooseAudioMimeType();
      const audioRecorder = new MediaRecorder(new MediaStream(audioTracks), audioMimeType ? { mimeType: audioMimeType } : undefined);
      audioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      audioRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: audioMimeType || "audio/webm" });
        if (audioBlob.size > 0) setRecordedAudioBlob(audioBlob);
      };
      audioRecorderRef.current = audioRecorder;
      audioRecorder.start(1000);
    }
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      setState("recorded");
      if (playbackRef.current) playbackRef.current.src = URL.createObjectURL(blob);
    };
    mediaRecorderRef.current = mr;
    mr.start(1000);
    setState("recording");
    setDuration(0);
    timerRef.current = setInterval(() => setDuration((p) => {
      const next = p + 1;
      durationRef.current = next;
      return next;
    }), 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
      audioRecorderRef.current.stop();
    }
    audioRecorderRef.current = null;
    recognitionRef.current?.stop(); recognitionRef.current = null;
    if (frameIntervalRef.current) { clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
    stopStream();
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const toggleAnswered = (idx: number) => {
    setAnsweredQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const startAnalysis = async () => {
    if (!recordedBlob) { toast.error("Kayıt bulunamadı"); return; }
    setState("analyzing");
    setTranscriptStatus("final_preparing");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Giriş yapın"); setState("recorded"); return; }

      let analysisTranscript = transcript.trim();
      if (!isTranscriptUsableForAnalysis(analysisTranscript)) {
        toast.info("Canlı transkript yeterli değil. Kayıttaki sesten transkript hazırlanıyor.");
        const transcriptionBlob = recordedAudioBlob
          || (audioChunksRef.current.length > 0 ? new Blob(audioChunksRef.current, { type: "audio/webm" }) : null)
          || recordedBlob;
        if (!transcriptionBlob || transcriptionBlob.size < 1024) {
          const message = "Ses kaydı alınamadı veya dosya çok küçük.";
          setTranscript(`[Transkript Hatası]\n${message}`);
          setTranscriptStatus("final_failed");
          setTranscriptWarnings((previous) => Array.from(new Set([...previous, message])));
          toast.error(message);
          setState("recorded");
          return;
        }
        const fileName = `${user.id}/practice-${Date.now()}.${extensionForBlob(transcriptionBlob)}`;
        const normalizedContentType = transcriptionBlob.type.startsWith("audio/")
          ? normalizeAudioMimeType(transcriptionBlob.type)
          : transcriptionBlob.type || "application/octet-stream";
        const { error: uploadError } = await supabase.storage
          .from("recordings")
          .upload(fileName, transcriptionBlob, { contentType: normalizedContentType, upsert: false });
        if (uploadError) throw uploadError;

        const transcriptResult = await invokeEdgeFunction<TranscriptionInvokePayload & {
          transcriptResult?: TranscriptResult;
        }>(EDGE_FUNCTIONS.TRANSCRIBE_RECORDING, {
          filePath: fileName,
          recordingType: "mülakat",
          participants: ["Ben"],
          recordingInfo: {
            type: "mülakat",
            position,
            department,
            experienceYears,
            requiredSkills: skills.split(",").map((s) => s.trim()).filter(Boolean),
          },
        }, { maxRetries: 1, timeoutMs: 180000 });

        const normalizedTranscript = normalizeTranscriptResult(transcriptResult.data, {
          provider: transcriptResult.data?.provider,
          error: transcriptResult.error ? getErrorToastMessage(transcriptResult.error) : undefined,
          warnings: transcriptResult.data?.warnings,
        });

        setTranscriptWarnings((previous) => Array.from(new Set([...previous, ...normalizedTranscript.warnings])));
        setTranscriptProviderLabel(`Provider: ${normalizedTranscript.provider || "bilinmiyor"}`);

        if (transcriptResult.error || !normalizedTranscript.text.trim()) {
          const message = transcriptResult.error
            ? formatTranscriptionFailure(transcriptResult.error, transcriptResult.data)
            : "Transkript oluşturulamadı.";
          setTranscript(`[Transkript Hatası]\n${message}\n\nSes dosyası: ${Math.round(transcriptionBlob.size / 1024)} KB, format: ${transcriptionBlob.type || "bilinmiyor"}`);
          setTranscriptStatus("final_failed");
          toast.error(message);
          setState("recorded");
          return;
        }

        analysisTranscript = normalizedTranscript.text.trim();
        setTranscript(analysisTranscript);
      }

      if (!isTranscriptUsableForAnalysis(analysisTranscript)) {
        setTranscriptStatus("insufficient");
        toast.error("Karakter analizi için yeterli transkript oluşmadı. Mikrofonu kontrol edip tekrar deneyin.");
        setState("recorded");
        return;
      }

      setTranscriptStatus("final_done");

      const aiResult = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_PRACTICE, {
        transcript: analysisTranscript,
        position,
        department,
        experienceYears,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        frames: sampleLatestFrames(capturedFrames, FACIAL_ANALYSIS_FRAME_COUNT),
        questionsAsked: answeredQuestions.size,
        totalQuestions: questions.length,
        difficulty,
        interviewStyle,
      });
      if (aiResult.error) { toast.error(getErrorToastMessage(aiResult.error)); setState("recorded"); return; }
      const aiData = aiResult.data as PracticeAnalysisData;
      const characterAnalysis = aiData.character_analysis || buildFallbackPracticeCharacterAnalysis(aiData.analysis, analysisTranscript);
      const completedAnalysisData: PracticeAnalysisData = { ...aiData, character_analysis: characterAnalysis };

      const { error: dbError } = await supabase.from("practice_interviews").insert({
        user_id: user.id,
        position,
        department: department || null,
        experience_years: experienceYears || null,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        transcript: analysisTranscript,
        duration: formatTime(duration),
        analysis_data: aiData.analysis,
        character_analysis: characterAnalysis,
      });
      if (dbError) throw dbError;

      setAnalysisData(completedAnalysisData);
      setState("done");
      toast.success("Analiz tamamlandı!");
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Rate limit")) toast.error("AI istek limiti aşıldı.");
      else if (message.includes("Payment required")) toast.error("AI kredisi tükendi.");
      else toast.error("Analiz sırasında hata oluştu");
      setState("recorded");
    }
  };

  const reset = () => {
    stopStream();
    setRecordedBlob(null); setRecordedAudioBlob(null); setDuration(0); setTranscript(""); setTranscriptStatus("idle"); setTranscriptWarnings([]); setTranscriptProviderLabel(""); setTranscriptEntries([]);
    setCapturedFrames([]); setAnalysisData(null); setQuestions([]); setAnsweredQuestions(new Set());
    setCurrentQuestionIdx(0); setShowTip(false);
    setState("setup");
  };

  const showCameraArea = !["setup", "loading-questions", "countdown"].includes(state);

  // Group questions by category
  const groupedQuestions = questions.reduce<Record<string, { q: PracticeQuestion; idx: number }[]>>((acc, q, i) => {
    if (!acc[q.category]) acc[q.category] = [];
    acc[q.category].push({ q, idx: i });
    return acc;
  }, {});

  const difficultyColor = (d: string) => {
    if (d === "easy" || d === "kolay") return "text-[hsl(var(--success,142_71%_45%))]";
    if (d === "medium" || d === "orta") return "text-accent";
    return "text-destructive";
  };

  const styleLabels: Record<string, string> = {
    formal: "Resmi & Profesyonel",
    conversational: "Samimi & Sohbet",
    challenging: "Zorlayıcı & Provokatif",
    executive: "Üst Yönetim",
  };

  const ScoreCard = ({ label, score, icon: Icon }: { label: string; score: number; icon: ComponentType<{ className?: string }> }) => (
    <div className="rounded-lg border border-border bg-card p-4 text-center space-y-2">
      <Icon className="h-5 w-5 mx-auto text-muted-foreground" />
      <div className="font-display text-2xl font-bold text-primary">{score}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <Progress value={score} className="h-1.5" />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">Pratik Mülakat 🎤</h1>
        <p className="text-muted-foreground text-sm">
          {state === "setup" ? "Hedef pozisyonunuzu girin ve pratik yapmaya başlayın" :
           state === "loading-questions" ? "AI mülakat soruları oluşturuluyor..." :
           state === "countdown" ? "Mülakat başlıyor..." :
           `${position} pozisyonu için pratik`}
        </p>
      </div>

      {/* Setup */}
      {state === "setup" && (
        <form onSubmit={handleSetup} className="rounded-xl border border-border bg-card p-6 shadow-card space-y-5">
          {/* AI Interviewer Persona */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold">AI Mülakatçı</h3>
              <p className="text-xs text-muted-foreground">Gerçek mülakat deneyimi sunan yapay zeka destekli mülakatçı. Sorular pozisyonunuza ve deneyiminize göre uyarlanır.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label><Briefcase className="inline h-4 w-4 mr-1" />Hedef Pozisyon *</Label>
              <Input placeholder="Örn: Frontend Developer" value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Departman</Label>
              <Input placeholder="Örn: Yazılım" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label><GraduationCap className="inline h-4 w-4 mr-1" />Deneyim (Yıl)</Label>
              <Input placeholder="Örn: 3" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Yetenekler (virgülle ayırın)</Label>
              <Input placeholder="React, TypeScript, Node.js" value={skills} onChange={(e) => setSkills(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label><MapPin className="inline h-4 w-4 mr-1" />Hedef Şirket <span className="text-muted-foreground text-xs">(opsiyonel)</span></Label>
              <Input placeholder="Örn: Google, Trendyol, Getir" value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label><BookOpen className="inline h-4 w-4 mr-1" />Kendiniz Hakkında Kısa Notlar <span className="text-muted-foreground text-xs">(opsiyonel)</span></Label>
              <Input placeholder="Güçlü yönler, endişeler, odak alanları..." value={userNotes} onChange={(e) => setUserNotes(e.target.value)} />
            </div>
          </div>

          {/* Advanced Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border">
            <div className="space-y-2">
              <Label className="text-xs">Zorluk Seviyesi</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">🟢 Kolay</SelectItem>
                  <SelectItem value="medium">🟡 Orta</SelectItem>
                  <SelectItem value="hard">🔴 Zor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Mülakat Tarzı</Label>
              <Select value={interviewStyle} onValueChange={setInterviewStyle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Resmi & Profesyonel</SelectItem>
                  <SelectItem value="conversational">Samimi & Sohbet</SelectItem>
                  <SelectItem value="challenging">Zorlayıcı</SelectItem>
                  <SelectItem value="executive">Üst Yönetim</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Soru Sayısı</Label>
              <Select value={questionCount} onValueChange={setQuestionCount}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8 soru</SelectItem>
                  <SelectItem value="12">12 soru</SelectItem>
                  <SelectItem value="15">15 soru</SelectItem>
                  <SelectItem value="20">20 soru</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button variant="hero" type="submit" className="w-full"><Play className="mr-2 h-5 w-5" />Mülakata Başla</Button>
        </form>
      )}

      {/* Loading questions */}
      {state === "loading-questions" && (
        <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-sm font-medium">AI mülakatçı soruları hazırlıyor...</p>
          <p className="text-xs text-muted-foreground mt-1">{styleLabels[interviewStyle]} tarzında, {difficulty === "easy" ? "kolay" : difficulty === "hard" ? "zor" : "orta"} seviyede</p>
        </div>
      )}

      {/* Countdown with Preparation Tips */}
      {state === "countdown" && (
        <div className="space-y-4">
          {/* Preparation Block */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
            <h3 className="font-display text-sm font-bold flex items-center gap-2 text-primary">
              <Rocket className="h-4 w-4" />Mülakat Öncesi Hazırlık
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span><strong className="text-foreground">Sakin olun:</strong> İlk sorular ısındırma amaçlıdır. Derin nefes alın ve doğal konuşun.</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span><strong className="text-foreground">STAR yöntemi:</strong> Durum → Görev → Eylem → Sonuç yapısını kullanın.</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span><strong className="text-foreground">Somut örnekler:</strong> Genel cevaplar yerine gerçek deneyimlerinizden bahsedin.</span>
              </div>
            </div>
          </div>

          {/* Countdown Timer */}
          <div className="rounded-xl border-2 border-primary/30 bg-card p-16 flex flex-col items-center justify-center space-y-4">
            <Timer className="h-8 w-8 text-primary animate-pulse" />
            <div className="font-display text-7xl font-bold text-primary animate-pulse">
              {countdownValue > 0 ? countdownValue : "Başla!"}
            </div>
            <p className="text-muted-foreground text-sm">Mülakatınız başlamak üzere</p>
            <div className="flex flex-wrap gap-2 justify-center text-xs text-muted-foreground">
              <span className="px-3 py-1 rounded-full bg-muted">{position}</span>
              {targetCompany && <span className="px-3 py-1 rounded-full bg-accent/10 text-accent">{targetCompany}</span>}
              <span className="px-3 py-1 rounded-full bg-muted">{styleLabels[interviewStyle]}</span>
              <span className="px-3 py-1 rounded-full bg-muted">{questions.length} soru</span>
            </div>
          </div>
        </div>
      )}

      {/* Camera + Questions Layout */}
      {showCameraArea && state !== "done" && (
        <div className="flex gap-4">
          {/* Camera Area */}
          <div className="flex-1 space-y-4">
            <div className="relative rounded-2xl border border-border bg-card overflow-hidden shadow-card aspect-video">
              <video ref={videoRef} muted playsInline className={`w-full h-full object-cover ${["previewing", "recording"].includes(state) ? "block" : "hidden"}`} />
              <video ref={playbackRef} controls playsInline className={`w-full h-full object-cover ${["recorded", "analyzing"].includes(state) ? "block" : "hidden"}`} />
              {state === "idle" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30">
                  <Camera className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-sm mb-4">Kameranızı açarak başlayın</p>
                  <Button onClick={openCamera} variant="hero"><Camera className="mr-2 h-4 w-4" />Kamerayı Aç</Button>
                </div>
              )}
              {state === "recording" && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-destructive/90 text-destructive-foreground px-3 py-1.5 rounded-full text-sm font-medium">
                  <span className="w-2 h-2 rounded-full bg-destructive-foreground animate-pulse" />
                  <Clock className="h-3.5 w-3.5" /> {formatTime(duration)}
                </div>
              )}
              {state === "analyzing" && (
                <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                  <p className="text-sm font-medium">AI detaylı analiz yapıyor...</p>
                  <p className="text-xs text-muted-foreground mt-1">Cevap bazlı değerlendirme ve kariyer analizi hazırlanıyor</p>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap gap-3 justify-center">
              {state === "previewing" && <Button onClick={startRecording} variant="hero" size="lg"><Video className="mr-2 h-5 w-5" />Kaydı Başlat</Button>}
              {state === "recording" && <Button onClick={stopRecording} variant="destructive" size="lg"><Square className="mr-2 h-5 w-5" />Durdur</Button>}
              {state === "recorded" && (
                <>
                  <Button onClick={() => { stopStream(); setRecordedBlob(null); setRecordedAudioBlob(null); setState("idle"); }} variant="outline"><RotateCcw className="mr-2 h-4 w-4" />Tekrar</Button>
                  <Button onClick={startAnalysis} variant="hero" size="lg"><CheckCircle2 className="mr-2 h-5 w-5" />AI Analizi Başlat</Button>
                </>
              )}
            </div>

            {["recording", "recorded", "analyzing"].includes(state) && (
              <TranscriptViewer
                entries={state === "analyzing" ? [] : transcriptEntries}
                transcript={transcript}
                title="Canlı Transkript"
                description="Pratik mülakat sırasında yakalanan konuşmalar burada görünür; gerekirse analiz başlamadan kayıt sesinden tamamlanır."
                statusLabel={transcriptStatusLabels[transcriptStatus]}
                providerLabel={transcriptProviderLabel}
                warnings={transcriptWarnings}
                emptyMessage="Henüz konuşma algılanmadı. Kayıt bittikten sonra analiz başlatıldığında ses dosyasından transkript hazırlanacak."
                heightClassName="h-[220px]"
              />
            )}
          </div>

          {/* Questions Sidebar */}
          {questions.length > 0 && (
            showQuestions ? (
              <div className="w-80 shrink-0 rounded-xl border border-border bg-card shadow-card flex flex-col max-h-[calc(100vh-200px)] sticky top-4">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Mülakat Soruları</span>
                    <span className="text-xs text-muted-foreground">({answeredQuestions.size}/{questions.length})</span>
                  </div>
                  <button onClick={() => setShowQuestions(false)} className="hover:bg-muted rounded p-1 transition-colors">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="h-1.5 bg-muted">
                  <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${questions.length > 0 ? (answeredQuestions.size / questions.length) * 100 : 0}%` }} />
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {Object.entries(groupedQuestions).map(([category, items]) => (
                    <div key={category}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{category}</p>
                      <div className="space-y-1">
                        {items.map(({ q, idx }) => (
                          <button
                            key={idx}
                            onClick={() => { setCurrentQuestionIdx(idx); setShowTip(false); }}
                            className={`w-full text-left rounded-lg px-3 py-2 text-xs transition-all duration-200 flex items-start gap-2 ${
                              answeredQuestions.has(idx)
                                ? "bg-primary/10 text-muted-foreground line-through opacity-60"
                                : currentQuestionIdx === idx
                                  ? "bg-accent/10 text-foreground border border-accent/30"
                                  : "hover:bg-muted/50 text-foreground"
                            }`}
                          >
                            {answeredQuestions.has(idx) ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            ) : (
                              <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0 mt-0.5" />
                            )}
                            <span className="flex-1">{q.question}</span>
                            <span className={`text-[9px] shrink-0 ${difficultyColor(q.difficulty)}`}>{q.difficulty}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Current Question Detail */}
                {questions[currentQuestionIdx] && (
                  <div className="border-t border-border p-3 bg-accent/5 space-y-2">
                    <p className="text-[10px] font-bold text-primary uppercase">Aktif Soru</p>
                    <p className="text-xs text-foreground leading-relaxed">{questions[currentQuestionIdx].question}</p>

                    <button
                      onClick={() => setShowTip(!showTip)}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1"
                    >
                      <Lightbulb className="h-3 w-3" />
                      {showTip ? "İpucunu gizle" : "💡 İpucu göster"}
                    </button>
                    {showTip && (
                      <p className="text-[11px] text-muted-foreground bg-primary/5 rounded p-2 italic">
                        {questions[currentQuestionIdx].tip}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setCurrentQuestionIdx(Math.max(0, currentQuestionIdx - 1)); setShowTip(false); }}
                        disabled={currentQuestionIdx === 0}
                        className="text-[10px] px-2 py-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-30 transition-colors"
                      >
                        ← Önceki
                      </button>
                      <button
                        onClick={() => {
                          toggleAnswered(currentQuestionIdx);
                          if (!answeredQuestions.has(currentQuestionIdx)) {
                            setCurrentQuestionIdx(Math.min(questions.length - 1, currentQuestionIdx + 1));
                          }
                          setShowTip(false);
                        }}
                        className="text-[10px] px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors flex-1"
                      >
                        {answeredQuestions.has(currentQuestionIdx) ? "Geri Al" : "Soruldu ✓"}
                      </button>
                      <button
                        onClick={() => { setCurrentQuestionIdx(Math.min(questions.length - 1, currentQuestionIdx + 1)); setShowTip(false); }}
                        disabled={currentQuestionIdx === questions.length - 1}
                        className="text-[10px] px-2 py-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-30 transition-colors"
                      >
                        Sonraki →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowQuestions(true)}
                className="shrink-0 bg-card border border-border rounded-lg p-2 h-fit hover:bg-muted transition-colors"
                title="Soruları göster"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )
          )}
        </div>
      )}

      {/* ========== RESULTS ========== */}
      {state === "done" && analysisData && (
        <div className="space-y-6">
          {/* Overall Score Hero */}
          {analysisData.character_analysis && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-8 text-center space-y-3">
              <div className="font-display text-6xl font-bold text-primary">{analysisData.character_analysis.overall_score}/100</div>
              <p className="text-sm text-muted-foreground">Genel Performans Skoru</p>
              {analysisData.analysis?.interview_readiness && (
                <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-semibold ${
                  analysisData.analysis.interview_readiness === "Hazır" ? "bg-primary/10 text-primary" :
                  analysisData.analysis.interview_readiness === "Neredeyse Hazır" ? "bg-accent/10 text-accent" :
                  "bg-destructive/10 text-destructive"
                }`}>
                  {analysisData.analysis.interview_readiness}
                </span>
              )}
            </div>
          )}

          {/* Score Cards */}
          {analysisData.analysis && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <ScoreCard label="İletişim" score={analysisData.analysis.communication_score || 0} icon={Mic} />
              <ScoreCard label="Teknik" score={analysisData.analysis.technical_score || 0} icon={Brain} />
              <ScoreCard label="Özgüven" score={analysisData.analysis.confidence_score || 0} icon={Shield} />
              {analysisData.analysis.body_language_score && <ScoreCard label="Beden Dili" score={analysisData.analysis.body_language_score} icon={Users} />}
              {analysisData.analysis.problem_solving_score && <ScoreCard label="Problem Çözme" score={analysisData.analysis.problem_solving_score} icon={Zap} />}
            </div>
          )}

          {/* Answer-by-Answer Feedback */}
          {analysisData.answer_feedback?.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
              <h2 className="font-display text-lg font-bold flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />Cevap Bazlı Değerlendirme
              </h2>
              <div className="space-y-4">
                {analysisData.answer_feedback.map((fb, i) => (
                  <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium flex-1">{fb.question || `Cevap ${i + 1}`}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{fb.score}/100</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {fb.good && (
                        <div className="bg-primary/5 rounded-lg p-3">
                          <p className="font-semibold text-primary mb-1">✅ İyi Olan</p>
                          <p className="text-muted-foreground">{fb.good}</p>
                        </div>
                      )}
                      {fb.missing && (
                        <div className="bg-destructive/5 rounded-lg p-3">
                          <p className="font-semibold text-destructive mb-1">❌ Eksik Kalan</p>
                          <p className="text-muted-foreground">{fb.missing}</p>
                        </div>
                      )}
                      {fb.how_to_improve && (
                        <div className="bg-accent/5 rounded-lg p-3">
                          <p className="font-semibold text-accent mb-1">💡 Nasıl İyileştirirsiniz</p>
                          <p className="text-muted-foreground">{fb.how_to_improve}</p>
                        </div>
                      )}
                      {fb.better_answer && (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="font-semibold mb-1">📝 Daha İyi Cevap Örneği</p>
                          <p className="text-muted-foreground italic">{fb.better_answer}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How to Improve - Top 3 Weaknesses */}
          {analysisData.improvement_system && (
            <div className="rounded-xl border-2 border-accent/20 bg-accent/5 p-6 shadow-card space-y-4">
              <h2 className="font-display text-lg font-bold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-accent" />Nasıl Gelişirsiniz?
              </h2>
              {analysisData.improvement_system.top_weaknesses?.map((w, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-destructive/10 text-destructive text-xs flex items-center justify-center font-bold">{i + 1}</span>
                    {w.weakness}
                  </p>
                  <p className="text-xs text-muted-foreground">{w.suggestion}</p>
                  {w.example && <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 italic">💬 "{w.example}"</p>}
                  {w.tip && <p className="text-xs text-primary">💡 {w.tip}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Analysis Summary */}
          {analysisData.analysis && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-3">
              <h2 className="font-display text-lg font-bold flex items-center gap-2"><Award className="h-5 w-5 text-primary" />Mülakat Performans Analizi</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{analysisData.analysis.summary}</p>
              {analysisData.analysis.position_fit && (
                <div className="bg-accent/5 rounded-lg p-3">
                  <p className="text-xs font-semibold text-accent mb-1">📌 Pozisyon Uyumu</p>
                  <p className="text-sm text-muted-foreground">{analysisData.analysis.position_fit}</p>
                </div>
              )}
            </div>
          )}

          {/* Character Analysis */}
          {analysisData.character_analysis && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
              <h2 className="font-display text-lg font-bold flex items-center gap-2"><Brain className="h-5 w-5 text-primary" />Karakter & Davranış Analizi</h2>
              <p className="text-xs text-muted-foreground italic">AI gözlemlerine dayalı değerlendirme — profesyonel bir teşhis değildir.</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{analysisData.character_analysis.character_summary}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {analysisData.character_analysis.communication_style && (
                  <div className="bg-muted/20 rounded-lg p-3">
                    <p className="text-xs font-semibold mb-1">🗣️ İletişim Tarzı</p>
                    <p className="text-sm text-muted-foreground">{analysisData.character_analysis.communication_style}</p>
                  </div>
                )}
                {analysisData.character_analysis.thinking_style && (
                  <div className="bg-muted/20 rounded-lg p-3">
                    <p className="text-xs font-semibold mb-1">🧠 Düşünme Tarzı</p>
                    <p className="text-sm text-muted-foreground">{analysisData.character_analysis.thinking_style}</p>
                  </div>
                )}
                {analysisData.character_analysis.stress_management && (
                  <div className="bg-muted/20 rounded-lg p-3">
                    <p className="text-xs font-semibold mb-1">😤 Stres Yönetimi</p>
                    <p className="text-sm text-muted-foreground">{analysisData.character_analysis.stress_management}</p>
                  </div>
                )}
                {analysisData.character_analysis.emotional_intelligence && (
                  <div className="bg-muted/20 rounded-lg p-3">
                    <p className="text-xs font-semibold mb-1">❤️ Duygusal Zeka</p>
                    <p className="text-sm text-muted-foreground">{analysisData.character_analysis.emotional_intelligence}</p>
                  </div>
                )}
              </div>

              {analysisData.character_analysis.interview_strengths?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-primary">💪 Mülakat Güçlü Yönleri</h3>
                  <div className="flex flex-wrap gap-2">
                    {analysisData.character_analysis.interview_strengths.map((s: string, i: number) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {analysisData.character_analysis.interview_weaknesses?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-destructive">⚠️ Mülakat Zayıf Yönleri</h3>
                  <div className="flex flex-wrap gap-2">
                    {analysisData.character_analysis.interview_weaknesses.map((w: string, i: number) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium">{w}</span>
                    ))}
                  </div>
                </div>
              )}

              {analysisData.character_analysis.behavioral_patterns?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">🔍 Davranışsal Kalıplar</h3>
                  <ul className="space-y-1">
                    {analysisData.character_analysis.behavioral_patterns.map((p: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-primary mt-0.5">•</span>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* SWOT */}
          {analysisData.swot && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-4"><Target className="h-5 w-5 text-primary" />SWOT Analizi</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: "strengths", title: "Güçlü Yönler", icon: Shield, color: "primary" },
                  { key: "weaknesses", title: "Zayıf Yönler", icon: AlertTriangle, color: "destructive" },
                  { key: "opportunities", title: "Fırsatlar", icon: TrendingUp, color: "accent" },
                  { key: "threats", title: "Tehditler", icon: AlertTriangle, color: "destructive" },
                ].map(({ key, title, icon: SIcon, color }) => (
                  analysisData.swot[key]?.length > 0 && (
                    <div key={key} className={`rounded-lg bg-${color}/5 border border-${color}/20 p-4`}>
                      <h3 className={`text-sm font-semibold text-${color} mb-2 flex items-center gap-1`}><SIcon className="h-4 w-4" />{title}</h3>
                      <ul className="space-y-1">{analysisData.swot[key].map((s: string, i: number) => <li key={i} className="text-xs text-muted-foreground">• {s}</li>)}</ul>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Career Management */}
          {analysisData.career_management && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
              <h2 className="font-display text-lg font-bold flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" />Kariyer Yol Haritası</h2>

              {analysisData.career_management.current_level && (
                <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
                  <MapPin className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Mevcut Seviye</p>
                    <p className="text-sm font-semibold">{analysisData.career_management.current_level}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["short_term_goals", "mid_term_goals", "long_term_goals"] as const).map((goalKey, gi) => {
                  const goals = analysisData.career_management?.[goalKey];
                  if (!Array.isArray(goals) || goals.length === 0) return null;
                  const labels = ["0-3 Ay", "3-12 Ay", "1-3 Yıl"];
                  const icons = [Zap, TrendingUp, Rocket];
                  const GIcon = icons[gi];
                  return (
                    <div key={goalKey} className="rounded-lg border border-border p-3">
                      <h4 className="text-xs font-bold text-primary mb-2 flex items-center gap-1"><GIcon className="h-3 w-3" />{labels[gi]}</h4>
                      <ul className="space-y-1">{goals.map((g: string, i: number) => <li key={i} className="text-[11px] text-muted-foreground">• {g}</li>)}</ul>
                    </div>
                  );
                })}
              </div>

              {analysisData.career_management.skill_development?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><BookOpen className="h-4 w-4 text-primary" />Yetenek Gelişim Planı</h3>
                  <div className="space-y-2">
                    {analysisData.career_management.skill_development.map((s, i) => {
                      const currentLevel = s.current_level || 0;
                      const targetLevel = s.target_level || 0;
                      return (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <span className="font-medium w-28 shrink-0 text-xs">{s.skill}</span>
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-6">{currentLevel}</span>
                            <div className="flex-1 bg-muted rounded-full h-2 relative">
                              <div className="absolute h-full bg-muted-foreground/30 rounded-full" style={{ width: `${(currentLevel / 10) * 100}%` }} />
                              <div className="absolute h-full bg-primary rounded-full opacity-40" style={{ width: `${(targetLevel / 10) * 100}%` }} />
                            </div>
                            <span className="text-xs text-primary w-6">{targetLevel}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Plan */}
          {analysisData.action_plan && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
              <h2 className="font-display text-lg font-bold flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" />Aksiyon Planı</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {analysisData.action_plan.immediate?.length > 0 && (
                  <div className="rounded-lg border-2 border-primary/20 p-3">
                    <h4 className="text-xs font-bold text-primary mb-2">🚀 Hemen Yapılacaklar</h4>
                    <ul className="space-y-1">{analysisData.action_plan.immediate.map((a: string, i: number) => <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1"><span className="text-primary">▸</span>{a}</li>)}</ul>
                  </div>
                )}
                {analysisData.action_plan.before_next_interview?.length > 0 && (
                  <div className="rounded-lg border border-border p-3">
                    <h4 className="text-xs font-bold text-accent mb-2">📋 Sonraki Mülakata Kadar</h4>
                    <ul className="space-y-1">{analysisData.action_plan.before_next_interview.map((a: string, i: number) => <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1"><span className="text-accent">▸</span>{a}</li>)}</ul>
                  </div>
                )}
                {analysisData.action_plan.practice_exercises?.length > 0 && (
                  <div className="rounded-lg border border-border p-3">
                    <h4 className="text-xs font-bold text-foreground mb-2">🎯 Pratik Egzersizleri</h4>
                    <ul className="space-y-1">{analysisData.action_plan.practice_exercises.map((a: string, i: number) => <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1"><span>▸</span>{a}</li>)}</ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Post Session Next Steps */}
          <PostSessionActions
            score={analysisData.character_analysis?.overall_score || 0}
            weaknesses={analysisData.character_analysis?.interview_weaknesses || analysisData.character_analysis?.weaknesses}
            onReset={reset}
          />

          <div className="flex gap-3">
            <Button onClick={reset} variant="outline"><RotateCcw className="mr-2 h-4 w-4" />Yeni Pratik</Button>
            <Button onClick={() => navigate("/individual/history")} variant="hero"><ArrowRight className="mr-2 h-4 w-4" />Geçmişe Git</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeInterviewPage;
