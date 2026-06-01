import { BookOpen, Mic, Target, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface SmartRecommendationsProps {
  recommendations: {
    learn_next?: string[];
    practice_next?: string;
    target_roles?: string[];
  } | null;
}

const SmartRecommendations = ({ recommendations }: SmartRecommendationsProps) => {
  if (!recommendations) return null;

  return (
    <div className="space-y-4">
      {/* Learn Next + Practice Next */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {recommendations.learn_next && recommendations.learn_next.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-2">
            <h4 className="text-xs font-bold flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-accent" />
              Öğrenilmesi Gerekenler
            </h4>
            <ul className="space-y-1.5">
              {recommendations.learn_next.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-accent mt-0.5">▸</span>{item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {recommendations.practice_next && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-2">
            <h4 className="text-xs font-bold flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5 text-primary" />
              Sonraki Pratik Önerisi
            </h4>
            <p className="text-xs text-muted-foreground">{recommendations.practice_next}</p>
            <Link to="/individual/practice">
              <button className="mt-1 text-[11px] text-primary font-medium flex items-center gap-1 hover:underline">
                Pratik Başlat <ArrowRight className="h-3 w-3" />
              </button>
            </Link>
          </div>
        )}
      </div>

      {/* Target Roles */}
      {recommendations.target_roles && recommendations.target_roles.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-2">
          <h4 className="text-xs font-bold flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-primary" />
            Hedeflenebilecek Roller
          </h4>
          <div className="space-y-1.5">
            {recommendations.target_roles.map((role, i) => (
              <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-primary mt-0.5">•</span>{role}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartRecommendations;
