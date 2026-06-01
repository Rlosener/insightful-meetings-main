import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, getErrorToastMessage } from "@/lib/edgeFunctionClient";
import { EDGE_FUNCTIONS } from "@/config/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  User, Briefcase, GraduationCap, Target, Award, Zap, TrendingUp,
  Plus, Trash2, Loader2, Brain, Link as LinkIcon, Save, AlertTriangle,
  CheckCircle, XCircle, Lightbulb, BarChart3, ArrowUpRight, Download,
  Sparkles, ChevronRight
} from "lucide-react";
import ProfileFormSection from "@/components/career/ProfileFormSection";
import ProfileInsightsSection from "@/components/career/ProfileInsightsSection";

type EducationItem = { school: string; degree: string; field: string; year: string };
type ExperienceItem = { company: string; role: string; duration: string; description: string };
type CertItem = { name: string; issuer: string; year: string };
type ProjectItem = { name: string; description: string; tech: string };
type EventItem = { name: string; type: string; year: string };

const emptyEdu: EducationItem = { school: "", degree: "", field: "", year: "" };
const emptyExp: ExperienceItem = { company: "", role: "", duration: "", description: "" };
const emptyCert: CertItem = { name: "", issuer: "", year: "" };
const emptyProject: ProjectItem = { name: "", description: "", tech: "" };
const emptyEvent: EventItem = { name: "", type: "", year: "" };

export type { EducationItem, ExperienceItem, CertItem, ProjectItem, EventItem };
export { emptyEdu, emptyExp, emptyCert, emptyProject, emptyEvent };

const CareerProfilePage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  // Profile fields
  const [fullName, setFullName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [education, setEducation] = useState<EducationItem[]>([]);
  const [experience, setExperience] = useState<ExperienceItem[]>([]);
  const [certifications, setCertifications] = useState<CertItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [eventsTrainings, setEventsTrainings] = useState<EventItem[]>([]);

  // AI insights
  const [insights, setInsights] = useState<any>(null);
  const [readinessScore, setReadinessScore] = useState<number | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("career_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setProfileId(data.id);
        setFullName(data.full_name || "");
        setTargetRole(data.target_role || "");
        setLinkedinUrl(data.linkedin_url || "");
        setSummary(data.summary || "");
        setSkills((data.skills as string[]) || []);
        setEducation((data.education as unknown as EducationItem[]) || []);
        setExperience((data.experience as unknown as ExperienceItem[]) || []);
        setCertifications((data.certifications as unknown as CertItem[]) || []);
        setProjects((data.projects as unknown as ProjectItem[]) || []);
        setEventsTrainings((data.events_trainings as unknown as EventItem[]) || []);
        setInsights(data.ai_insights as any);
        setReadinessScore(data.career_readiness_score);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const importFromLinkedin = async () => {
    if (!linkedinUrl.includes("linkedin.com/in/")) {
      toast.error("Geçerli bir LinkedIn profil URL'si girin");
      return;
    }
    setImporting(true);
    try {
      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.PARSE_LINKEDIN, { linkedinUrl });
      if (result.error) { toast.error(getErrorToastMessage(result.error)); setImporting(false); return; }
      const data = result.data;

      // Populate fields from AI-generated template
      if (data.full_name) setFullName(data.full_name);
      if (data.target_role) setTargetRole(data.target_role);
      if (data.summary) setSummary(data.summary);
      if (data.skills?.length) setSkills(data.skills);
      if (data.experience?.length) setExperience(data.experience);
      if (data.education?.length) setEducation(data.education);
      if (data.certifications?.length) setCertifications(data.certifications);
      if (data.projects?.length) setProjects(data.projects);
      if (data.events_trainings?.length) setEventsTrainings(data.events_trainings);

      toast.success(data.import_note || "Profil şablonu oluşturuldu. Bilgileri kontrol edip düzenleyebilirsiniz.");
    } catch (e: any) {
      toast.error(e.message || "LinkedIn import başarısız");
    } finally {
      setImporting(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const profileData = {
        user_id: user.id,
        full_name: fullName,
        target_role: targetRole,
        linkedin_url: linkedinUrl,
        summary,
        skills,
        education: education as any,
        experience: experience as any,
        certifications: certifications as any,
        projects: projects as any,
        events_trainings: eventsTrainings as any,
      };

      if (profileId) {
        await supabase.from("career_profiles").update(profileData).eq("id", profileId);
      } else {
        const { data } = await supabase.from("career_profiles").insert(profileData).select().single();
        if (data) setProfileId(data.id);
      }
      toast.success("Profil kaydedildi");
    } catch (e) {
      toast.error("Profil kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const analyzeProfile = async () => {
    setAnalyzing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: practices, count } = await supabase
        .from("practice_interviews")
        .select("character_analysis", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      const scored = (practices || []).filter((p: any) => (p.character_analysis as any)?.overall_score);
      const practiceHistory = count && count > 0 ? {
        count,
        avgScore: scored.length > 0 ? Math.round(scored.reduce((a: number, p: any) => a + (p.character_analysis as any).overall_score, 0) / scored.length) : 0,
        latestScore: (scored[0]?.character_analysis as any)?.overall_score || 0,
      } : null;

      const result = await invokeEdgeFunction(EDGE_FUNCTIONS.ANALYZE_CAREER, {
        profile: { fullName, targetRole, summary, skills, education, experience, certifications, projects, eventsTrainings, linkedinUrl },
        practiceHistory,
      });
      if (result.error) { toast.error(getErrorToastMessage(result.error)); setAnalyzing(false); return; }
      const data = result.data;

      setInsights(data);
      setReadinessScore(data.career_readiness_score);

      if (profileId) {
        await supabase.from("career_profiles").update({
          ai_insights: data as any,
          career_readiness_score: data.career_readiness_score,
          ai_insights_updated_at: new Date().toISOString(),
        }).eq("id", profileId);
      }

      toast.success("Profil analizi tamamlandı");
    } catch (e: any) {
      toast.error(e.message || "Analiz başarısız");
    } finally {
      setAnalyzing(false);
    }
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
      setSkillInput("");
    }
  };
  const removeSkill = (i: number) => setSkills(skills.filter((_, idx) => idx !== i));

  const addItem = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, empty: T) =>
    setter(prev => [...prev, { ...empty }]);
  const removeItem = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, i: number) =>
    setter(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, i: number, field: keyof T, value: string) =>
    setter(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <User className="h-7 w-7 text-primary" /> Kariyer Profili
          </h1>
          <p className="text-muted-foreground text-sm mt-1">LinkedIn profilinizden başlayarak akıllı kariyer analizi alın</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveProfile} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Kaydet
          </Button>
          <Button onClick={analyzeProfile} disabled={analyzing || (!fullName && !targetRole)} variant="secondary" size="sm">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
            AI Analiz
          </Button>
        </div>
      </div>

      {/* LinkedIn Import - Hero Section */}
      <Card className="p-6 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <LinkIcon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="font-display text-lg font-semibold">LinkedIn'den Profil Oluştur</h2>
              <p className="text-sm text-muted-foreground">LinkedIn URL'nizi girin, AI profilinizi otomatik olarak yapılandırsın. Sonra düzenleyebilirsiniz.</p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="https://linkedin.com/in/username"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={importFromLinkedin}
                disabled={importing || !linkedinUrl}
                size="sm"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                İçe Aktar
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Career Readiness Score */}
      {readinessScore !== null && (
        <Card className="p-6 border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" /> Kariyer Hazırlık Skoru
            </h2>
            <span className="text-3xl font-bold text-primary">{readinessScore}<span className="text-base text-muted-foreground">/100</span></span>
          </div>
          <Progress value={readinessScore} className="h-3 mb-3" />
          {insights?.score_explanation && (
            <p className="text-sm text-muted-foreground mb-4">{insights.score_explanation}</p>
          )}
          {insights?.score_breakdown && (
            <div className="grid grid-cols-5 gap-3">
              {Object.entries(insights.score_breakdown).map(([key, val]: [string, any]) => {
                const score = typeof val === "object" ? val.score : val;
                const note = typeof val === "object" ? val.note : null;
                const label = key === "education" ? "Eğitim" : key === "experience" ? "Deneyim" : key === "skills" ? "Beceriler" : key === "certifications" ? "Sertifika" : "Projeler";
                return (
                  <div key={key} className="text-center rounded-lg bg-muted/50 p-2">
                    <div className="text-lg font-bold">{score}</div>
                    <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
                    {note && <div className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2">{note}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* AI Insights */}
      {insights && <ProfileInsightsSection insights={insights} />}

      {/* Profile Form */}
      <ProfileFormSection
        fullName={fullName} setFullName={setFullName}
        targetRole={targetRole} setTargetRole={setTargetRole}
        summary={summary} setSummary={setSummary}
        skills={skills} skillInput={skillInput} setSkillInput={setSkillInput}
        addSkill={addSkill} removeSkill={removeSkill}
        education={education} setEducation={setEducation}
        experience={experience} setExperience={setExperience}
        certifications={certifications} setCertifications={setCertifications}
        projects={projects} setProjects={setProjects}
        eventsTrainings={eventsTrainings} setEventsTrainings={setEventsTrainings}
        addItem={addItem} removeItem={removeItem} updateItem={updateItem}
      />
    </div>
  );
};

export default CareerProfilePage;
