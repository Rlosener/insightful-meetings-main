import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Brain,
  Camera,
  FileText,
  Loader2,
  MessageSquarePlus,
  Mic,
  Plus,
  RefreshCw,
  Save,
  Square,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Video,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import { TranscriptViewer } from "@/components/TranscriptViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EDGE_FUNCTIONS } from "@/config/api";
import { CANDIDATE_STORAGE_KEY, CONTENT_STORAGE_KEY } from "@/features/biveyos/constants";
import { deleteCandidateRecord, listCandidates, saveCandidateRecord } from "@/features/biveyos/services/candidateService";
import { validateCandidate } from "@/features/biveyos/services/candidateValidation";
import { ACCEPTED_CV_FILE_FORMATS, parseCvFile } from "@/features/biveyos/services/cvFileParser";
import type { BiveyosCandidateRecord } from "@/features/biveyos/types";
import { FacsSessionSignalsPanel } from "@/features/emotion/components/FacsSessionSignalsPanel";
import { sanitizeSignalLabel } from "@/features/emotion/facs/facsLabelFormatter";
import { buildFacsAuSessionResult, type FacsAuSessionResult } from "@/features/emotion/facs/facsSessionAggregator";
import {
  EMOTION_ANALYSIS_INTERVAL_MS,
  EMOTION_FRAME_BATCH_SIZE,
  EMOTION_FRAME_CAPTURE_INTERVAL_MS,
  EMOTION_MAX_BUFFER_SIZE,
} from "@/features/emotion/constants";
import { normalizeEmotionAnalysis } from "@/features/emotion/services/emotionNormalizer";
import type { EmotionAnalysisResult } from "@/features/emotion/types";
import { isTranscriptUsableForAnalysis, normalizeTranscript, normalizeTranscriptResult } from "@/features/transcription/services/transcriptionNormalizer";
import { getAudioExtensionByMime, normalizeAudioMimeType } from "@/features/transcription/services/audioMime";
import {
  buildAnalysisTranscriptFromChannels,
  buildChannelTranscriptDisplay,
  formatTranscriptProviderLabel,
  resolveChannelTranscriptStatus,
} from "@/features/transcription/services/transcriptionService";
import type { TranscriptPipelineStatus, TranscriptResult } from "@/features/transcription/types";
import { getErrorToastMessage, invokeEdgeFunction } from "@/lib/edgeFunctionClient";
import { formatTranscriptionFailure, type TranscriptionInvokePayload } from "@/features/transcription/services/transcriptionErrors";
import { captureVideoFrameDataUrl, sampleLatestFrames } from "@/lib/frameSampling";
import { attachStreamAndPlay } from "@/lib/mediaPlayback";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { extractBiveyosSignals } from "@/types/biveyos";
import { InterviewQuestion, RecordingInfo } from "@/types/recording";

type ConsoleState = "idle" | "preview" | "recording" | "processing" | "done";

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

interface SpeechRecognitionErrorLike {
  error?: string;
}

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

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

type WindowWithSpeechRecognition = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface CandidateFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  department: string;
  experienceYears: string;
  education: string;
  jobDescription: string;
  cvText: string;
  cvFileName: string;
  notes: string;
}

interface CandidateAiContent {
  preEvaluation: string;
  questionsText: string;
  questions: InterviewQuestion[];
  generatedAt: string;
}

interface MicChannel {
  id: string;
  speaker: string;
  deviceId: string;
}

interface ChannelRuntime {
  channel: MicChannel;
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  mimeType: string;
  stop: () => Promise<ChannelCapture>;
}

interface ChannelCapture {
  channel: MicChannel;
  blob: Blob;
  mimeType: string;
}

interface ChannelTranscript {
  channel: MicChannel;
  transcript: string;
  result: TranscriptResult;
  audioPath?: string;
  error?: string;
}

type AnalysisRecord = Record<string, unknown>;
type FacialAnalysisRecord = Record<string, unknown> & {
  dominant_mood?: string;
  average_engagement?: string;
  average_confidence?: string;
  common_expressions?: string[];
  face_visibility?: string;
  camera_facing?: string;
  gaze_evidence?: string;
  eye_contact_confidence?: string;
  visual_commentary_confidence?: string;
  observational_limits?: string[];
};
type WindowWithWebkitAudio = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

type LocalEmotionKey = "happy" | "neutral" | "fear" | "angry" | "disgust" | "sad" | "surprise";

interface LiveEmotionSample {
  emotion: LocalEmotionKey;
  confidence: number;
  ts: number;
}

interface LiveEmotionObservation {
  state: string;
  label: string;
  note: string;
  attention: string;
  total: number;
  avgConfidence: number;
}

interface LiveEmotion {
  label: string;
  engagement: string;
  confidence: string;
  updatedAt: number;
  sourceEmotion: LocalEmotionKey;
  raw: FacialAnalysisRecord;
  standard: EmotionAnalysisResult;
}

interface TimestampedSessionNote {
  id: string;
  timestampSeconds: number;
  timestampLabel: string;
  text: string;
  emotionLabel: string;
  emotionObservationLabel: string;
  createdAt: string;
}

interface BiveyosPageProps {
  initialRecordingInfo?: RecordingInfo;
  embedded?: boolean;
  onBack?: () => void;
}

const EMPTY_FORM: CandidateFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  jobTitle: "",
  department: "",
  experienceYears: "",
  education: "",
  jobDescription: "",
  cvText: "",
  cvFileName: "",
  notes: "",
};

const DEFAULT_CHANNELS: MicChannel[] = [
  { id: "candidate", speaker: "Aday", deviceId: "" },
  { id: "hr", speaker: "İK", deviceId: "" },
];

const LIVE_EMOTION_WINDOW_MS = 180000;
const MAX_LIVE_EMOTION_SAMPLES = 30;
const LIVE_EMOTION_CAPTURE_INTERVAL_MS = EMOTION_FRAME_CAPTURE_INTERVAL_MS;
const LIVE_EMOTION_ANALYSIS_INTERVAL_MS = EMOTION_ANALYSIS_INTERVAL_MS;
const LIVE_EMOTION_FRAME_BATCH_SIZE = EMOTION_FRAME_BATCH_SIZE;
const LIVE_EMOTION_FRAME_BUFFER_SIZE = EMOTION_MAX_BUFFER_SIZE * 2;

const transcriptStatusLabels: Record<TranscriptPipelineStatus, string> = {
  idle: "Transkript bekleniyor",
  live_starting: "Canlı transkript başlatılıyor",
  live_active: "Canlı transkript aktif",
  live_unsupported: "Canlı transkript desteklenmiyor",
  recording: "Ses kaydı alınıyor",
  final_preparing: "Final transkript hazırlanıyor",
  completed: "Final transkript tamamlandı",
  partial: "Kısmi transkript tamamlandı",
  failed: "Final transkript başarısız",
  final_done: "Final transkript tamamlandı",
  final_failed: "Final transkript başarısız",
  insufficient: "Transkript yetersiz, analiz başlatılmadı",
};

const stateLabels: Record<ConsoleState, string> = {
  idle: "Hazırlık",
  preview: "Kamera hazır",
  recording: "Kayıtta",
  processing: "İşleniyor",
  done: "Tamamlandı",
};

const formatSignal = (value: unknown, fallback = "Bekleniyor") => sanitizeSignalLabel(value, fallback);

const stablePick = (options: string[], seed: string, salt: string) => {
  if (options.length === 0) return "";
  let hash = 0;
  const input = `${seed}|${salt}`;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return options[Math.abs(hash) % options.length];
};

const moodToLocalEmotion = (value: unknown): LocalEmotionKey => {
  if (typeof value !== "string") return "neutral";
  const normalized = value.trim().toLocaleLowerCase("tr-TR");

  if (!normalized || normalized.includes("insufficient") || normalized.includes("kanıt")) return "neutral";
  if (normalized.includes("angry") || normalized.includes("öfke") || normalized.includes("sert")) return "angry";
  if (normalized.includes("fear") || normalized.includes("endiş") || normalized.includes("stres") || normalized.includes("gergin")) return "fear";
  if (normalized.includes("disgust") || normalized.includes("mesafe")) return "disgust";
  if (normalized.includes("sad") || normalized.includes("düşük") || normalized.includes("durgun")) return "sad";
  if (normalized.includes("surprise") || normalized.includes("sürpriz") || normalized.includes("ani") || normalized.includes("dalgal")) return "surprise";
  if (normalized.includes("happy") || normalized.includes("rahat") || normalized.includes("pozitif") || normalized.includes("açık")) return "happy";
  return "neutral";
};

const confidenceToScore = (value: unknown) => {
  if (typeof value === "number") return Math.max(0, Math.min(1, value));
  if (typeof value !== "string") return 0.5;
  const normalized = value.trim().toLocaleLowerCase("tr-TR");
  if (normalized.includes("yüksek") || normalized.includes("high")) return 0.8;
  if (normalized.includes("orta") || normalized.includes("medium")) return 0.55;
  if (normalized.includes("düşük") || normalized.includes("low")) return 0.32;
  if (normalized.includes("insufficient") || normalized.includes("kanıt")) return 0.18;
  return 0.5;
};

const buildEmotionObservation = (samples: LiveEmotionSample[]): LiveEmotionObservation => {
  if (samples.length < 3) {
    return {
      state: "veri_sinirli",
      label: "Veri sınırlı",
      note: "Anlık yorum için en az 3 duygu örneği bekleniyor. Bu aşamada tek başına çıkarım yapılmaz.",
      attention: "Duygu sinyali destekleyici veridir; karar için transkript ve yanıt içeriğiyle birlikte değerlendirilmelidir.",
      total: samples.length,
      avgConfidence: samples.length
        ? samples.reduce((sum, sample) => sum + sample.confidence, 0) / samples.length
        : 0,
    };
  }

  const counts = samples.reduce<Record<LocalEmotionKey, number>>((acc, sample) => {
    acc[sample.emotion] += 1;
    return acc;
  }, { happy: 0, neutral: 0, fear: 0, angry: 0, disgust: 0, sad: 0, surprise: 0 });
  const total = samples.length;
  const pct = Object.fromEntries(
    Object.entries(counts).map(([key, count]) => [key, count / total]),
  ) as Record<LocalEmotionKey, number>;
  const changes = samples.slice(1).reduce((sum, sample, index) => (
    sample.emotion !== samples[index].emotion ? sum + 1 : sum
  ), 0);
  const switchRate = changes / Math.max(1, samples.length - 1);
  const sortedPct = Object.values(pct).sort((a, b) => b - a);
  const dominantGap = sortedPct.length > 1 ? sortedPct[0] - sortedPct[1] : sortedPct[0];
  const positive = pct.happy + (pct.neutral * 0.65);
  const tension = pct.angry + pct.fear;
  const distance = pct.disgust + (pct.angry * 0.35);
  const lowEnergy = pct.sad + (pct.fear * 0.25);
  const reactivity = pct.surprise + (switchRate * 0.55);

  let state: "rahat" | "temkinli" | "gergin" | "mesafeli" | "dusuk_enerjili" | "karisik";
  if (distance >= 0.36 && distance + tension >= 0.58) {
    state = "mesafeli";
  } else if (tension >= 0.48 || (pct.angry >= 0.30 && pct.fear >= 0.18)) {
    state = "gergin";
  } else if (lowEnergy >= 0.46 || (pct.sad >= 0.32 && pct.fear >= 0.18)) {
    state = "dusuk_enerjili";
  } else if (positive >= 0.68 && tension < 0.26 && distance < 0.20 && switchRate < 0.42) {
    state = "rahat";
  } else if (switchRate >= 0.58 || (reactivity >= 0.52 && dominantGap < 0.18)) {
    state = "karisik";
  } else {
    state = "temkinli";
  }

  const comfortLevel: "high" | "medium" | "low" = positive >= 0.64 && tension < 0.30 && lowEnergy < 0.28 ? "high" : positive >= 0.42 ? "medium" : "low";
  const stressLevel: "high" | "medium" | "low" = tension >= 0.45 || switchRate >= 0.58 ? "high" : tension >= 0.24 || switchRate >= 0.40 ? "medium" : "low";
  const balanceLevel: "stable" | "mixed" | "variable" = switchRate < 0.30 && dominantGap >= 0.20 ? "stable" : switchRate < 0.55 ? "mixed" : "variable";
  const responseStyle: "reactive" | "guarded" | "reserved" | "open" | "controlled" = reactivity >= 0.50
    ? "reactive"
    : state === "mesafeli" || state === "gergin"
      ? "guarded"
      : state === "dusuk_enerjili"
        ? "reserved"
        : comfortLevel === "high"
          ? "open"
          : "controlled";

  const titles = {
    rahat: ["Rahat", "Rahat ve iletişime açık", "Uyumlu ve rahat", "Dengeli ve açık", "Rahat ama kontrollü"],
    temkinli: ["Temkinli", "Kontrollü ve temkinli", "Ölçülü ve temkinli", "Temkinli ama uyumlu", "Rahatlamak için zamana ihtiyaç duyuyor"],
    gergin: ["Gergin", "Kontrollü ama gergin", "Baskı altında zorlanan", "Gergin ve savunmalı", "Konforu dalgalanan"],
    mesafeli: ["Mesafeli", "Kontrollü ve mesafeli", "Mesafesini koruyan", "Sürece tam ısınmamış", "Yakınlık kurmakta sınırlı"],
    dusuk_enerjili: ["Düşük enerjili", "Sakin ama düşük tempolu", "İçe dönük ve düşük enerjili", "Enerjisi sınırlı", "Düşük tempolu"],
    karisik: ["Karışık", "Dalgalı ama ölçülü", "Tam rahat olmayan", "Sinyalleri değişken", "Ani tepki eğilimi gösteren"],
  };
  const openers = {
    rahat: [
      "Aday görüşme boyunca genel olarak rahat ve iletişime açık bir çizgi izliyor",
      "Sorulara yaklaşırken uyumlu ve dengeli bir görünüm veriyor",
      "Görüşme ortamına görece hızlı adapte olan bir profil sergiliyor",
      "İfade akışında doğal ve kontrollü bir rahatlık hissediliyor",
    ],
    temkinli: [
      "Aday kendini ifade ederken ölçülü ve temkinli bir çizgide kalıyor",
      "Yanıtlarında kontrollü ilerleyen bir iletişim tarzı öne çıkıyor",
      "Görüşme boyunca önce tartıp sonra yanıt verme eğilimi dikkat çekiyor",
      "İfade biçiminde dikkatli ve kontrollü bir ilerleme hissediliyor",
    ],
    gergin: [
      "Baskı artan anlarda adayın iletişim rahatlığı belirgin biçimde daralıyor",
      "Bazı sorularda daha savunmalı ve gergin bir tepki yapısı oluşuyor",
      "Görüşme akışında konfor seviyesinin kolayca aşağı indiği görülüyor",
      "İfade akışında baskı anlarına duyarlı bir yapı dikkat çekiyor",
    ],
    mesafeli: [
      "Görüşme akışında belirli bir mesafe koruma eğilimi dikkat çekiyor",
      "Bazı başlıklarda sürece tam olarak ısınmamış bir görünüm oluşuyor",
      "İletişimde yakınlık kurmaktan çok kontrol ve sınır belirleme öne çıkıyor",
      "Katılım sürse de duygusal yakınlık seviyesi düşük görünüyor",
    ],
    dusuk_enerjili: [
      "İfade temposunda düşük enerji ve içe dönük bir çizgi öne çıkıyor",
      "Yanıtlar daha sakin ve düşük tempolu bir akışla geliyor",
      "Görüşme boyunca enerji seviyesi sınırlı bir görünüm oluşuyor",
      "Konuşma akışında içe dönük ve ağır ilerleyen bir ritim hissediliyor",
    ],
    karisik: [
      "Görüşme boyunca sinyaller tek yönde toplanmıyor; dalgalı bir iletişim yapısı görülüyor",
      "Yanıt akışı içinde farklı yönlere giden tepkiler bir arada oluşuyor",
      "Blok boyunca görünüm sabit değil; rahatlık ve temkinlilik birlikte görülüyor",
      "Soruların yapısına göre yaklaşım belirgin şekilde değişebiliyor",
    ],
  };
  const comfortPhrases = {
    high: ["Kendini ifade ederken konfor seviyesi yüksek görünüyor", "Sorulara girerken rahat bir iletişim zemini koruyor", "Görüşme temposuna uyumlu ve akıcı bir katılım gösteriyor"],
    medium: ["İletişime açık görünmekle birlikte tamamen rahat bir çizgide değil", "Konfor seviyesi orta düzeyde ve konuya göre değişebiliyor", "Rahatlama seviyesi sorunun içeriğine göre dalgalanabiliyor"],
    low: ["Kendini ifade ederken konfor seviyesi sınırlı görünüyor", "Görüşme akışında tam anlamıyla rahatlayamadığı izlenimi oluşuyor", "Konfor seviyesi düşük olduğu için yanıtlar daha kontrollü ilerliyor"],
  };
  const stressPhrases = {
    low: ["Baskı sinyali düşük ve iletişim dengeli ilerliyor", "Gerilim seviyesi görüşme akışını belirgin biçimde bozmuyor", "İletişimde baskı hissi sınırlı kalıyor"],
    medium: ["Zaman zaman kontrollü bir gerilim hissi oluşuyor", "Bazı sorularda stres seviyesi kısa süreli yükseliyor", "Görüşme boyunca ölçülü ama hissedilir bir baskı etkisi var"],
    high: ["Baskı altında kalınca gerginlik seviyesi yükseliyor gibi görünüyor", "Sorular zorlaştığında stres belirtileri belirginleşiyor", "Görüşme baskısı iletişim konforunu doğrudan etkiliyor"],
  };
  const balancePhrases = {
    stable: ["Genel denge büyük ölçüde korunuyor", "Tepki yapısı blok boyunca tutarlı kalıyor", "İletişim çizgisi belirgin dalgalanma göstermiyor"],
    mixed: ["Blok içinde tam olarak tek bir çizgi oluşmuyor", "İletişim dili zaman zaman farklı sinyaller üretiyor", "Akış boyunca denge korunmakla birlikte küçük dalgalanmalar oluşuyor"],
    variable: ["Blok içinde belirgin geçişler ve ani yön değişimleri görülüyor", "Tepki yapısı kısa aralıklarla değişebiliyor", "İletişim görünümü sabit değil, dalgalı ilerliyor"],
  };
  const responsePhrases = {
    open: ["Yanıt verirken karşılıklı ilişki kurmaya açık görünüyor", "İletişim dili açık, katılımcı ve karşılık vermeye istekli ilerliyor", "Karşılıklı akışı besleyen daha açık bir anlatım kullanıyor"],
    controlled: ["Yanıtlarını ölçülü ve kontrollü biçimde çerçeveliyor", "Cevaplarını temkinli ama düzenli bir yapı içinde veriyor", "Yanıtlar planlı ve dikkatli bir akışla geliyor"],
    guarded: ["Bazı anlarda daha savunmalı ve sınır koyan bir tepki yapısı öne çıkıyor", "Sorular karşısında alanını koruyan daha mesafeli bir tutum oluşabiliyor", "Cevap akışında ihtiyatlı ve korunaklı bir yaklaşım dikkat çekiyor"],
    reserved: ["Cümlelerini daha sakin ve içe dönük bir tempoda kuruyor", "Yanıtlar daha düşük tempolu ve kendini geride tutan bir yapıda ilerliyor", "Katılım mevcut ancak dışavurum gücü düşük tempoda ilerliyor"],
    reactive: ["Beklenmedik sorularda tepki yapısı daha görünür hale geliyor", "Yeni veya ani başlıklarda yaklaşımı hızla değişebiliyor", "Anlık uyaranlara verdiği tepki blok içinde daha görünür oluyor"],
  };
  const focusPhrases = {
    rahat: ["daha zorlayıcı sorularda da benzer rahatlığın sürüp sürmediği", "beklenmedik başlıklarda iletişim konforunun korunup korunmadığı"],
    temkinli: ["açık uçlu sorularda rahatlama seviyesinin artıp artmadığı", "örnek vermesi istenen anlarda iletişim akışının açılıp açılmadığı"],
    gergin: ["baskı oluşturan başlıklarda iletişim konforunun yeniden gözlemlenmesi", "zorlayıcı senaryolarda savunmalı çizginin sürüp sürmediği"],
    mesafeli: ["ilişki kurmaya dönük sorularda mesafenin azalıp azalmadığı", "karşılıklı diyalog arttığında yakınlık seviyesinin farklılaşıp farklılaşmadığı"],
    dusuk_enerjili: ["tempo yükselten sorularda katılım seviyesinin değişip değişmediği", "somut örnek istenen anlarda enerji düzeyinin toparlanıp toparlanmadığı"],
    karisik: ["beklenmedik sorularda bu dalgalı görünümün tekrar edip etmediği", "farklı zorluk seviyelerindeki sorularda tutarlılık oluşup oluşmadığı"],
  };
  const bodyTemplates = ["{opener}. {comfort}. {response}.", "{opener}. {stress}. {balance}.", "{opener}. {response}. {balance}."];
  const noteTemplates = [
    "Tek başına karar ölçütü olarak kullanılmamalı; {focus} ayrıca gözlemlenebilir.",
    "Kararı tek başına belirlememeli; {focus} yeniden izlenmesi daha sağlıklı olur.",
    "Destekleyici bir gözlem olarak kullanılmalı; {focus} nasıl değiştiği takip edilebilir.",
  ];
  const signature = [
    state,
    total,
    ...(["happy", "neutral", "fear", "angry", "disgust", "sad", "surprise"] as LocalEmotionKey[])
      .map((emotion) => Math.round(pct[emotion] * 20)),
    Math.round(switchRate * 20),
  ].join("|");
  const bodyTemplate = stablePick(bodyTemplates, signature, "body");
  const attentionTemplate = stablePick(noteTemplates, signature, "attention");
  const focus = stablePick(focusPhrases[state], signature, "focus");
  const note = bodyTemplate
    .replace("{opener}", stablePick(openers[state], signature, "opener"))
    .replace("{comfort}", stablePick(comfortPhrases[comfortLevel], signature, "comfort"))
    .replace("{stress}", stablePick(stressPhrases[stressLevel], signature, "stress"))
    .replace("{balance}", stablePick(balancePhrases[balanceLevel], signature, "balance"))
    .replace("{response}", stablePick(responsePhrases[responseStyle], signature, "response"));

  return {
    state,
    label: stablePick(titles[state], signature, "title"),
    note,
    attention: attentionTemplate.replace("{focus}", focus),
    total,
    avgConfidence: samples.reduce((sum, sample) => sum + sample.confidence, 0) / total,
  };
};

const compactText = (text: string, max = 180) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3).trim()}...` : normalized;
};

const STOP_WORDS = new Set([
  "ve",
  "ile",
  "için",
  "bir",
  "olan",
  "olarak",
  "the",
  "and",
  "of",
  "in",
  "to",
  "team",
  "work",
]);

const extractCandidateFocusTerms = (candidate: BiveyosCandidateRecord, limit = 8) => {
  const text = `${candidate.jobTitle} ${candidate.jobDescription} ${candidate.cvText}`;
  const explicit = text
    .split(/[,;•\n]/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 3 && item.length <= 48)
    .slice(0, limit);
  if (explicit.length >= 3) return Array.from(new Set(explicit)).slice(0, limit);

  const words = text
    .replace(/[^\p{L}\p{N}+#./-]+/gu, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !STOP_WORDS.has(item.toLocaleLowerCase("tr-TR")));
  return Array.from(new Set([...explicit, ...words])).slice(0, limit);
};

const buildCandidateCvContext = (candidate: BiveyosCandidateRecord) => [
  candidate.cvFileName ? `CV dosyası: ${candidate.cvFileName}` : "",
  candidate.cvText,
].filter(Boolean).join("\n\n");

const formatClock = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const chooseAudioMimeType = () => {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const extensionForMimeType = (mimeType: string) => {
  return getAudioExtensionByMime(normalizeAudioMimeType(mimeType));
};

const formatQuestions = (questions: InterviewQuestion[]) =>
  questions.map((question, index) => {
    const parts = [
      `${index + 1}. ${question.question}`,
      question.category ? `Kategori: ${question.category}` : "",
      question.tip ? `İpucu: ${question.tip}` : "",
    ].filter(Boolean);
    return parts.join("\n");
  }).join("\n\n");

const buildFallbackQuestions = (candidate: BiveyosCandidateRecord): InterviewQuestion[] => {
  const focusTerms = extractCandidateFocusTerms(candidate, 4);
  const primaryTerm = focusTerms[0] || candidate.jobTitle;
  const secondaryTerm = focusTerms[1] || "rolün kritik beklentileri";

  return [
    {
      category: "Isındırma",
      question: `${candidate.jobTitle} pozisyonuna başvurunuzu ve CV'nizde bu rolle en ilişkili gördüğünüz deneyimi kısaca anlatır mısınız?`,
      difficulty: "easy",
      tip: "Adayın kariyer özetini pozisyon ve CV kanıtıyla bağlayıp bağlamadığını gözlemleyin.",
    },
    {
      category: "CV Doğrulama",
      question: `CV'nizde geçen "${primaryTerm}" deneyimini somut bir proje üzerinden açar mısınız; sizin kişisel sorumluluğunuz ve ölçülebilir çıktınız neydi?`,
      difficulty: "medium",
      tip: "CV iddiasının sahiplik, kapsam ve sonuç metriğiyle doğrulanmasına bakın.",
    },
    {
      category: "Rol Uyumu",
      question: `${candidate.jobTitle} rolünün iş tanımındaki beklentilerle CV'nizdeki "${secondaryTerm}" deneyimi nerede örtüşüyor, nerede eksik kalıyor?`,
      difficulty: "medium",
      tip: "Adayın rol farkındalığını, boşlukları gerçekçi görüp görmediğini ve öğrenme planını değerlendirin.",
    },
    {
      category: "Davranışsal",
      question: `CV'nizdeki en ilgili deneyimde zor bir paydaş, ekip veya teslim tarihi baskısını nasıl yönettiniz? STAR formatında anlatır mısınız?`,
      difficulty: "medium",
      tip: "Durum, görev, aksiyon ve sonuç ayrımı net mi; aday kendi katkısını abartmadan açıklıyor mu kontrol edin.",
    },
    {
      category: "Baskı Altı",
      question: `${candidate.jobTitle} rolünde ilk 90 günde CV'nizdeki deneyiminiz yetmezse hangi eksikleri nasıl kapatırsınız?`,
      difficulty: "hard",
      tip: "Öz farkındalık, gerçekçi risk yönetimi ve önceliklendirme yaklaşımını izleyin.",
    },
  ];
};

const buildFallbackPreEvaluation = (candidate: BiveyosCandidateRecord) => (
  `1. Ön Değerlendirme Özeti
- ${candidate.fullName}, ${candidate.jobTitle} pozisyonu için manuel eklenen aday kaydından değerlendirildi.
- CV metni, başvurulan rol ve iş tanımı birlikte incelendi.
- CV kaynağı: ${candidate.cvFileName || "Manuel girilen CV metni"}

2. CV - Pozisyon Uyumu
- Deneyim: ${candidate.experienceYears || "Belirtilmedi"}
- Eğitim: ${candidate.education || "Belirtilmedi"}
- Pozisyon beklentisi: ${compactText(candidate.jobDescription || "İş tanımı girilmedi.", 260)}

3. Görüşmede Netleştirilecek Alanlar
- Adayın CV'de belirttiği katkıların bireysel sorumluluk seviyesi.
- Pozisyonun teknik ve davranışsal beklentileriyle gerçek proje örneklerinin uyumu.
- İş tanımındaki kritik gereksinimlerde derinlik ve sahiplik seviyesi.
- CV'deki "${extractCandidateFocusTerms(candidate, 1)[0] || candidate.jobTitle}" bilgisinin canlı mülakatta somut kanıtla doğrulanması.

4. Risk ve Takip Notu
- Bu ön değerlendirme AI servisi yanıt veremediğinde yerel yedek akışla üretildi.
- Nihai karar için canlı mülakat transkripti, İK notları ve Biveyos davranış sinyalleri birlikte ele alınmalıdır.`
);

const buildLocalFallbackAnalysis = (
  candidate: BiveyosCandidateRecord,
  transcript: string,
  facialAnalysis: FacsAuSessionResult | null,
  channelTranscripts: ChannelTranscript[],
): AnalysisRecord => ({
  biveyos_enabled: true,
  summary: transcript.length >= 50
    ? `${candidate.fullName} için çoklu mikrofon mülakat kaydı tamamlandı. AI analizi çalıştırılamadığı için ham transkript ve Biveyos sinyal paketi saklandı.`
    : `${candidate.fullName} için oturum kaydedildi ancak analiz için yeterli konuşma algılanamadı.`,
  overall_score: 0,
  position_fit: 0,
  communication_clarity: 0,
  confidence_level: 0,
  facial_analysis: facialAnalysis,
  biveyos_session: {
    candidate_id: candidate.id,
    source_type: "biveyos_multi_mic",
    channel_count: channelTranscripts.length,
    channel_statuses: channelTranscripts.map((item) => ({
      speaker: item.channel.speaker,
      has_transcript: Boolean(item.transcript),
      audio_path: item.audioPath || null,
      error: item.error || null,
    })),
  },
});

const candidateFromRecordingInfo = (info: RecordingInfo): BiveyosCandidateRecord => {
  const firstName = (info.candidateName || "").trim();
  const lastName = (info.candidateSurname || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "İsimsiz Aday";
  const skillsText = info.requiredSkills?.length ? `Aranan yetenekler: ${info.requiredSkills.join(", ")}` : "";
  const cvText = [
    info.candidateSummary,
    info.candidateCurrentRole ? `Mevcut pozisyon: ${info.candidateCurrentRole}` : "",
    info.candidateExperience ? `Deneyim: ${info.candidateExperience}` : "",
    info.candidateEducation ? `Eğitim: ${info.candidateEducation}` : "",
    skillsText,
    info.candidateNotes,
  ].filter(Boolean).join("\n");

  return {
    id: "recording-info-candidate",
    firstName,
    lastName,
    fullName,
    email: (info.candidateEmail || "").trim(),
    phone: (info.candidatePhone || "").trim(),
    jobTitle: (info.position || "Mülakat").trim(),
    department: (info.department || "").trim(),
    experienceYears: (info.experienceYears || info.candidateExperience || "").trim(),
    education: (info.candidateEducation || "").trim(),
    jobDescription: [
      info.position ? `Pozisyon: ${info.position}` : "",
      info.department ? `Departman: ${info.department}` : "",
      skillsText,
    ].filter(Boolean).join("\n"),
    cvText: cvText || "Mülakat kurulum ekranında ayrı CV metni girilmedi.",
    cvFileName: "",
    notes: (info.interviewNotes || info.candidateNotes || "").trim(),
    status: "Mülakat bilgisi",
    source: "Kayıt ve Analiz",
    createdAt: new Date().toISOString(),
  };
};

const contentFromRecordingInfo = (info: RecordingInfo, candidate: BiveyosCandidateRecord): CandidateAiContent => {
  const questions = info.suggestedQuestions && info.suggestedQuestions.length > 0
    ? info.suggestedQuestions
    : buildFallbackQuestions(candidate);

  return {
    preEvaluation: [
      "1. Mülakat Ön Hazırlığı",
      `${candidate.fullName}, ${candidate.jobTitle} pozisyonu için Kayıt ve Analiz ekranından canlı Biveyos oturumuna aktarıldı.`,
      "",
      "2. Pozisyon Bağlamı",
      candidate.jobDescription || "Pozisyon bağlamı girilmedi.",
      "",
      "3. Aday Notları",
      candidate.notes || candidate.cvText || "Aday notu girilmedi.",
      "",
      "4. Görüşmede Odaklanılacak Başlıklar",
      "- CV/deneyim bilgisinin pozisyon beklentileriyle uyumu.",
      "- Yanıtların somut örnek ve ölçülebilir katkı içermesi.",
      "- Canlı oturumdaki ses, transkript ve duygu durum sinyallerinin birlikte değerlendirilmesi.",
    ].join("\n"),
    questions,
    questionsText: formatQuestions(questions),
    generatedAt: new Date().toISOString(),
  };
};

const toCandidateRecord = (form: CandidateFormState, existingId?: string): BiveyosCandidateRecord => {
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "İsimsiz Aday";
  return {
    id: existingId || `candidate-${Date.now()}`,
    firstName,
    lastName,
    fullName,
    email: form.email.trim(),
    phone: form.phone.trim(),
    jobTitle: form.jobTitle.trim(),
    department: form.department.trim(),
    experienceYears: form.experienceYears.trim(),
    education: form.education.trim(),
    jobDescription: form.jobDescription.trim(),
    cvText: form.cvText.trim(),
    cvFileName: form.cvFileName.trim(),
    notes: form.notes.trim(),
    status: "Hazırlık",
    source: "Manuel CRM",
    createdAt: new Date().toISOString(),
  };
};

const formFromCandidate = (candidate: BiveyosCandidateRecord): CandidateFormState => ({
  firstName: candidate.firstName,
  lastName: candidate.lastName,
  email: candidate.email,
  phone: candidate.phone,
  jobTitle: candidate.jobTitle,
  department: candidate.department,
  experienceYears: candidate.experienceYears,
  education: candidate.education,
  jobDescription: candidate.jobDescription,
  cvText: candidate.cvText,
  cvFileName: candidate.cvFileName || "",
  notes: candidate.notes,
});

const safeJsonParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const BiveyosPage = ({ initialRecordingInfo, embedded = false, onBack }: BiveyosPageProps = {}) => {
  const navigate = useNavigate();
  const embeddedCandidate = useMemo(
    () => initialRecordingInfo?.type === "mülakat" ? candidateFromRecordingInfo(initialRecordingInfo) : null,
    [initialRecordingInfo],
  );
  const embeddedAiContent = useMemo(
    () => embeddedCandidate && initialRecordingInfo ? contentFromRecordingInfo(initialRecordingInfo, embeddedCandidate) : null,
    [embeddedCandidate, initialRecordingInfo],
  );
  const [form, setForm] = useState<CandidateFormState>(EMPTY_FORM);
  const [candidates, setCandidates] = useState<BiveyosCandidateRecord[]>([]);
  const [candidateStorageSource, setCandidateStorageSource] = useState<"supabase" | "local" | "unknown">("unknown");
  const [aiContentByCandidate, setAiContentByCandidate] = useState<Record<string, CandidateAiContent>>({});
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [aiPreparing, setAiPreparing] = useState(false);
  const [cvParsing, setCvParsing] = useState(false);
  const [cvParseMessage, setCvParseMessage] = useState("");
  const [channels, setChannels] = useState<MicChannel[]>(DEFAULT_CHANNELS);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [state, setState] = useState<ConsoleState>("idle");
  const [duration, setDuration] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [channelLevels, setChannelLevels] = useState<Record<string, number>>({});
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [liveEmotion, setLiveEmotion] = useState<LiveEmotion | null>(null);
  const [emotionSamples, setEmotionSamples] = useState<LiveEmotionSample[]>([]);
  const [emotionResults, setEmotionResults] = useState<EmotionAnalysisResult[]>([]);
  const [emotionAnalyzing, setEmotionAnalyzing] = useState(false);
  const [emotionError, setEmotionError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [sessionNotes, setSessionNotes] = useState<TimestampedSessionNote[]>([]);
  const [transcript, setTranscript] = useState("");
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptPipelineStatus>("idle");
  const [transcriptWarnings, setTranscriptWarnings] = useState<string[]>([]);
  const [transcriptProviderLabel, setTranscriptProviderLabel] = useState("");
  const [analysisData, setAnalysisData] = useState<AnalysisRecord | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Aday bilgilerini girin, AI ön hazırlığı oluşturun ve kamerayı açın.");

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const runtimesRef = useRef<ChannelRuntime[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const emotionBusyRef = useRef(false);
  const lastEmotionAtRef = useRef(0);
  const durationRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const liveTranscriptFinalRef = useRef("");
  const liveTranscriptErrorCountRef = useRef(0);
  const frameBufferRef = useRef<string[]>([]);
  const meterRefs = useRef<Array<{ context: AudioContext; raf: number }>>([]);

  useEffect(() => {
    if (embedded) return;
    let active = true;
    listCandidates()
      .then((result) => {
        if (active) {
          setCandidates(result.candidates);
          setCandidateStorageSource(result.source);
        }
      })
      .catch((error: unknown) => {
        console.warn("[biveyos] candidate load failed", error);
        if (active) {
          setCandidates(safeJsonParse<BiveyosCandidateRecord[]>(localStorage.getItem(CANDIDATE_STORAGE_KEY), []));
        }
      });
    setAiContentByCandidate(safeJsonParse<Record<string, CandidateAiContent>>(localStorage.getItem(CONTENT_STORAGE_KEY), {}));

    return () => {
      active = false;
    };
  }, [embedded]);

  useEffect(() => {
    if (embedded) return;
    localStorage.setItem(CANDIDATE_STORAGE_KEY, JSON.stringify(candidates));
  }, [candidates, embedded]);

  useEffect(() => {
    if (embedded) return;
    localStorage.setItem(CONTENT_STORAGE_KEY, JSON.stringify(aiContentByCandidate));
  }, [aiContentByCandidate, embedded]);

  useEffect(() => {
    if (!embedded || !embeddedCandidate || !embeddedAiContent) return;
    setCandidates([embeddedCandidate]);
    setSelectedCandidateId(embeddedCandidate.id);
    setForm(formFromCandidate(embeddedCandidate));
    setAiContentByCandidate({ [embeddedCandidate.id]: embeddedAiContent });
    setStatusMessage("Mülakat bilgileri alındı. Kamerayı açıp Biveyos canlı oturumunu başlatabilirsiniz.");
  }, [embedded, embeddedAiContent, embeddedCandidate]);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) || null,
    [candidates, selectedCandidateId],
  );
  const selectedAiContent = selectedCandidate ? aiContentByCandidate[selectedCandidate.id] : null;

  const duplicateDeviceSelected = useMemo(() => {
    const ids = channels.map((channel) => channel.deviceId).filter(Boolean);
    return ids.length !== new Set(ids).size;
  }, [channels]);

  const canEditSetup = state === "idle" || state === "preview" || state === "done";
  const reportScore = Number(analysisData?.overall_score || analysisData?.behavior_score || 0);
  const facsSessionResult = useMemo(() => buildFacsAuSessionResult(emotionResults), [emotionResults]);
  const emotionObservation = useMemo(() => ({
    label: facsSessionResult.interpretation.title,
    note: facsSessionResult.interpretation.summary,
    attention: facsSessionResult.interpretation.hrNote,
    total: facsSessionResult.window.sampleCount,
    avgConfidence: facsSessionResult.scores.observationConfidence,
  }), [facsSessionResult]);

  const stopMeters = useCallback(() => {
    meterRefs.current.forEach(({ context, raf }) => {
      cancelAnimationFrame(raf);
      context.close().catch(() => undefined);
    });
    meterRefs.current = [];
    setChannelLevels({});
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const cleanupIntervals = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  }, []);

  const stopLiveTranscript = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.onresult = null;
    recognitionRef.current.onerror = null;
    recognitionRef.current.onend = null;
    try {
      recognitionRef.current.stop();
    } catch {
      // SpeechRecognition may already be stopped by the browser.
    }
    recognitionRef.current = null;
  }, []);

  const cleanupSessionMedia = useCallback(() => {
    cleanupIntervals();
    stopLiveTranscript();
    stopMeters();
    runtimesRef.current.forEach((runtime) => {
      runtime.stream.getTracks().forEach((track) => track.stop());
    });
    runtimesRef.current = [];
    stopCamera();
  }, [cleanupIntervals, stopCamera, stopLiveTranscript, stopMeters]);

  useEffect(() => () => cleanupSessionMedia(), [cleanupSessionMedia]);

  const updateForm = (patch: Partial<CandidateFormState>) => {
    setForm((previous) => ({ ...previous, ...patch }));
  };

  const handleCvFileUpload = async (file: File) => {
    setCvParsing(true);
    setCvParseMessage("");
    try {
      const parsed = await parseCvFile(file);
      updateForm({ cvText: parsed.text, cvFileName: parsed.fileName });
      setCvParseMessage(parsed.warning || `${parsed.fileName} okundu, CV metni forma aktarıldı.`);
      toast.success("CV metni yüklendi");
    } catch (error: unknown) {
      const message = getErrorMessage(error, "CV dosyası okunamadı.");
      setCvParseMessage(message);
      toast.error(message);
    } finally {
      setCvParsing(false);
    }
  };

  const addTimestampedNote = () => {
    const text = noteDraft.trim();
    if (!text) {
      toast.error("Not metni boş olamaz.");
      return;
    }

    setSessionNotes((previous) => [
      {
        id: `note-${Date.now()}`,
        timestampSeconds: duration,
        timestampLabel: formatClock(duration),
        text,
        emotionLabel: liveEmotion?.label || "Veri yok",
        emotionObservationLabel: emotionObservation.label,
        createdAt: new Date().toISOString(),
      },
      ...previous,
    ]);
    setNoteDraft("");
    toast.success(`Not ${formatClock(duration)} zaman damgasıyla eklendi`);
  };

  const deleteTimestampedNote = (id: string) => {
    setSessionNotes((previous) => previous.filter((note) => note.id !== id));
  };

  const refreshAudioDevices = useCallback(async () => {
    setDeviceError(null);
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setDeviceError("Tarayıcı cihaz listelemeyi desteklemiyor.");
        return;
      }

      let permissionStream: MediaStream | null = null;
      try {
        permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setDeviceError("Mikrofon izni verilmedi. Kanal isimleri boş görünebilir.");
      } finally {
        permissionStream?.getTracks().forEach((track) => track.stop());
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === "audioinput");
      setAudioDevices(inputs);
      setChannels((previous) => previous.map((channel, index) => ({
        ...channel,
        deviceId: channel.deviceId || inputs[index]?.deviceId || inputs[0]?.deviceId || "",
      })));
    } catch (error: unknown) {
      setDeviceError(getErrorMessage(error, "Mikrofonlar okunamadı."));
    }
  }, []);

  useEffect(() => {
    refreshAudioDevices();
  }, [refreshAudioDevices]);

  const saveCandidate = async () => {
    const record = toCandidateRecord(form, selectedCandidate?.id);
    const validation = validateCandidate(record);
    if (!validation.valid) {
      toast.error(validation.errors.join(" "));
      return;
    }

    setCandidates((previous) => {
      const exists = previous.some((candidate) => candidate.id === record.id);
      return exists
        ? previous.map((candidate) => candidate.id === record.id ? { ...record, createdAt: candidate.createdAt } : candidate)
        : [record, ...previous];
    });
    setSelectedCandidateId(record.id);
    setStatusMessage("Aday kaydı oluşturuldu. AI ön değerlendirme ve soru setini hazırlayabilirsiniz.");
    const result = await saveCandidateRecord(record);
    setCandidateStorageSource(result.source);
    if (result.source === "supabase") {
      toast.success("Aday kaydı oluşturuldu");
    } else {
      toast.warning("Aday yerel olarak saklandı. Supabase tablo migration'ı uygulanınca kalıcı kayıt aktif olur.");
    }
  };

  const selectCandidate = (candidate: BiveyosCandidateRecord) => {
    if (!canEditSetup) return;
    setSelectedCandidateId(candidate.id);
    setForm(formFromCandidate(candidate));
    setTranscript("");
    setTranscriptStatus("idle");
    setTranscriptWarnings([]);
    setTranscriptProviderLabel("");
    setAnalysisData(null);
    setReportId(null);
    setNoteDraft("");
    setSessionNotes([]);
    setCvParseMessage(candidate.cvFileName ? `${candidate.cvFileName} CV kaydı seçildi.` : "");
    setStatusMessage("Aday seçildi. AI içeriği yoksa önce ön hazırlığı oluşturun.");
  };

  const newCandidate = () => {
    if (!canEditSetup) return;
    setSelectedCandidateId("");
    setForm(EMPTY_FORM);
    setTranscript("");
    setTranscriptStatus("idle");
    setTranscriptWarnings([]);
    setTranscriptProviderLabel("");
    setAnalysisData(null);
    setReportId(null);
    setNoteDraft("");
    setSessionNotes([]);
    setCvParseMessage("");
    setStatusMessage("Yeni aday bilgilerini girin.");
  };

  const deleteCandidate = async (id: string) => {
    if (!canEditSetup) return;
    setCandidates((previous) => previous.filter((candidate) => candidate.id !== id));
    setAiContentByCandidate((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    if (selectedCandidateId === id) newCandidate();
    await deleteCandidateRecord(id);
    toast.success("Aday kaydı silindi");
  };

  const prepareAiContent = async () => {
    if (!selectedCandidate) {
      toast.error("Önce aday kaydını oluşturun veya seçin.");
      return;
    }

    setAiPreparing(true);
    setStatusMessage("AI ön değerlendirme ve soru seti hazırlanıyor.");

    let preEvaluation = "";
    let questions: InterviewQuestion[] = [];
    const cvContext = buildCandidateCvContext(selectedCandidate);
    const focusTerms = extractCandidateFocusTerms(selectedCandidate, 10);

    const preEvalResult = await invokeEdgeFunction(EDGE_FUNCTIONS.BIVEYOS_PRE_EVALUATION, {
      candidate: {
        ...selectedCandidate,
        cvText: cvContext,
      },
    }, { maxRetries: 1, timeoutMs: 120000 });

    if (!preEvalResult.error && preEvalResult.data?.preEvaluation) {
      preEvaluation = preEvalResult.data.preEvaluation;
    } else {
      preEvaluation = buildFallbackPreEvaluation(selectedCandidate);
      if (preEvalResult.error) toast.warning(getErrorToastMessage(preEvalResult.error));
    }

    const questionResult = await invokeEdgeFunction(EDGE_FUNCTIONS.GENERATE_QUESTIONS, {
      candidateName: selectedCandidate.fullName,
      position: selectedCandidate.jobTitle,
      department: selectedCandidate.department,
      experienceYears: selectedCandidate.experienceYears,
      skills: focusTerms,
      jobDescription: selectedCandidate.jobDescription,
      cvText: cvContext,
      cvFileName: selectedCandidate.cvFileName || "",
      difficulty: "medium",
      interviewStyle: "formal",
      questionCount: 10,
      userNotes: [
        selectedCandidate.notes,
        cvContext,
        selectedCandidate.jobDescription,
        focusTerms.length ? `CV/Pozisyon odak terimleri: ${focusTerms.join(", ")}` : "",
      ].filter(Boolean).join("\n\n"),
    }, { maxRetries: 1, timeoutMs: 120000 });

    if (!questionResult.error && Array.isArray(questionResult.data?.questions)) {
      questions = questionResult.data.questions as InterviewQuestion[];
    } else {
      questions = buildFallbackQuestions(selectedCandidate);
      if (questionResult.error) toast.warning(getErrorToastMessage(questionResult.error));
    }

    const content: CandidateAiContent = {
      preEvaluation,
      questions,
      questionsText: formatQuestions(questions),
      generatedAt: new Date().toISOString(),
    };

    setAiContentByCandidate((previous) => ({ ...previous, [selectedCandidate.id]: content }));
    setAiPreparing(false);
    setStatusMessage("AI ön değerlendirme ve önerilen sorular hazır.");
    toast.success("AI ön hazırlık tamamlandı");
  };

  const captureFrame = useCallback(() => {
    return captureVideoFrameDataUrl(videoRef.current);
  }, []);

  const runLiveEmotionSample = useCallback(async () => {
    if (!selectedCandidate || emotionBusyRef.current || frameBufferRef.current.length === 0) return;
    const now = Date.now();
    if (now - lastEmotionAtRef.current < LIVE_EMOTION_ANALYSIS_INTERVAL_MS) return;

    emotionBusyRef.current = true;
    setEmotionAnalyzing(true);
    setEmotionError(null);
    lastEmotionAtRef.current = now;
    const frames = sampleLatestFrames(frameBufferRef.current, LIVE_EMOTION_FRAME_BATCH_SIZE);
    if (frames.length === 0) {
      emotionBusyRef.current = false;
      setEmotionAnalyzing(false);
      return;
    }

    try {
      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_FACIAL, {
        frames,
        participants: [selectedCandidate.fullName],
      }, { maxRetries: 0, timeoutMs: 45000 });

      if (!result.error && result.data?.analysis) {
        const analysis = result.data.analysis as FacialAnalysisRecord;
        const standardEmotion = normalizeEmotionAnalysis(analysis);
        const sampleTs = Date.now();
        const sourceEmotion = moodToLocalEmotion(analysis.dominant_mood);
        setLiveEmotion({
          label: formatSignal(analysis.dominant_mood, "kanıt yetersiz"),
          engagement: formatSignal(analysis.average_engagement, "kanıt yetersiz"),
          confidence: formatSignal(analysis.average_confidence, "kanıt yetersiz"),
          updatedAt: sampleTs,
          sourceEmotion,
          raw: analysis,
          standard: standardEmotion,
        });
        setEmotionSamples((previous) => [
          ...previous.filter((sample) => sampleTs - sample.ts <= LIVE_EMOTION_WINDOW_MS),
          {
            emotion: sourceEmotion,
            confidence: standardEmotion.ekman_style_emotion?.confidence ?? confidenceToScore(analysis.average_confidence),
            ts: sampleTs,
          },
        ].slice(-MAX_LIVE_EMOTION_SAMPLES));
        setEmotionResults((previous) => [
          ...previous.filter((item) => sampleTs - item.timestamp <= LIVE_EMOTION_WINDOW_MS),
          { ...standardEmotion, timestamp: sampleTs },
        ].slice(-MAX_LIVE_EMOTION_SAMPLES));
      } else if (result.error) {
        setEmotionError(getErrorToastMessage(result.error));
      }
    } catch (error: unknown) {
      setEmotionError(getErrorMessage(error, "Duygu durum analizi alınamadı."));
    } finally {
      emotionBusyRef.current = false;
      setEmotionAnalyzing(false);
    }
  }, [selectedCandidate]);

  const startFrameCapture = useCallback(() => {
    frameIntervalRef.current = setInterval(() => {
      const frame = captureFrame();
      if (!frame) return;
      frameBufferRef.current = [...frameBufferRef.current, frame].slice(-LIVE_EMOTION_FRAME_BUFFER_SIZE);
      setCapturedFrames(frameBufferRef.current);
      runLiveEmotionSample();
    }, LIVE_EMOTION_CAPTURE_INTERVAL_MS);
  }, [captureFrame, runLiveEmotionSample]);

  const openPreview = async () => {
    if (!selectedCandidate) {
      toast.error("Önce aday kaydı seçin.");
      return;
    }
    if (!selectedAiContent) {
      toast.error("Önce AI ön değerlendirme ve soru setini hazırlayın.");
      return;
    }

    setCameraError(null);
    setTranscript("");
    setTranscriptStatus("idle");
    setTranscriptWarnings([]);
    setTranscriptProviderLabel("");
    setAnalysisData(null);
    setReportId(null);
    setLiveEmotion(null);
    setEmotionSamples([]);
    setEmotionResults([]);
    setEmotionAnalyzing(false);
    setEmotionError(null);
    setNoteDraft("");
    setSessionNotes([]);
    frameBufferRef.current = [];
    setCapturedFrames([]);

    try {
      await refreshAudioDevices();
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraStreamRef.current = cameraStream;
      if (videoRef.current) {
        await attachStreamAndPlay(videoRef.current, cameraStream, "biveyos camera preview");
      }
      setState("preview");
      setStatusMessage("Kamera hazır. Mikrofon kanallarını kontrol edip mülakatı başlatabilirsiniz.");
    } catch (error: unknown) {
      setCameraError(getErrorMessage(error, "Kamera açılamadı."));
      toast.error("Kamera erişimi alınamadı");
    }
  };

  const startAudioMeter = (channelId: string, stream: MediaStream) => {
    const AudioContextCtor = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(stream);
    const data = new Uint8Array(analyser.fftSize);
    source.connect(analyser);

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const centered = value - 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(100, Math.round(rms * 4));
      setChannelLevels((previous) => ({ ...previous, [channelId]: level }));
      const raf = requestAnimationFrame(tick);
      const meter = meterRefs.current.find((item) => item.context === context);
      if (meter) meter.raf = raf;
    };

    const raf = requestAnimationFrame(tick);
    meterRefs.current.push({ context, raf });
  };

  const createRuntime = async (channel: MicChannel): Promise<ChannelRuntime> => {
    const audio: MediaTrackConstraints = channel.deviceId
      ? { deviceId: { exact: channel.deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    const chunks: Blob[] = [];
    const mimeType = chooseAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    startAudioMeter(channel.id, stream);

    const stop = () => new Promise<ChannelCapture>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        resolve({
          channel,
          blob: new Blob(chunks, { type: mimeType || "audio/webm" }),
          mimeType: mimeType || "audio/webm",
        });
      };
      if (recorder.state !== "inactive") {
        recorder.stop();
      } else {
        stream.getTracks().forEach((track) => track.stop());
        resolve({
          channel,
          blob: new Blob(chunks, { type: mimeType || "audio/webm" }),
          mimeType: mimeType || "audio/webm",
        });
      }
    });

    return { channel, recorder, stream, chunks, mimeType, stop };
  };

  const startLiveTranscript = () => {
    stopLiveTranscript();
    setTranscriptStatus("live_starting");
    liveTranscriptErrorCountRef.current = 0;
    const SpeechRecognition = (window as WindowWithSpeechRecognition).SpeechRecognition
      || (window as WindowWithSpeechRecognition).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setTranscriptStatus("live_unsupported");
      setTranscriptWarnings((previous) => Array.from(new Set([
        ...previous,
        "Tarayıcı canlı transkript desteği sunmuyor. Final STT kayıt bitince denenecek.",
      ])));
      setTranscript("[Sistem]\nTarayıcı canlı transkript desteği sunmuyor. Nihai transkript kayıt bitince mikrofon kanallarından hazırlanacak.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "tr-TR";
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const item = event.results[index];
        const phrase = item[0].transcript.trim();
        if (!phrase) continue;
        if (item.isFinal) finalTranscript += `${phrase} `;
        else interimTranscript += `${phrase} `;
      }
      const text = finalTranscript.trim();
      const speaker = channels[0]?.speaker || "Canlı Taslak";
      const timestamp = formatClock(durationRef.current);
      if (text) {
        liveTranscriptFinalRef.current = `${liveTranscriptFinalRef.current}${liveTranscriptFinalRef.current.trim() ? "\n\n" : ""}[${speaker} • ${timestamp}]\n${text}`;
      }
      const interimText = interimTranscript.trim();
      if (text || interimText) {
        setTranscriptStatus("live_active");
        setTranscript([
          liveTranscriptFinalRef.current.trim(),
          interimText ? `[Canlı Taslak • ${timestamp}]\n${interimText}` : "",
        ].filter(Boolean).join("\n\n"));
      }
    };
    recognition.onerror = (event: SpeechRecognitionErrorLike) => {
      console.warn("Biveyos live transcript error:", event.error);
      liveTranscriptErrorCountRef.current += 1;
      const shouldDisableLiveTranscript = event.error === "network" && liveTranscriptErrorCountRef.current >= 3;
      const message = shouldDisableLiveTranscript
        ? "Canlı transkript tarayıcı servisi kullanılamıyor. Kayıt sonunda final transkript otomatik denenecek."
        : event.error === "not-allowed"
        ? "Tarayıcı canlı transkript için mikrofon izni vermedi."
        : event.error === "language-not-supported"
          ? "Tarayıcı Türkçe canlı transkripti desteklemiyor. Nihai transkript kayıt bitince mikrofon kanallarından hazırlanacak."
          : "Canlı transkript kesildi. Nihai transkript kayıt bitince mikrofon kanallarından hazırlanacak.";
      setTranscript((previous) => previous.trim() ? previous : `[Canlı Transkript Uyarısı]\n${message}`);
      setTranscriptWarnings((previous) => Array.from(new Set([...previous, message])));
      if (shouldDisableLiveTranscript) {
        recognition.onend = null;
        recognitionRef.current = null;
        setTranscriptStatus("live_unsupported");
        try {
          recognition.stop();
        } catch {
          // Browser may already have stopped SpeechRecognition after network failure.
        }
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      if (liveTranscriptErrorCountRef.current >= 3) return;
      const stillRecording = runtimesRef.current.some((runtime) => runtime.recorder.state === "recording");
      if (!stillRecording) return;
      window.setTimeout(() => {
        if (recognitionRef.current !== recognition) return;
        try {
          recognition.start();
        } catch (error) {
          console.warn("Biveyos live transcript restart failed", error);
        }
      }, 500);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error) {
      console.warn("Biveyos live transcript could not start", error);
      setTranscriptStatus("live_unsupported");
      setTranscriptWarnings((previous) => Array.from(new Set([
        ...previous,
        "Canlı transkript başlatılamadı. Final STT kayıt bitince denenecek.",
      ])));
      recognitionRef.current = null;
    }
  };

  const startInterview = async () => {
    if (!selectedCandidate) return;
    if (channels.length === 0) {
      toast.error("En az bir mikrofon kanalı ekleyin.");
      return;
    }
    if (duplicateDeviceSelected) {
      toast.warning("Aynı mikrofon birden fazla kanalda seçili. Ayrı konuşmacı ayrımı için farklı cihazlar kullanın.");
    }

    try {
      const runtimes = await Promise.all(channels.map(createRuntime));
      runtimesRef.current = runtimes;
      runtimes.forEach((runtime) => runtime.recorder.start(1000));
      setDuration(0);
      durationRef.current = 0;
      liveTranscriptFinalRef.current = "";
      setTranscript("");
      setTranscriptStatus("recording");
      setTranscriptWarnings([]);
      setTranscriptProviderLabel("");
      setLiveEmotion(null);
      setEmotionSamples([]);
      setEmotionResults([]);
      setEmotionError(null);
      setEmotionAnalyzing(false);
      setNoteDraft("");
      setSessionNotes([]);
      lastEmotionAtRef.current = 0;
      timerRef.current = setInterval(() => {
        setDuration((value) => {
          const next = value + 1;
          durationRef.current = next;
          return next;
        });
      }, 1000);
      startLiveTranscript();
      startFrameCapture();
      setState("recording");
      setStatusMessage("Çoklu mikrofon kayıtları ve duygu durum sistemi canlı izleniyor.");
      toast.success("Biveyos mülakatı başladı");
    } catch (error: unknown) {
      cleanupSessionMedia();
      toast.error(getErrorMessage(error, "Mikrofon kayıtları başlatılamadı"));
      setStatusMessage("Mikrofon başlatma hatası. Cihaz izinlerini kontrol edin.");
    }
  };

  const transcribeChannel = async (capture: ChannelCapture, userId: string, recordingInfo: RecordingInfo): Promise<ChannelTranscript> => {
    const normalizedMimeType = normalizeAudioMimeType(capture.mimeType);
    const extension = extensionForMimeType(normalizedMimeType);
    const audioPath = `${userId}/biveyos-${Date.now()}-${capture.channel.id}.${extension}`;

    if (!capture.blob || capture.blob.size < 1024) {
      const error = `Ses kaydı alınamadı veya dosya çok küçük (${capture.blob?.size || 0} byte).`;
      const result = normalizeTranscriptResult("", { error, warnings: [error] });
      return { channel: capture.channel, transcript: "", result, error };
    }

    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(audioPath, new Blob([capture.blob], { type: normalizedMimeType }), { contentType: normalizedMimeType, upsert: false });

    if (uploadError) {
      const result = normalizeTranscriptResult("", { error: uploadError.message });
      return { channel: capture.channel, transcript: "", result, error: uploadError.message };
    }

    const result = await invokeEdgeFunction<TranscriptionInvokePayload & {
      transcriptResult?: TranscriptResult;
    }>(EDGE_FUNCTIONS.TRANSCRIBE_RECORDING, {
      filePath: audioPath,
      recordingType: "mülakat",
      participants: [capture.channel.speaker],
      recordingInfo,
      interviewQuestions: selectedAiContent?.questions || [],
    }, { maxRetries: 0, timeoutMs: 180000 });

    const normalized = normalizeTranscriptResult(result.data, {
      provider: result.data?.provider,
      error: result.error ? formatTranscriptionFailure(result.error, result.data) : undefined,
      warnings: result.data?.warnings,
    });

    if (result.error || !normalized.text) {
      const errorMessage = result.error ? formatTranscriptionFailure(result.error, result.data) : "Transkript alınamadı.";
      return {
        channel: capture.channel,
        transcript: "",
        result: normalized,
        audioPath,
        error: `${errorMessage} Ses dosyası: ${Math.round(capture.blob.size / 1024)} KB, format: ${normalizedMimeType}`,
      };
    }

    return {
      channel: capture.channel,
      transcript: normalized.text,
      result: normalized,
      audioPath,
    };
  };

  const endInterview = async () => {
    if (!selectedCandidate) return;
    stopLiveTranscript();
    setState("processing");
    setTranscriptStatus("final_preparing");
    setStatusMessage("Kayıtlar durduruluyor ve kanal transkriptleri hazırlanıyor.");
    cleanupIntervals();
    stopMeters();

    const currentRuntimes = runtimesRef.current;
    runtimesRef.current = [];

    try {
      const captures = await Promise.all(currentRuntimes.map((runtime) => runtime.stop()));
      stopCamera();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Oturum bulunamadı");
        setState("preview");
        return;
      }

      const selectedCvContext = buildCandidateCvContext(selectedCandidate);
      const recordingInfo: RecordingInfo = {
        type: "mülakat",
        behavioralAnalysis: true,
        position: selectedCandidate.jobTitle,
        department: selectedCandidate.department,
        experienceYears: selectedCandidate.experienceYears,
        candidateName: selectedCandidate.firstName,
        candidateSurname: selectedCandidate.lastName,
        candidateEmail: selectedCandidate.email,
        candidatePhone: selectedCandidate.phone,
        candidateEducation: selectedCandidate.education,
        candidateExperience: selectedCvContext,
        candidateSummary: selectedCvContext,
        interviewNotes: [
          selectedCandidate.cvFileName ? `CV dosyası: ${selectedCandidate.cvFileName}` : "",
          selectedAiContent?.preEvaluation || selectedCandidate.notes,
        ].filter(Boolean).join("\n\n"),
        requiredSkills: [],
        suggestedQuestions: selectedAiContent?.questions || [],
      };

      const channelTranscripts = await Promise.all(
        captures.map((capture) => transcribeChannel(capture, user.id, recordingInfo)),
      );

      const channelStatusInputs = channelTranscripts.map((item) => ({
        speaker: item.channel.speaker,
        transcript: item.transcript,
        error: item.error,
        provider: item.result?.provider,
      }));
      const transcriptPipelineStatus = resolveChannelTranscriptStatus(channelStatusInputs);
      const displayTranscript = buildChannelTranscriptDisplay(channelStatusInputs);
      const analysisTranscript = buildAnalysisTranscriptFromChannels(channelStatusInputs);
      const analysisTranscriptResult = normalizeTranscript(analysisTranscript, {
        warnings: channelTranscripts.flatMap((item) => item.result?.warnings || []),
      });

      setTranscript(displayTranscript);
      setTranscriptWarnings(Array.from(new Set([
        ...analysisTranscriptResult.warnings,
        ...channelStatusInputs.map((item) => item.error).filter(Boolean).map(String),
      ])));
      setTranscriptProviderLabel(formatTranscriptProviderLabel(channelStatusInputs, transcriptPipelineStatus));
      const transcriptReadyForAnalysis = transcriptPipelineStatus !== "failed" && isTranscriptUsableForAnalysis(analysisTranscriptResult);
      setTranscriptStatus(transcriptReadyForAnalysis ? transcriptPipelineStatus : transcriptPipelineStatus === "failed" ? "failed" : "insufficient");
      if (!transcriptReadyForAnalysis) {
        const message = "Transkript üretilemediği için analiz başlatılmadı.";
        setTranscriptWarnings((previous) => Array.from(new Set([...previous, message])));
        setStatusMessage(message);
        setState("idle");
        toast.error(message);
        return;
      }
      setStatusMessage("Duygu sinyalleri ve AI mülakat raporu hazırlanıyor.");

      const sessionNotePayload = sessionNotes
        .slice()
        .reverse()
        .map(({ id, ...note }) => note);
      const localEmotionObservation = emotionObservation.total > 0 ? emotionObservation : null;
      let finalEmotionResults = emotionResults;
      let facialAnalysis: FacsAuSessionResult = facsSessionResult;
      if (frameBufferRef.current.length > 0) {
        const facialResult = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_FACIAL, {
          frames: sampleLatestFrames(frameBufferRef.current, LIVE_EMOTION_FRAME_BATCH_SIZE),
          participants: [selectedCandidate.fullName],
        }, { maxRetries: 0, timeoutMs: 30000 });

        if (!facialResult.error && facialResult.data?.analysis) {
          const finalStandardEmotion = normalizeEmotionAnalysis(facialResult.data.analysis as FacialAnalysisRecord);
          finalEmotionResults = [...emotionResults, finalStandardEmotion];
          facialAnalysis = buildFacsAuSessionResult(finalEmotionResults);
          setEmotionResults(finalEmotionResults.slice(-MAX_LIVE_EMOTION_SAMPLES));
        }
      }

      let fullAnalysis: AnalysisRecord = {
        ...buildLocalFallbackAnalysis(selectedCandidate, analysisTranscriptResult.transcript, facialAnalysis, channelTranscripts),
        timestamped_notes: sessionNotePayload,
        live_emotion_observation: localEmotionObservation,
      };

      const analysisResult = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_INTERVIEW, {
        transcript: analysisTranscriptResult.transcript,
        recordingInfo: { ...recordingInfo, sourceType: "biveyos_multi_mic" },
        facialAnalysis,
        behavioralAnalysis: true,
        interviewQuestions: recordingInfo.suggestedQuestions,
      }, { maxRetries: 1, timeoutMs: 180000 });

      if (!analysisResult.error && analysisResult.data?.analysis) {
        fullAnalysis = {
          ...(analysisResult.data.analysis as AnalysisRecord),
          facial_analysis: facialAnalysis,
          biveyos_enabled: true,
          biveyos_session: {
            candidate_id: selectedCandidate.id,
            source_type: "biveyos_multi_mic",
            channel_count: channelTranscripts.length,
            audio_files: channelTranscripts.map((item) => ({
              speaker: item.channel.speaker,
              path: item.audioPath || null,
              error: item.error || null,
            })),
            pre_evaluation: selectedAiContent?.preEvaluation || null,
            suggested_questions: selectedAiContent?.questionsText || null,
            live_emotion_observation: localEmotionObservation,
            facs_au_session_result: facialAnalysis,
            timestamped_notes: sessionNotePayload,
          },
        };
      } else if (analysisResult.error) {
        toast.warning(getErrorToastMessage(analysisResult.error));
      }

      const extractedSignals = extractBiveyosSignals(fullAnalysis, "mülakat");
      const extractedMetadata =
        extractedSignals && typeof extractedSignals === "object" && "metadata" in extractedSignals
          ? extractedSignals.metadata
          : {};
      const biveyosSignals = {
        ...(extractedSignals || {}),
        metadata: {
          ...extractedMetadata,
          biveyos_enabled: true,
          source_type: "biveyos_multi_mic",
          channel_count: channelTranscripts.length,
          captured_frame_count: frameBufferRef.current.length,
          timestamped_note_count: sessionNotePayload.length,
        },
      };

      const summary = typeof fullAnalysis.summary === "string"
        ? fullAnalysis.summary
        : "Biveyos çoklu mikrofon mülakatı tamamlandı";

      const { data: recording, error: dbError } = await supabase.from("recordings").insert({
        user_id: user.id,
        title: `${selectedCandidate.jobTitle} - ${selectedCandidate.fullName}`,
        type: "mülakat",
        duration: formatClock(duration),
        transcript: analysisTranscriptResult.transcript,
        analysis_data: fullAnalysis as Json,
        biveyos_signals: biveyosSignals as Json,
        summary,
      }).select("id").single();

      if (dbError) throw dbError;

      setAnalysisData(fullAnalysis);
      setReportId(recording.id);
      setState("done");
      setStatusMessage("Rapor CRM kayıtlarına eklendi.");
      toast.success("Biveyos raporu kaydedildi");
    } catch (error: unknown) {
      console.error("Biveyos session error:", error);
      toast.error(getErrorMessage(error, "Biveyos oturumu işlenemedi"));
      setState("preview");
      setTranscriptStatus("final_failed");
      setTranscriptWarnings((previous) => Array.from(new Set([
        ...previous,
        getErrorMessage(error, "Biveyos oturumu işlenemedi"),
      ])));
      setStatusMessage("Oturum işlenirken hata oluştu. Kayıt izinleri ve Supabase bağlantısını kontrol edin.");
    }
  };

  const resetSession = () => {
    cleanupSessionMedia();
    setState("idle");
    setDuration(0);
    durationRef.current = 0;
    setTranscript("");
    setTranscriptStatus("idle");
    setTranscriptWarnings([]);
    setTranscriptProviderLabel("");
    liveTranscriptFinalRef.current = "";
    setAnalysisData(null);
    setReportId(null);
    setLiveEmotion(null);
    setEmotionSamples([]);
    setEmotionResults([]);
    setEmotionAnalyzing(false);
    setEmotionError(null);
    setNoteDraft("");
    setSessionNotes([]);
    setCapturedFrames([]);
    frameBufferRef.current = [];
    lastEmotionAtRef.current = 0;
    setStatusMessage(embedded
      ? "Mülakat bilgileri alındı. Kamerayı açıp Biveyos canlı oturumunu başlatabilirsiniz."
      : "Aday bilgilerini girin, AI ön hazırlığı oluşturun ve kamerayı açın.");
  };

  const updateChannel = (id: string, patch: Partial<MicChannel>) => {
    setChannels((previous) => previous.map((channel) => channel.id === id ? { ...channel, ...patch } : channel));
  };

  const addChannel = () => {
    const nextNumber = channels.length + 1;
    setChannels((previous) => [
      ...previous,
      {
        id: `speaker-${Date.now()}`,
        speaker: `Görüşmeci ${nextNumber - 1}`,
        deviceId: audioDevices.find((device) => !previous.some((channel) => channel.deviceId === device.deviceId))?.deviceId || audioDevices[0]?.deviceId || "",
      },
    ]);
  };

  const removeChannel = (id: string) => {
    if (channels.length <= 1) {
      toast.error("En az bir mikrofon kanalı kalmalı");
      return;
    }
    setChannels((previous) => previous.filter((channel) => channel.id !== id));
  };

  const sessionSignalsPanel = (
    <FacsSessionSignalsPanel
      result={facsSessionResult}
      analyzing={emotionAnalyzing}
      error={emotionError}
      className="h-full max-h-[300px] overflow-y-auto"
    />
  );

  return (
    <div className="space-y-6 pb-2 lg:pb-[340px]">
      <PageHeader
        title={embedded ? "Biveyos Canlı Mülakat" : "Biveyos Mülakat Konsolu"}
        description={embedded
          ? "Mülakat bilgileri üzerinden çoklu mikrofon, canlı duygu durum ve davranış sinyali analizi"
          : "Manuel aday kaydı, AI ön değerlendirme, çoklu mikrofon kaydı ve davranış sinyali analizi"}
        badge={embedded ? "Anlık Mülakat" : "CRM Entegre"}
        actions={
          <div className="flex items-center gap-2">
            {onBack && (
              <Button variant="outline" size="sm" onClick={onBack} disabled={!canEditSetup}>
                <ArrowRight className="h-4 w-4 rotate-180" /> Bilgilere Dön
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={refreshAudioDevices} disabled={!canEditSetup}>
              <RefreshCw className="h-4 w-4" /> Cihazları Yenile
            </Button>
            {reportId && (
              <Button size="sm" onClick={() => navigate(`/dashboard/meetings/${reportId}`)}>
                <FileText className="h-4 w-4" /> Raporu Aç
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label={embedded ? "Mülakat" : "Aday Kaydı"} value={embedded ? "Hazır" : candidates.length} />
        <StatCard icon={Mic} label="Mikrofon Kanalı" value={channels.length} iconColor="bg-primary/10 text-primary" />
        <StatCard icon={Camera} label="Görüntü Örneği" value={capturedFrames.length} iconColor="bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]" />
        <StatCard icon={Brain} label="Rapor Skoru" value={reportScore > 0 ? reportScore : "—"} iconColor="bg-accent/10 text-accent" />
      </div>

      {(deviceError || cameraError || duplicateDeviceSelected) && (
        <div className="rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 text-[hsl(var(--warning))]" />
            <div className="space-y-1">
              {deviceError && <p>{deviceError}</p>}
              {cameraError && <p>{cameraError}</p>}
              {duplicateDeviceSelected && <p>Aynı fiziksel mikrofon birden fazla kanalda seçili. Konuşmacı ayrımı için farklı giriş cihazları önerilir.</p>}
            </div>
          </div>
        </div>
      )}

      <div className={embedded ? "grid grid-cols-1 gap-5" : "grid grid-cols-1 xl:grid-cols-[430px_minmax(0,1fr)] gap-5"}>
        {!embedded && <section className="space-y-5">
          <div className="rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="font-display text-sm font-semibold">Aday Bilgileri</h2>
                <p className="text-xs text-muted-foreground">Adayı ve başvurduğu pozisyonu manuel girin.</p>
              </div>
              <Button variant="outline" size="sm" onClick={newCandidate} disabled={!canEditSetup}>
                <UserPlus className="h-4 w-4" /> Yeni
              </Button>
            </div>
            <div className="grid gap-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ad</Label>
                  <Input value={form.firstName} onChange={(event) => updateForm({ firstName: event.target.value })} disabled={!canEditSetup} />
                </div>
                <div className="space-y-1.5">
                  <Label>Soyad</Label>
                  <Input value={form.lastName} onChange={(event) => updateForm({ lastName: event.target.value })} disabled={!canEditSetup} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>E-posta</Label>
                  <Input value={form.email} onChange={(event) => updateForm({ email: event.target.value })} disabled={!canEditSetup} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefon</Label>
                  <Input value={form.phone} onChange={(event) => updateForm({ phone: event.target.value })} disabled={!canEditSetup} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Başvurduğu Pozisyon</Label>
                <Input value={form.jobTitle} onChange={(event) => updateForm({ jobTitle: event.target.value })} disabled={!canEditSetup} placeholder="Örn. Backend Developer" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Departman</Label>
                  <Input value={form.department} onChange={(event) => updateForm({ department: event.target.value })} disabled={!canEditSetup} />
                </div>
                <div className="space-y-1.5">
                  <Label>Deneyim Yılı</Label>
                  <Input value={form.experienceYears} onChange={(event) => updateForm({ experienceYears: event.target.value })} disabled={!canEditSetup} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Eğitim</Label>
                <Input value={form.education} onChange={(event) => updateForm({ education: event.target.value })} disabled={!canEditSetup} placeholder="Örn. Üniversite, yüksek lisans" />
              </div>
              <div className="space-y-1.5">
                <Label>İş Tanımı</Label>
                <Textarea value={form.jobDescription} onChange={(event) => updateForm({ jobDescription: event.target.value })} disabled={!canEditSetup} className="min-h-[120px]" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label>CV</Label>
                  <div className="relative">
                    <input
                      type="file"
                      accept={ACCEPTED_CV_FILE_FORMATS}
                      disabled={!canEditSetup || cvParsing}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void handleCvFileUpload(file);
                      }}
                    />
                    <Button variant="outline" size="sm" type="button" disabled={!canEditSetup || cvParsing}>
                      {cvParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      CV Yükle
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={form.cvText}
                  onChange={(event) => updateForm({ cvText: event.target.value, cvFileName: form.cvFileName })}
                  disabled={!canEditSetup || cvParsing}
                  className="min-h-[160px]"
                  placeholder="CV dosyası yükleyin veya adayın deneyim, proje, yetkinlik ve eğitim bilgilerini buraya yapıştırın."
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>{form.cvFileName ? `Yüklenen CV: ${form.cvFileName}` : "PDF, DOCX, TXT, MD veya RTF desteklenir."}</span>
                  <span>{form.cvText.trim().length} karakter</span>
                </div>
                {cvParseMessage && <p className="text-[11px] text-muted-foreground">{cvParseMessage}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>İK Notu</Label>
                <Textarea value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} disabled={!canEditSetup} className="min-h-[90px]" />
              </div>
              <Button onClick={saveCandidate} disabled={!canEditSetup}>
                <Save className="h-4 w-4" /> Adayı Kaydet
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card">
            <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold">Oluşturulan Adaylar</h2>
              <Badge variant={candidateStorageSource === "supabase" ? "default" : "outline"} className="text-[10px]">
                {candidateStorageSource === "supabase" ? "Bulut senkron" : candidateStorageSource === "local" ? "Yerel mod" : "Yükleniyor"}
              </Badge>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-3 space-y-2">
              {candidates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Henüz aday kaydı yok. İlk adayınızı yukarıdaki formdan oluşturun.
                </div>
              ) : candidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className={`rounded-lg border p-3 transition-all ${
                    candidate.id === selectedCandidateId
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-background"
                  }`}
                >
                  <button
                    onClick={() => selectCandidate(candidate)}
                    disabled={!canEditSetup}
                    className="w-full text-left disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-sm font-semibold">{candidate.fullName}</p>
                      <Badge variant={aiContentByCandidate[candidate.id] ? "default" : "outline"} className="shrink-0 text-[10px]">
                        {aiContentByCandidate[candidate.id] ? "AI Hazır" : "Hazırlık"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{candidate.jobTitle}</p>
                    {candidate.cvFileName && <p className="mt-1 text-[11px] text-muted-foreground">CV: {candidate.cvFileName}</p>}
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{compactText(candidate.cvText, 140)}</p>
                  </button>
                  <div className="mt-3 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => deleteCandidate(candidate.id)} disabled={!canEditSetup}>
                      <Trash2 className="h-4 w-4" /> Sil
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>}

        <section className="space-y-5">
          {!embedded && <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            {selectedCandidate ? (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10">{selectedCandidate.source}</Badge>
                    {selectedCandidate.education && <Badge variant="outline">{selectedCandidate.education}</Badge>}
                    {selectedCandidate.experienceYears && <Badge variant="outline">{selectedCandidate.experienceYears} yıl deneyim</Badge>}
                  </div>
                  <h2 className="mt-3 font-display text-2xl font-bold">{selectedCandidate.fullName}</h2>
                  <p className="text-sm text-muted-foreground">{selectedCandidate.jobTitle}</p>
                </div>
                <Button onClick={prepareAiContent} disabled={aiPreparing || !canEditSetup}>
                  {aiPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                  Ön Değerlendirme ve Soruları AI Hazırlasın
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                Seçili aday yok. Önce aday bilgilerini girip kaydedin.
              </div>
            )}
          </div>}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-card shadow-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <h2 className="font-display text-sm font-semibold">Canlı Oturum</h2>
                    <p className="text-xs text-muted-foreground">{statusMessage}</p>
                  </div>
                  <Badge variant={state === "recording" ? "destructive" : "outline"}>
                    {state === "recording" ? `Canlı ${formatClock(duration)}` : stateLabels[state]}
                  </Badge>
                </div>

                <div className="relative aspect-video bg-black">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className={`h-full w-full object-cover ${state === "preview" || state === "recording" ? "block" : "hidden"}`}
                  />

                  {state === "idle" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10">
                        <Camera className="h-8 w-8 text-primary" />
                      </div>
                      <p className="mb-5 text-sm text-muted-foreground">
                        {embedded ? "Mülakat bilgileri hazır. Kamerayı açıp Biveyos canlı oturumunu başlatın." : "Aday kaydı ve AI ön hazırlık tamamlandıysa kamerayı açın."}
                      </p>
                      <Button onClick={openPreview} disabled={!selectedCandidate || !selectedAiContent}>
                        <Camera className="h-4 w-4" /> Kamerayı Aç
                      </Button>
                    </div>
                  )}

                  {state === "recording" && (
                    <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-destructive-foreground" />
                      KAYIT • {formatClock(duration)}
                    </div>
                  )}

                  {state === "processing" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm">
                      <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
                      <p className="font-display text-lg font-semibold">Biveyos raporu hazırlanıyor</p>
                      <p className="mt-1 text-sm text-muted-foreground">Ses kanalları, transkript ve görsel sinyaller birleştiriliyor.</p>
                    </div>
                  )}

                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 p-4">
                  {state === "preview" && (
                    <Button onClick={startInterview} size="lg">
                      <Video className="h-4 w-4" /> Mülakatı Başlat
                    </Button>
                  )}
                  {state === "recording" && (
                    <Button onClick={endInterview} variant="destructive" size="lg">
                      <Square className="h-4 w-4" /> Mülakatı Bitir
                    </Button>
                  )}
                  {state === "done" && (
                    <>
                      <Button onClick={resetSession} variant="outline" size="lg">
                        <RefreshCw className="h-4 w-4" /> Yeni Oturum
                      </Button>
                      {reportId && (
                        <Button onClick={() => navigate(`/dashboard/meetings/${reportId}`)} size="lg">
                          Rapor Detayına Git <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                  {state === "preview" && (
                    <Button onClick={resetSession} variant="ghost">
                      İptal
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card shadow-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <h2 className="font-display text-sm font-semibold">Mikrofon Kanalları</h2>
                    <p className="text-xs text-muted-foreground">Her konuşmacı için ayrı giriş cihazı seçin.</p>
                  </div>
                  <Button onClick={addChannel} variant="outline" size="sm" disabled={!canEditSetup}>
                    <Plus className="h-4 w-4" /> Kanal
                  </Button>
                </div>

                <div className="divide-y divide-border">
                  {channels.map((channel) => (
                    <div key={channel.id} className="grid gap-3 p-4 md:grid-cols-[180px_minmax(0,1fr)_130px_40px] md:items-center">
                      <Input
                        value={channel.speaker}
                        onChange={(event) => updateChannel(channel.id, { speaker: event.target.value })}
                        disabled={!canEditSetup}
                        placeholder="Konuşmacı"
                      />
                      <Select
                        value={channel.deviceId || "default"}
                        onValueChange={(value) => updateChannel(channel.id, { deviceId: value === "default" ? "" : value })}
                        disabled={!canEditSetup}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Mikrofon seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Varsayılan Mikrofon</SelectItem>
                          {audioDevices.filter((device) => Boolean(device.deviceId)).map((device, index) => (
                            <SelectItem key={device.deviceId} value={device.deviceId}>
                              {device.label || `Mikrofon ${index + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Volume2 className="h-3 w-3" /> Seviye</span>
                          <span>{channelLevels[channel.id] || 0}%</span>
                        </div>
                        <Progress value={channelLevels[channel.id] || 0} className="h-1.5" />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeChannel(channel.id)} disabled={!canEditSetup}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-card shadow-card">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="font-display text-sm font-semibold">AI Ön Hazırlık</h2>
                </div>
                <div className="space-y-3 p-4">
                  <Textarea
                    value={selectedAiContent?.preEvaluation || "AI ön değerlendirme henüz hazırlanmadı."}
                    readOnly
                    className="min-h-[150px] resize-none text-xs leading-5"
                  />
                  <Textarea
                    value={selectedAiContent?.questionsText || "Önerilen sorular henüz hazırlanmadı."}
                    readOnly
                    className="min-h-[150px] resize-none text-xs leading-5"
                  />
                </div>
              </div>

              {analysisData && (
                <div className="rounded-xl border border-border bg-card shadow-card">
                  <div className="border-b border-border px-4 py-3">
                    <h2 className="font-display text-sm font-semibold">Son Rapor Özeti</h2>
                  </div>
                  <div className="space-y-3 p-4">
                    {analysisData?.summary && <p className="text-sm text-muted-foreground">{String(analysisData.summary)}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-5">
            <TranscriptViewer
              transcript={transcript}
              title="Canlı Transkript"
              description="Canlı taslak ve kayıt sonrası kesin transkript bu panelde ayrı durum etiketiyle görünür."
              statusLabel={transcriptStatusLabels[transcriptStatus]}
              providerLabel={transcriptProviderLabel}
              warnings={transcriptWarnings}
              emptyMessage={selectedCandidate
                ? "Henüz konuşma algılanmadı. Mülakat başladığında transkript bu panelde görünecek."
                : "Transkript için önce mülakat bilgilerini kaydedin."}
              heightClassName="h-[320px]"
            />
          </div>
        </section>
      </div>

      <section className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:px-6 lg:fixed lg:left-60 lg:right-0 lg:mx-0 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {sessionSignalsPanel}

          <div className="rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div>
                <h2 className="font-display text-sm font-semibold">Zaman Damgalı Notlar</h2>
                <p className="text-xs text-muted-foreground">Geçerli süre: {formatClock(duration)}</p>
              </div>
              <Badge variant="outline">{sessionNotes.length} not</Badge>
            </div>
            <div className="grid gap-2 p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <Textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  disabled={!selectedCandidate || state === "idle" || state === "processing"}
                  placeholder="Bu ana ait görüşme notunu yazın..."
                  className="min-h-[60px] resize-none"
                />
                <Button
                  onClick={addTimestampedNote}
                  disabled={!selectedCandidate || state === "idle" || state === "processing" || !noteDraft.trim()}
                  className="md:self-end"
                >
                  <MessageSquarePlus className="h-4 w-4" /> Not Ekle
                </Button>
              </div>

              <div className="max-h-[160px] overflow-y-auto space-y-2">
                {sessionNotes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                    Henüz zaman damgalı not yok.
                  </div>
                ) : sessionNotes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-border bg-background p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">{note.timestampLabel}</Badge>
                        <Badge variant="outline">{note.emotionObservationLabel}</Badge>
                        <span className="text-xs text-muted-foreground">{note.emotionLabel}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteTimestampedNote(note.id)} disabled={state === "processing"}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-2 text-sm leading-6">{note.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default BiveyosPage;
