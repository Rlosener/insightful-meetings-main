import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video, Square, Camera, Loader2, Clock, RotateCcw, CheckCircle2, Lightbulb, ArrowRight, Upload, Globe, AlertCircle, Mic, Plus, Trash2, Volume2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RecordingInfo, InterviewQuestion } from "@/types/recording";
import { extractBiveyosSignals } from "@/types/biveyos";
import RecordingSetupForm from "@/components/RecordingSetupForm";
import RecordingAnalysis from "@/components/RecordingAnalysis";
import InterviewQuestionsSidebar from "@/components/InterviewQuestionsSidebar";
import MeetingAssistantChat from "@/components/MeetingAssistantChat";
import { TranscriptViewer } from "@/components/TranscriptViewer";
import FileUploadSection from "@/components/FileUploadSection";
import ZoomImportSection from "@/components/ZoomImportSection";
import GoogleMeetSection from "@/components/GoogleMeetSection";
import BiveyosPage from "./BiveyosPage";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { captureVideoFrameDataUrl, sampleLatestFrames } from "@/lib/frameSampling";
import { attachStreamAndPlay } from "@/lib/mediaPlayback";
import { EDGE_FUNCTIONS } from "@/config/api";

type AnalysisMode = "live" | "file" | "zoom" | "meet";
type RecordingState = "setup" | "questions" | "biveyos" | "idle" | "previewing" | "recording" | "recorded" | "analyzing" | "done";

interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp: number;
}

type AnalysisData = Record<string, unknown>;

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
  webkitAudioContext?: typeof AudioContext;
};

interface MicChannel {
  id: string;
  speaker: string;
  deviceId: string;
}

const DEFAULT_MIC_CHANNELS: MicChannel[] = [
  { id: "speaker-1", speaker: "Konuşmacı 1", deviceId: "" },
];
const FRAME_CAPTURE_INTERVAL_MS = 2000;
const FACIAL_ANALYSIS_FRAME_COUNT = 4;

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
  if (blob.type.includes("mp4")) return "m4a";
  if (blob.type.includes("mpeg")) return "mp3";
  if (blob.type.includes("wav")) return "wav";
  if (blob.type.startsWith("audio/")) return "weba";
  return "webm";
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const RecordPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AnalysisMode>("live");
  const [state, setState] = useState<RecordingState>("setup");
  const [recordingInfo, setRecordingInfo] = useState<RecordingInfo | null>(null);
  const [duration, setDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [currentSpeakerIndex, setCurrentSpeakerIndex] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [micChannels, setMicChannels] = useState<MicChannel[]>(DEFAULT_MIC_CHANNELS);
  const [micLevels, setMicLevels] = useState<Record<string, number>>({});
  const [micError, setMicError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioInputStreamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micMeterRafsRef = useRef<number[]>([]);
  const chunksRef = useRef<Blob[]>([]);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const durationRef = useRef(0);
  const liveTranscriptFinalRef = useRef("");
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAudioResources = useCallback(() => {
    micMeterRafsRef.current.forEach((raf) => cancelAnimationFrame(raf));
    micMeterRafsRef.current = [];
    audioInputStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    audioInputStreamsRef.current = [];
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    setMicLevels({});
  }, []);

  const stopStream = useCallback(() => {
    stopAudioResources();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [stopAudioResources]);

  const stopLiveFeatures = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
      audioRecorderRef.current.onstop = null;
      audioRecorderRef.current.stop();
    }
    audioRecorderRef.current = null;
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    stopStream();
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stopStream]);

  const resetLiveSession = useCallback(() => {
    stopLiveFeatures();
    setCameraError(null);
    setMicError(null);
    setRecordedBlob(null);
    setRecordedAudioBlob(null);
    setDuration(0);
    setRecordingInfo(null);
    setTranscript("");
    setTranscriptEntries([]);
    setCurrentSpeakerIndex(0);
    setCapturedFrames([]);
    setAnalysisData(null);
    setState("setup");
    if (playbackRef.current) playbackRef.current.src = "";
  }, [stopLiveFeatures]);

  const buildDefaultMicChannels = useCallback((info: RecordingInfo): MicChannel[] => {
    const labels = info.type === "toplantı"
      ? (info.participants && info.participants.length > 0 ? info.participants : ["Konuşmacı 1"])
      : ["Aday", "Görüşmeci"];

    return labels.slice(0, Math.max(1, Math.min(labels.length, 4))).map((speaker, index) => ({
      id: `speaker-${index + 1}`,
      speaker,
      deviceId: audioDevices[index]?.deviceId || audioDevices[0]?.deviceId || "",
    }));
  }, [audioDevices]);

  const refreshAudioDevices = useCallback(async () => {
    setMicError(null);
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setMicError("Tarayıcı mikrofon listelemeyi desteklemiyor.");
        return;
      }

      let permissionStream: MediaStream | null = null;
      try {
        permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        setMicError("Mikrofon izni verilmedi. Varsayılan mikrofonla devam edilebilir.");
      } finally {
        permissionStream?.getTracks().forEach((track) => track.stop());
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === "audioinput");
      setAudioDevices(inputs);
      setMicChannels((previous) => previous.map((channel, index) => ({
        ...channel,
        deviceId: channel.deviceId || inputs[index]?.deviceId || inputs[0]?.deviceId || "",
      })));
    } catch (error: unknown) {
      setMicError(getErrorMessage(error, "Mikrofonlar okunamadı."));
    }
  }, []);

  useEffect(() => {
    return () => stopLiveFeatures();
  }, [stopLiveFeatures]);

  useEffect(() => {
    refreshAudioDevices();
  }, [refreshAudioDevices]);

  useEffect(() => {
    if (mode === "live") return;
    stopLiveFeatures();
    setCameraError(null);
  }, [mode, stopLiveFeatures]);

  const handleSetupComplete = (info: RecordingInfo) => {
    setRecordingInfo(info);
    setMicChannels(buildDefaultMicChannels(info));
    if (info.type === "mülakat") {
      setState("biveyos");
      return;
    }
    // If interview with questions, show questions review first
    if (info.type === "mülakat" && info.suggestedQuestions && info.suggestedQuestions.length > 0) {
      setState("questions");
    } else {
      setState("idle");
    }
  };

  const duplicateMicDeviceSelected = useMemo(() => {
    const ids = micChannels.map((channel) => channel.deviceId).filter(Boolean);
    return ids.length > 1 && ids.length !== new Set(ids).size;
  }, [micChannels]);

  const updateMicChannel = (id: string, patch: Partial<MicChannel>) => {
    setMicChannels((previous) => previous.map((channel) => (
      channel.id === id ? { ...channel, ...patch } : channel
    )));
  };

  const addMicChannel = () => {
    setMicChannels((previous) => {
      const nextIndex = previous.length + 1;
      const unusedDevice = audioDevices.find((device) => !previous.some((channel) => channel.deviceId === device.deviceId));
      return [
        ...previous,
        {
          id: `speaker-${Date.now()}`,
          speaker: recordingInfo?.type === "toplantı" ? `Katılımcı ${nextIndex}` : `Konuşmacı ${nextIndex}`,
          deviceId: unusedDevice?.deviceId || audioDevices[0]?.deviceId || "",
        },
      ];
    });
  };

  const removeMicChannel = (id: string) => {
    if (micChannels.length <= 1) {
      toast.error("En az bir mikrofon kanalı kalmalı.");
      return;
    }
    setMicChannels((previous) => previous.filter((channel) => channel.id !== id));
  };

  const proceedToCamera = () => {
    setCameraError(null);
    setState("idle");
  };

  const openCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        await attachStreamAndPlay(videoRef.current, stream, "record camera preview");
      }
      setState("previewing");
    } catch (err) {
      setCameraError("Kamera erişimi reddedildi. Dosya Yükle akışını kullanmaya devam edebilirsiniz.");
      console.error("Camera error:", err);
    }
  };

  const captureFrame = useCallback(() => {
    const frameDataUrl = captureVideoFrameDataUrl(videoRef.current);
    if (frameDataUrl) setCapturedFrames((prev) => [...prev, frameDataUrl].slice(-90));
  }, []);

  const createMixedRecordingStream = async () => {
    if (!streamRef.current) throw new Error("Kamera akışı bulunamadı.");

    stopAudioResources();
    const AudioContextCtor = window.AudioContext || (window as WindowWithSpeechRecognition).webkitAudioContext;
    if (!AudioContextCtor) throw new Error("Tarayıcı çoklu mikrofon mikslemeyi desteklemiyor.");

    const selectedChannels = micChannels.length > 0 ? micChannels : DEFAULT_MIC_CHANNELS;
    const audioStreams = await Promise.all(selectedChannels.map((channel) => {
      const audio: MediaTrackConstraints = channel.deviceId
        ? { deviceId: { exact: channel.deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      return navigator.mediaDevices.getUserMedia({ audio, video: false });
    }));

    const audioContext = new AudioContextCtor();
    const destination = audioContext.createMediaStreamDestination();
    audioContextRef.current = audioContext;
    audioInputStreamsRef.current = audioStreams;

    audioStreams.forEach((audioStream, index) => {
      const channel = selectedChannels[index];
      const source = audioContext.createMediaStreamSource(audioStream);
      const gain = audioContext.createGain();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(gain);
      gain.connect(destination);
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const centered = value - 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / data.length);
        setMicLevels((previous) => ({ ...previous, [channel.id]: Math.min(100, Math.round(rms * 4)) }));
        const raf = requestAnimationFrame(tick);
        micMeterRafsRef.current[index] = raf;
      };
      micMeterRafsRef.current[index] = requestAnimationFrame(tick);
    });

    const recordingStream = new MediaStream([
      ...streamRef.current.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    recordingStreamRef.current = recordingStream;
    return recordingStream;
  };

  const startRecording = async () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    audioChunksRef.current = [];
    setTranscript("");
    setTranscriptEntries([]);
    setCurrentSpeakerIndex(0);
    setCapturedFrames([]);
    setMicError(null);
    if (duplicateMicDeviceSelected) {
      toast.warning("Aynı mikrofon birden fazla kanalda seçili. Ayrı konuşmacı ayrımı için farklı cihazlar kullanın.");
    }
    
    // Toplantı katılımcılarını al
    const participants = recordingInfo?.type === "toplantı" 
      ? recordingInfo.participants || [] 
      : [recordingInfo?.candidateName ? `${recordingInfo.candidateName} ${recordingInfo.candidateSurname}` : "Aday"];

    let recordingStream: MediaStream;
    try {
      recordingStream = await createMixedRecordingStream();
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Mikrofonlar başlatılamadı.");
      setMicError(message);
      toast.error(message);
      return;
    }

    durationRef.current = 0;
    liveTranscriptFinalRef.current = "";
    
    // Web Speech API ile transkripsiyon başlat
    const SpeechRecognition = (window as WindowWithSpeechRecognition).SpeechRecognition
      || (window as WindowWithSpeechRecognition).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "tr-TR";
      
      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let finalTranscript = "";
        let interimTranscript = "";
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.trim();
          if (!transcript) continue;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " ";
          } else {
            interimTranscript += transcript + " ";
          }
        }
        
        if (finalTranscript.trim()) {
          const speaker = participants[currentSpeakerIndex % participants.length] || "Konuşmacı";
          const newEntry: TranscriptEntry = {
            speaker,
            text: finalTranscript.trim(),
            timestamp: durationRef.current
          };
          
          setTranscriptEntries(prev => [...prev, newEntry]);
          liveTranscriptFinalRef.current = `${liveTranscriptFinalRef.current}[${speaker}]: ${finalTranscript.trim()}\n\n`;
          
          // Her 3 konuşmada bir sonraki konuşmacıya geç (basit rotasyon)
          if (Math.random() > 0.7) {
            setCurrentSpeakerIndex(prev => prev + 1);
          }
        }

        const interimText = interimTranscript.trim();
        if (finalTranscript.trim() || interimText) {
          setTranscript([
            liveTranscriptFinalRef.current.trim(),
            interimText ? `[Canlı Taslak]: ${interimText}` : "",
          ].filter(Boolean).join("\n\n"));
        }
      };
      
      recognition.onerror = (event: SpeechRecognitionErrorLike) => {
        console.error("Speech recognition error:", event.error);
        const message = event.error === "not-allowed"
          ? "Tarayıcı canlı transkript için mikrofon izni vermedi."
          : event.error === "language-not-supported"
            ? "Tarayıcı Türkçe canlı transkripti desteklemiyor. Kayıt sonunda ses dosyasından transkript hazırlanacak."
            : "Canlı transkript kesildi. Nihai transkript kayıt sonundaki ses dosyasından hazırlanacak.";
        setTranscript((previous) => previous.trim() ? previous : `[Canlı Transkript Uyarısı]\n${message}`);
      };

      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        if (mediaRecorderRef.current?.state !== "recording") return;
        window.setTimeout(() => {
          if (recognitionRef.current !== recognition) return;
          try {
            recognition.start();
          } catch (error) {
            console.warn("Speech recognition restart failed", error);
          }
        }, 500);
      };
      
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (error) {
        console.warn("Speech recognition start failed", error);
        recognitionRef.current = null;
        setTranscript("[Canlı Transkript Uyarısı]\nTarayıcı canlı transkripti başlatamadı. Kayıt sonunda ses dosyasından transkript hazırlanacak.");
      }
    } else {
      setTranscript("[Sistem]\nTarayıcı canlı transkript desteği sunmuyor. Kayıt bitince mikrofon sesinden transkript hazırlanacak.");
    }
    
    // Biveyos kamera sinyalleri için düşük boyutlu kare yakalama
    frameIntervalRef.current = setInterval(() => {
      captureFrame();
    }, FRAME_CAPTURE_INTERVAL_MS);

    const mediaRecorder = new MediaRecorder(recordingStream, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm",
    });
    const audioTracks = recordingStream.getAudioTracks();
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
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      setState("recorded");
      if (playbackRef.current) playbackRef.current.src = URL.createObjectURL(blob);
      stopStream();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(1000);
    setState("recording");
    setDuration(0);
    timerRef.current = setInterval(() => setDuration((p) => {
      const next = p + 1;
      durationRef.current = next;
      return next;
    }), 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
      audioRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  };

  const startAnalysis = async () => {
    if (!recordedBlob) {
      toast.error("Kayıt bulunamadı");
      return;
    }

    setState("analyzing");

    try {
      // 1. Upload video to storage
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Lütfen giriş yapın");
        setState("recorded");
        return;
      }

      const fileName = `${user.id}/${Date.now()}.webm`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("recordings")
        .upload(fileName, recordedBlob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("recordings")
        .getPublicUrl(fileName);

      let analysisTranscript = transcript.trim();
      if (analysisTranscript.length < 50) {
        toast.info("Canlı transkript kısa kaldı. Kayıt sesinden transkript hazırlanıyor.");
        const transcriptionBlob = recordedAudioBlob
          || (audioChunksRef.current.length > 0 ? new Blob(audioChunksRef.current, { type: "audio/webm" }) : null)
          || recordedBlob;
        if (!transcriptionBlob) {
          toast.error("Transkript için ses kaydı bulunamadı.");
          setState("recorded");
          return;
        }
        const transcriptionFileName = `${user.id}/${Date.now()}-transcript.${extensionForBlob(transcriptionBlob)}`;
        const { error: transcriptionUploadError } = await supabase.storage
          .from("recordings")
          .upload(transcriptionFileName, transcriptionBlob, { contentType: transcriptionBlob.type || "application/octet-stream", upsert: true });
        if (transcriptionUploadError) throw transcriptionUploadError;

        const participants = recordingInfo?.type === "toplantı"
          ? recordingInfo.participants || micChannels.map((channel) => channel.speaker)
          : [recordingInfo?.candidateName ? `${recordingInfo.candidateName} ${recordingInfo.candidateSurname}` : "Aday"];
        const transcriptResult = await invokeEdgeFunction<{ transcript: string }>(EDGE_FUNCTIONS.TRANSCRIBE_RECORDING, {
          filePath: transcriptionFileName,
          recordingType: recordingInfo?.type || "toplantı",
          participants,
          recordingInfo,
        }, { maxRetries: 1, timeoutMs: 180000 });

        if (!transcriptResult.error && transcriptResult.data?.transcript) {
          analysisTranscript = transcriptResult.data.transcript.trim();
          setTranscript(analysisTranscript);
        } else if (transcriptResult.error) {
          const message = getErrorToastMessage(transcriptResult.error);
          setTranscript(`[Transkript Hatası]\n${message}\n\nSes dosyası: ${Math.round(transcriptionBlob.size / 1024)} KB, format: ${transcriptionBlob.type || "bilinmiyor"}`);
          toast.error(message);
          setState("recorded");
          return;
        }
      }

      if (analysisTranscript.length < 50) {
        toast.error("Analiz için yeterli transkript oluşmadı. Mikrofonları ve ses seviyesini kontrol edin.");
        setState("recorded");
        return;
      }

      // 2. Mimik analizi yap (eğer frame'ler varsa)
      let facialAnalysis = null;
      if (capturedFrames.length > 0) {
        const participants = recordingInfo?.type === "toplantı" 
          ? recordingInfo.participants 
          : [recordingInfo?.candidateName ? `${recordingInfo.candidateName} ${recordingInfo.candidateSurname}` : undefined].filter(Boolean);

        const facialResult = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_FACIAL, {
          frames: sampleLatestFrames(capturedFrames, FACIAL_ANALYSIS_FRAME_COUNT),
          participants,
        }, { maxRetries: 0, timeoutMs: 30000 });

        if (!facialResult.error && facialResult.data) {
          facialAnalysis = facialResult.data.analysis;
        }
      }

      // 3. Call AI analysis edge function
      const aiResult = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_INTERVIEW, {
        transcript: analysisTranscript,
        recordingInfo: { ...(recordingInfo || {}), sourceType: "live_multi_mic" },
        facialAnalysis,
        behavioralAnalysis: recordingInfo?.behavioralAnalysis,
        interviewQuestions: recordingInfo?.suggestedQuestions,
      });

      if (aiResult.error) {
        toast.error(getErrorToastMessage(aiResult.error));
        setState("recorded");
        return;
      }
      const aiData = aiResult.data;

      // 4. Extract structured BİVEYOS signals
      const fullAnalysis = facialAnalysis 
        ? { ...aiData.analysis, facial_analysis: facialAnalysis }
        : aiData.analysis;
      const extractedSignals = extractBiveyosSignals(fullAnalysis, (recordingInfo?.type || "toplantı") as "mülakat" | "toplantı");
      const extractedMetadata =
        extractedSignals && typeof extractedSignals === "object" && "metadata" in extractedSignals
          ? extractedSignals.metadata
          : {};
      const biveyosSignals = {
        ...(extractedSignals || {}),
        metadata: {
          ...extractedMetadata,
          source_type: "live_multi_mic",
          mic_channel_count: micChannels.length,
          mic_channels: micChannels.map(({ speaker, deviceId }) => ({ speaker, deviceId })),
        },
      };

      // 5. Save to database
      const { data: recordingData, error: dbError } = await supabase.from("recordings").insert({
        user_id: user.id,
        title: recordingInfo?.type === "mülakat" 
          ? `${recordingInfo.position} - ${recordingInfo.candidateName} ${recordingInfo.candidateSurname}`
          : recordingInfo?.meetingTopic || "Yeni Kayıt",
        type: recordingInfo?.type || "toplantı",
        duration: formatTime(duration),
        video_url: publicUrl,
        transcript: analysisTranscript,
        analysis_data: fullAnalysis as Json,
        biveyos_signals: biveyosSignals as Json,
        summary: aiData.analysis.summary
      }).select("id").single();

      if (dbError) throw dbError;

      // 5. Save participant insights to company member profiles
      if (aiData.analysis.participants_analysis && recordingData?.id) {
        invokeEdgeFunction(EDGE_FUNCTIONS.SAVE_MEMBER_INSIGHTS, {
          userId: user.id,
          recordingId: recordingData.id,
          participantsAnalysis: aiData.analysis.participants_analysis,
        }, { maxRetries: 1 }).then(({ data }) => {
          if (data?.matched > 0) {
            toast.info(`${data.matched} personel profiline toplantı verisi kaydedildi`);
          }
        }).catch(console.error);
      }

      setAnalysisData(aiData.analysis);
      setState("done");
      toast.success("Analiz tamamlandı ve kaydedildi!");

    } catch (error: unknown) {
      console.error("Analysis error:", error);
      const message = getErrorMessage(error, "");
      
      if (message.includes("Rate limit")) {
        toast.error("AI istek limiti aşıldı. Lütfen daha sonra tekrar deneyin.");
      } else if (message.includes("Payment required")) {
        toast.error("AI kredisi tükendi. Lütfen Lovable AI workspace'inize kredi ekleyin.");
      } else {
        toast.error("Analiz sırasında bir hata oluştu");
      }
      
      setState("recorded");
    }
  };

  const fullReset = () => {
    resetLiveSession();
  };

  const retakeRecording = () => {
    stopLiveFeatures();
    setCameraError(null);
    setRecordedBlob(null);
    setRecordedAudioBlob(null);
    setDuration(0);
    setState("idle");
    if (playbackRef.current) playbackRef.current.src = "";
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const hasQuestions = recordingInfo?.type === "mülakat" && recordingInfo.suggestedQuestions && recordingInfo.suggestedQuestions.length > 0;
  const showCameraArea = !["setup", "questions", "biveyos"].includes(state);
  const isMeeting = recordingInfo?.type === "toplantı";
  const showMeetingAssistant = isMeeting && (state === "recording" || state === "previewing");
  const canEditMicChannels = state === "idle" || state === "previewing";
  const showTranscriptPanel = showCameraArea && state !== "idle";

  const isLiveActive = mode === "live" && state !== "setup";

  const handleModeChange = (nextMode: AnalysisMode) => {
    if (nextMode !== "live") {
      resetLiveSession();
    } else {
      setCameraError(null);
    }
    setMode(nextMode);
  };

  return (
    <div className={`${state === "biveyos" ? "max-w-7xl" : "max-w-5xl"} mx-auto space-y-6`}>
      <div>
        <h1 className="font-display text-3xl font-bold mb-1">Kayıt Analizi</h1>
        <p className="text-muted-foreground">
          {mode === "file"
            ? "Ses, video veya transkript dosyası yükleyerek AI analizi başlatın"
            : state === "setup"
              ? "Önce kayıt bilgilerini doldurun, AI mülakat sorularını hazırlasın"
              : state === "questions"
                ? "AI pozisyona özel mülakat sorularını hazırladı — inceleyin ve kayda geçin"
                : `${recordingInfo?.type === "mülakat" ? "Mülakat" : "Toplantı"} kaydı — ${recordingInfo?.type === "mülakat" ? recordingInfo.position : recordingInfo?.meetingTopic}`}
        </p>
      </div>

      {/* Mode Selector — only show when live recording hasn't started */}
      {!isLiveActive && (
        <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-muted/50 border border-border w-fit">
          {([
            { key: "live" as const, icon: Camera, label: "Anlık Kayıt" },
            { key: "file" as const, icon: Upload, label: "Dosya Yükle" },
            { key: "zoom" as const, icon: Video, label: "Zoom" },
            { key: "meet" as const, icon: Globe, label: "Google Meet" },
          ]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => handleModeChange(key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === key
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* File Upload Mode */}
      {mode === "file" && <FileUploadSection />}

      {/* Zoom Import Mode */}
      {mode === "zoom" && <ZoomImportSection />}

      {/* Google Meet Mode */}
      {mode === "meet" && <GoogleMeetSection />}

      {/* Live Recording Mode — everything below only renders in live mode */}
      {mode === "live" && (
      <>

      {/* Info summary bar */}
      {state !== "setup" && state !== "questions" && state !== "biveyos" && recordingInfo && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          {recordingInfo.type === "mülakat" ? (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="px-2.5 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium">Mülakat</span>
              <span className="text-muted-foreground"><strong className="text-foreground">Pozisyon:</strong> {recordingInfo.position}</span>
              {recordingInfo.department && <span className="text-muted-foreground"><strong className="text-foreground">Departman:</strong> {recordingInfo.department}</span>}
              <span className="text-muted-foreground"><strong className="text-foreground">Aday:</strong> {recordingInfo.candidateName} {recordingInfo.candidateSurname}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">Toplantı</span>
              <span className="text-muted-foreground"><strong className="text-foreground">Konu:</strong> {recordingInfo.meetingTopic}</span>
              {recordingInfo.participants && recordingInfo.participants.length > 0 && (
                <span className="text-muted-foreground"><strong className="text-foreground">Katılımcılar:</strong> {recordingInfo.participants.join(", ")}</span>
              )}
            </div>
          )}
        </div>
      )}

      {showCameraArea && recordingInfo && (
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" /> Mikrofon Kanalları
              </h2>
              <p className="text-xs text-muted-foreground">
                {recordingInfo.type === "toplantı"
                  ? "Toplantıdaki birden fazla mikrofonu aynı kayda miksleyin."
                  : "Mülakat için birden fazla mikrofon kanalı seçin."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={refreshAudioDevices} disabled={!canEditMicChannels}>
                <RefreshCw className="h-4 w-4" /> Yenile
              </Button>
              <Button variant="outline" size="sm" onClick={addMicChannel} disabled={!canEditMicChannels}>
                <Plus className="h-4 w-4" /> Mikrofon
              </Button>
            </div>
          </div>

          {(micError || duplicateMicDeviceSelected) && (
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 p-3 text-sm text-muted-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                <div className="space-y-1">
                  {micError && <p>{micError}</p>}
                  {duplicateMicDeviceSelected && <p>Aynı fiziksel mikrofon birden fazla kanalda seçili. Ayrı ses kaynakları için farklı cihazlar seçin.</p>}
                </div>
              </div>
            </div>
          )}

          <div className="divide-y divide-border">
            {micChannels.map((channel) => (
              <div key={channel.id} className="grid gap-3 p-4 md:grid-cols-[180px_minmax(0,1fr)_140px_40px] md:items-center">
                <Input
                  value={channel.speaker}
                  onChange={(event) => updateMicChannel(channel.id, { speaker: event.target.value })}
                  disabled={!canEditMicChannels}
                  placeholder="Konuşmacı"
                />
                <Select
                  value={channel.deviceId || "default"}
                  onValueChange={(value) => updateMicChannel(channel.id, { deviceId: value === "default" ? "" : value })}
                  disabled={!canEditMicChannels}
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
                    <span>{micLevels[channel.id] || 0}%</span>
                  </div>
                  <Progress value={micLevels[channel.id] || 0} className="h-1.5" />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeMicChannel(channel.id)} disabled={!canEditMicChannels || micChannels.length <= 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Setup Form */}
      {state === "setup" && <RecordingSetupForm onSubmit={handleSetupComplete} />}

      {/* Biveyos Live Interview Console */}
      {state === "biveyos" && recordingInfo?.type === "mülakat" && (
        <BiveyosPage
          embedded
          initialRecordingInfo={recordingInfo}
          onBack={fullReset}
        />
      )}

      {/* Questions Review Step */}
      {state === "questions" && recordingInfo && hasQuestions && (
        <div className="space-y-6">
          {/* Candidate summary */}
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 shadow-card">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Lightbulb className="h-6 w-6 text-accent" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold mb-1">
                  AI Mülakat Soruları Hazır
                </h2>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{recordingInfo.position}</strong> pozisyonu için{" "}
                  <strong className="text-foreground">{recordingInfo.candidateName} {recordingInfo.candidateSurname}</strong> adayına
                  özel <strong className="text-foreground">{recordingInfo.suggestedQuestions!.length} soru</strong> hazırlandı.
                  Kamera açıldığında sorular ekranın yanında gösterilecek.
                </p>
              </div>
            </div>
          </div>

          {/* Questions preview */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4 max-h-[60vh] overflow-y-auto">
            {Object.entries(
              recordingInfo.suggestedQuestions!.reduce<Record<string, InterviewQuestion[]>>((acc, q) => {
                if (!acc[q.category]) acc[q.category] = [];
                acc[q.category].push(q);
                return acc;
              }, {})
            ).map(([category, qs]) => (
              <div key={category}>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">{category}</p>
                <div className="space-y-1.5">
                  {qs.map((q, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors">
                      <span className="text-xs text-muted-foreground font-mono mt-0.5 shrink-0">{i + 1}.</span>
                      <span className="text-sm text-foreground">{q.question}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button variant="hero" size="lg" onClick={proceedToCamera} className="w-full">
            <Camera className="mr-2 h-5 w-5" /> Kamerayı Aç ve Mülakata Başla
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Camera / Playback Area */}
      {showCameraArea && (
        <>
          <div className="relative rounded-2xl border border-border bg-card overflow-hidden shadow-card aspect-video">
            <video ref={videoRef} muted playsInline className={`w-full h-full object-cover ${state === "previewing" || state === "recording" ? "block" : "hidden"}`} />
            <video ref={playbackRef} controls playsInline className={`w-full h-full object-cover ${state === "recorded" || state === "analyzing" || state === "done" ? "block" : "hidden"}`} />

            {state === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Camera className="h-10 w-10 text-primary" />
                </div>
                <p className="text-muted-foreground mb-6">Kayda başlamak için kameranızı açın</p>
                {cameraError && (
                  <div className="mb-4 flex max-w-md items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{cameraError}</span>
                  </div>
                )}
                <Button variant="hero" size="lg" onClick={openCamera}>
                  <Camera className="mr-2 h-5 w-5" /> Kamerayı Aç
                </Button>
              </div>
            )}

            {state === "recording" && (
              <>
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-destructive/90 backdrop-blur-sm rounded-full px-4 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive-foreground animate-pulse" />
                  <span className="text-sm font-medium text-destructive-foreground">KAYIT • {formatTime(duration)}</span>
                </div>
                {/* Live transcript overlay at bottom */}
                {transcriptEntries.length > 0 && (
                  <div className="absolute bottom-4 left-4 right-4 bg-black/70 backdrop-blur-sm rounded-xl p-3 max-h-32 overflow-hidden">
                    <div className="space-y-1">
                      {transcriptEntries.slice(-3).map((entry, i) => (
                        <p key={i} className="text-sm text-white">
                          <span className="font-bold text-primary-foreground opacity-80">[{entry.speaker}]</span>{" "}
                          {entry.text}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {state === "analyzing" && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                <p className="font-display text-xl font-semibold">AI Detaylı Analiz Yapıyor...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {recordingInfo?.type === "mülakat"
                    ? "Aday performansı, yanıt kalitesi ve pozisyon uygunluğu detaylı analiz ediliyor"
                    : "Toplantı özeti ve aksiyon maddeleri çıkarılıyor"}
                </p>
              </div>
            )}

            {/* Interview questions sidebar during recording */}
            {hasQuestions && (state === "previewing" || state === "recording") && (
              <InterviewQuestionsSidebar
                questions={recordingInfo!.suggestedQuestions!}
                isRecording={state === "recording"}
              />
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {state === "previewing" && (
              <Button variant="hero" size="lg" onClick={startRecording} className="px-10">
                <Video className="mr-2 h-5 w-5" /> Kaydı Başlat
              </Button>
            )}
            {state === "recording" && (
              <Button variant="destructive" size="lg" onClick={stopRecording} className="px-10">
                <Square className="mr-2 h-5 w-5" /> Mülakatı Bitir • {formatTime(duration)}
              </Button>
            )}
            {state === "recorded" && (
              <>
                <Button variant="hero-outline" size="lg" onClick={retakeRecording}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Tekrar Kaydet
                </Button>
                <Button variant="hero" size="lg" onClick={startAnalysis} className="px-10">
                  <CheckCircle2 className="mr-2 h-5 w-5" /> Detaylı Analizi Başlat
                </Button>
              </>
            )}
            {state === "done" && (
              <Button variant="hero-outline" size="lg" onClick={fullReset}>
                <RotateCcw className="mr-2 h-4 w-4" /> Yeni Kayıt Yap
              </Button>
            )}
          </div>

          {showTranscriptPanel && (
            <TranscriptViewer
              entries={state === "done" ? [] : transcriptEntries}
              transcript={transcript}
              title="Canlı Transkript"
              description="Kayıt sırasında yakalanan konuşmalar burada anlık olarak görünür; analizde nihai transkript kullanılır."
              emptyMessage="Henüz konuşma algılanmadı. Kayıt başladığında transkript bu panelde görünecek."
              heightClassName="h-[260px]"
            />
          )}

          {state === "recorded" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> Süre: {formatTime(duration)}</span>
                  <span className="flex items-center gap-1"><Video className="h-4 w-4" /> Boyut: {recordedBlob ? (recordedBlob.size / 1024 / 1024).toFixed(1) : 0} MB</span>
                  <span className="flex items-center gap-1">📸 Yakalanan Frame: {capturedFrames.length}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Meeting Assistant Chat - Show during meeting recording */}
      {showMeetingAssistant && (
        <MeetingAssistantChat 
          transcript={transcript}
          meetingContext={{
            topic: recordingInfo?.meetingTopic,
            agenda: recordingInfo?.meetingAgenda,
            participants: recordingInfo?.participants
          }}
          isRecording={state === "recording"}
        />
      )}

      {/* Analysis Results */}
      {state === "done" && recordingInfo && analysisData && (
        <RecordingAnalysis 
          duration={duration} 
          info={recordingInfo} 
          analysisData={analysisData}
          transcript={transcript}
        />
      )}
      </>
      )}
    </div>
  );
};

export default RecordPage;
