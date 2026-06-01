import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle, AlertTriangle, XCircle, Lightbulb, BarChart3,
  Zap, ArrowUpRight, Sparkles, ChevronRight
} from "lucide-react";

interface Props {
  insights: any;
}

const ProfileInsightsSection = ({ insights }: Props) => {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" /> LinkedIn Profil İçgörüleri
      </h2>

      {/* LinkedIn Profile Insights */}
      {insights.linkedin_profile_insights?.length > 0 && (
        <Card className="p-4 bg-muted/30 border-primary/10">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
            <Sparkles className="h-4 w-4 text-primary" /> Profil Gözlemleri
          </h3>
          <ul className="space-y-1.5">
            {insights.linkedin_profile_insights.map((s: string, i: number) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />{s}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Strengths */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-primary">
            <CheckCircle className="h-4 w-4" /> Güçlü Yönler
          </h3>
          <ul className="space-y-2">
            {(insights.strengths || []).map((s: any, i: number) => {
              const title = typeof s === "string" ? s : s.title;
              const detail = typeof s === "string" ? null : s.detail;
              return (
                <li key={i} className="text-sm">
                  <span className="font-medium">{title}</span>
                  {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Weaknesses */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Zayıf Yönler
          </h3>
          <ul className="space-y-2">
            {(insights.weaknesses || []).map((s: any, i: number) => {
              const title = typeof s === "string" ? s : s.title;
              const detail = typeof s === "string" ? null : s.detail;
              return (
                <li key={i} className="text-sm">
                  <span className="font-medium">{title}</span>
                  {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Career Gaps */}
        {insights.career_gaps?.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-accent-foreground">
              <XCircle className="h-4 w-4" /> Kariyer Boşlukları
            </h3>
            <ul className="space-y-2">
              {insights.career_gaps.map((g: any, i: number) => {
                const gap = typeof g === "string" ? g : g.gap;
                const impact = typeof g === "string" ? null : g.impact;
                return (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{gap}</span>
                    {impact && <p className="text-xs text-muted-foreground mt-0.5">{impact}</p>}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {/* Missing Skills */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-accent-foreground">
            <XCircle className="h-4 w-4" /> Eksik Beceriler
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {(insights.missing_skills || []).map((s: string, i: number) => (
              <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
            ))}
          </div>
        </Card>
      </div>

      {/* Skill Gap Analysis */}
      {insights.skill_gap_analysis && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" /> Beceri Boşluk Analizi
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Eşleşen Beceriler</p>
              <div className="flex flex-wrap gap-1.5">
                {(insights.skill_gap_analysis.matched_skills || []).map((s: string, i: number) => (
                  <Badge key={i} className="text-xs bg-primary/10 text-primary border-0">{s}</Badge>
                ))}
              </div>
            </div>
            {insights.skill_gap_analysis.priority_skills?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Öncelikli Gelişim Alanları</p>
                <div className="space-y-2">
                  {insights.skill_gap_analysis.priority_skills.map((item: any, i: number) => (
                    <div key={i} className="border-l-2 border-primary/30 pl-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.skill}</span>
                        <Badge variant={item.priority === "high" ? "destructive" : "secondary"} className="text-[10px] h-4">
                          {item.priority === "high" ? "Yüksek" : item.priority === "medium" ? "Orta" : "Düşük"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>
                      {item.how_to_learn && (
                        <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                          <ArrowUpRight className="h-3 w-3" /> {item.how_to_learn}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Fallback for old format */}
            {!insights.skill_gap_analysis.priority_skills && insights.skill_gap_analysis.improvement_suggestions?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Eksik Beceriler & Öneriler</p>
                <div className="space-y-2">
                  {insights.skill_gap_analysis.improvement_suggestions.map((item: any, i: number) => (
                    <div key={i} className="text-sm border-l-2 border-accent pl-3">
                      <span className="font-medium">{item.skill}</span>
                      <p className="text-xs text-muted-foreground">{item.suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Role Alignment */}
      {insights.role_alignment && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Rol Uyumu</h3>
          {typeof insights.role_alignment === "object" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Progress value={insights.role_alignment.score || 0} className="h-2 flex-1" />
                <span className="text-sm font-bold text-primary">{insights.role_alignment.score}/100</span>
              </div>
              <p className="text-sm text-muted-foreground">{insights.role_alignment.summary}</p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {insights.role_alignment.key_matches?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-primary mb-1">Eşleşmeler</p>
                    <ul className="space-y-0.5">
                      {insights.role_alignment.key_matches.map((m: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground">✓ {m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {insights.role_alignment.key_misses?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-destructive mb-1">Eksikler</p>
                    <ul className="space-y-0.5">
                      {insights.role_alignment.key_misses.map((m: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground">✗ {m}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{insights.role_alignment}</p>
          )}
        </Card>
      )}

      {/* How to Improve */}
      {insights.how_to_improve?.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Lightbulb className="h-4 w-4 text-primary" /> Profilinizi Nasıl Geliştirirsiniz?
          </h3>
          <div className="space-y-3">
            {insights.how_to_improve.map((item: any, i: number) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">{i + 1}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.action}</span>
                    {item.impact && (
                      <Badge variant={item.impact === "high" ? "destructive" : "secondary"} className="text-[10px] h-4">
                        {item.impact === "high" ? "Yüksek Etki" : item.impact === "medium" ? "Orta Etki" : "Düşük Etki"}
                      </Badge>
                    )}
                  </div>
                  {item.detail && <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recommendations fallback */}
      {!insights.how_to_improve && insights.recommendations?.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-accent-foreground">
            <Lightbulb className="h-4 w-4 text-accent" /> Öneriler
          </h3>
          <ul className="space-y-1.5">
            {insights.recommendations.map((s: string, i: number) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                <span className="text-accent mt-0.5">•</span>{s}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

export default ProfileInsightsSection;
