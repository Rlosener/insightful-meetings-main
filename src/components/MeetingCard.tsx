import { Link } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { Calendar, Clock, ChevronRight, Users, FileText, BarChart3, Video, Upload, MonitorPlay } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

type Recording = Tables<"recordings">;

export type MeetingStatus = "completed" | "processing" | "failed" | "pending";
export type MeetingSource = "zoom" | "google-meet" | "upload" | "live";

export const getMeetingStatus = (recording: Recording): MeetingStatus => {
  if (recording.analysis_data) return "completed";
  if (recording.transcript && !recording.analysis_data) return "processing";
  if (recording.summary?.toLowerCase().includes("hata") || recording.summary?.toLowerCase().includes("başarısız")) return "failed";
  return "pending";
};

export const getMeetingSource = (recording: Recording): MeetingSource => {
  const summary = (recording.summary || "").toLowerCase();
  const url = (recording.video_url || "").toLowerCase();
  const metadata = recording.biveyos_signals as { metadata?: { source_type?: string } } | null;
  const sourceType = metadata?.metadata?.source_type?.toLowerCase() || "";

  if (summary.includes("zoom") || url.includes("zoom") || sourceType.includes("zoom")) return "zoom";
  if (summary.includes("google meet") || summary.includes("gmeet") || sourceType.includes("google")) return "google-meet";
  if (sourceType.includes("upload") || sourceType.includes("upload_")) return "upload";
  if (url.includes("/storage/v1/object/public/recordings/") || (url.includes("/") && !url.startsWith("http"))) {
    return summary.includes("canlı") || sourceType.includes("live") ? "live" : "upload";
  }
  if (url.startsWith("http")) return summary.includes("canlı") || sourceType.includes("live") ? "live" : "upload";
  return "live";
};

const statusConfig: Record<MeetingStatus, { label: string; className: string }> = {
  completed: { label: "Tamamlandı", className: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20" },
  processing: { label: "İşleniyor", className: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20" },
  failed: { label: "Başarısız", className: "bg-destructive/10 text-destructive border-destructive/20" },
  pending: { label: "Bekliyor", className: "bg-muted text-muted-foreground border-border" },
};

const sourceConfig: Record<MeetingSource, { label: string; icon: typeof Video; className: string }> = {
  zoom: { label: "Zoom", icon: Video, className: "bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]" },
  "google-meet": { label: "Google Meet", icon: MonitorPlay, className: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" },
  upload: { label: "Yükleme", icon: Upload, className: "bg-accent/10 text-accent" },
  live: { label: "Canlı", icon: Video, className: "bg-primary/10 text-primary" },
};

interface MeetingCardProps {
  recording: Recording;
}

const MeetingCard = ({ recording }: MeetingCardProps) => {
  const status = getMeetingStatus(recording);
  const source = getMeetingSource(recording);
  const analysisData = recording.analysis_data as any;
  const overallScore = analysisData?.overall_score;
  const formattedDate = format(new Date(recording.date), "d MMM yyyy", { locale: tr });
  const participantCount = analysisData?.participants_analysis?.length;
  const actionItemCount = analysisData?.action_items?.length;
  const isClickable = status === "completed";

  const SourceIcon = sourceConfig[source].icon;
  const Wrapper = isClickable ? Link : "div";
  const wrapperProps = isClickable ? { to: `/dashboard/meetings/${recording.id}` } : {};

  return (
    <Wrapper
      {...(wrapperProps as any)}
      className={`group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-150 ${
        isClickable ? "hover:shadow-card-md hover:border-primary/20 cursor-pointer" : "opacity-70"
      }`}
    >
      {/* Score / Source icon */}
      <div className="hidden sm:flex items-center justify-center shrink-0">
        {overallScore !== undefined ? (
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-display text-sm font-bold ${
            overallScore >= 80 ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
              : overallScore >= 60 ? "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
              : "bg-destructive/10 text-destructive"
          }`}>
            {overallScore}
          </div>
        ) : (
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${sourceConfig[source].className}`}>
            <SourceIcon className="h-5 w-5" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <h3 className="font-display text-sm font-semibold truncate">{recording.title}</h3>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 font-medium shrink-0 border ${statusConfig[status].className}`}>
            {statusConfig[status].label}
          </Badge>
        </div>
        <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground flex-wrap">
          {/* Source label */}
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceConfig[source].className}`}>
            <SourceIcon className="h-3 w-3" />
            {sourceConfig[source].label}
          </span>
          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formattedDate}</span>
          {recording.duration && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{recording.duration}</span>}
          <span className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px] font-medium capitalize">
            {recording.type}
          </span>
          {participantCount > 0 && (
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{participantCount} kişi</span>
          )}
          {actionItemCount > 0 && (
            <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{actionItemCount} aksiyon</span>
          )}
        </div>
        {recording.summary && status === "completed" && (
          <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-1">{recording.summary}</p>
        )}
      </div>

      {isClickable && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />}
    </Wrapper>
  );
};

export default MeetingCard;
