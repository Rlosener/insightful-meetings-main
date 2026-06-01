import { Flame } from "lucide-react";

interface OneLineTruthProps {
  truth: string;
}

const OneLineTruth = ({ truth }: OneLineTruthProps) => {
  if (!truth) return null;

  return (
    <div className="relative rounded-xl border-2 border-destructive/30 bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent p-6 overflow-hidden">
      <div className="absolute top-3 right-3 opacity-10">
        <Flame className="h-16 w-16 text-destructive" />
      </div>
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-destructive/15 flex items-center justify-center shrink-0 mt-0.5">
          <Flame className="h-4 w-4 text-destructive" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-destructive/70 mb-1">Bir Cümle Gerçeği</p>
          <p className="text-base sm:text-lg font-bold leading-snug">{truth}</p>
        </div>
      </div>
    </div>
  );
};

export default OneLineTruth;
