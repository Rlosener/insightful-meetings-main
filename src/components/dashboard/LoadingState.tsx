import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

const LoadingState = ({ message = "Yükleniyor...", className = "" }: LoadingStateProps) => (
  <div className={`flex flex-col items-center justify-center py-16 gap-3 ${className}`}>
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);

export default LoadingState;
