import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  User, Briefcase, GraduationCap, Award, Zap, TrendingUp,
  Plus, Trash2, XCircle
} from "lucide-react";
import {
  EducationItem, ExperienceItem, CertItem, ProjectItem, EventItem,
  emptyEdu, emptyExp, emptyCert, emptyProject, emptyEvent,
} from "@/pages/CareerProfilePage";

interface Props {
  fullName: string; setFullName: (v: string) => void;
  targetRole: string; setTargetRole: (v: string) => void;
  summary: string; setSummary: (v: string) => void;
  skills: string[]; skillInput: string; setSkillInput: (v: string) => void;
  addSkill: () => void; removeSkill: (i: number) => void;
  education: EducationItem[]; setEducation: React.Dispatch<React.SetStateAction<EducationItem[]>>;
  experience: ExperienceItem[]; setExperience: React.Dispatch<React.SetStateAction<ExperienceItem[]>>;
  certifications: CertItem[]; setCertifications: React.Dispatch<React.SetStateAction<CertItem[]>>;
  projects: ProjectItem[]; setProjects: React.Dispatch<React.SetStateAction<ProjectItem[]>>;
  eventsTrainings: EventItem[]; setEventsTrainings: React.Dispatch<React.SetStateAction<EventItem[]>>;
  addItem: <T>(setter: React.Dispatch<React.SetStateAction<T[]>>, empty: T) => void;
  removeItem: <T>(setter: React.Dispatch<React.SetStateAction<T[]>>, i: number) => void;
  updateItem: <T>(setter: React.Dispatch<React.SetStateAction<T[]>>, i: number, field: keyof T, value: string) => void;
}

const ProfileFormSection = ({
  fullName, setFullName, targetRole, setTargetRole,
  summary, setSummary, skills, skillInput, setSkillInput,
  addSkill, removeSkill, education, setEducation,
  experience, setExperience, certifications, setCertifications,
  projects, setProjects, eventsTrainings, setEventsTrainings,
  addItem, removeItem, updateItem,
}: Props) => {
  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <Card className="p-5 space-y-4">
        <h2 className="font-display text-base font-semibold flex items-center gap-2">
          <User className="h-4 w-4 text-primary" /> Temel Bilgiler
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Ad Soyad</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ad Soyad" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Hedef Pozisyon</label>
            <Input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="Frontend Developer, Marketing Manager..." />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Profesyonel Özet</label>
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Kısa profesyonel özet..." rows={3} />
        </div>
      </Card>

      {/* Skills */}
      <Card className="p-5">
        <h2 className="font-display text-base font-semibold flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" /> Beceriler
        </h2>
        <div className="flex gap-2 mb-3">
          <Input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder="Beceri ekle..." onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())} />
          <Button onClick={addSkill} size="sm" variant="outline"><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s, i) => (
            <Badge key={i} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeSkill(i)}>
              {s} <XCircle className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      </Card>

      {/* Experience */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" /> Deneyim
          </h2>
          <Button onClick={() => addItem(setExperience, emptyExp)} size="sm" variant="ghost"><Plus className="h-4 w-4 mr-1" />Ekle</Button>
        </div>
        <div className="space-y-3">
          {experience.map((exp, i) => (
            <div key={i} className="space-y-2 border-l-2 border-primary/20 pl-3">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input placeholder="Şirket" value={exp.company} onChange={(e) => updateItem(setExperience, i, "company", e.target.value)} />
                <Input placeholder="Pozisyon" value={exp.role} onChange={(e) => updateItem(setExperience, i, "role", e.target.value)} />
                <Button onClick={() => removeItem(setExperience, i)} size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Süre (ör: 2 yıl)" value={exp.duration} onChange={(e) => updateItem(setExperience, i, "duration", e.target.value)} />
                <Input placeholder="Açıklama" value={exp.description} onChange={(e) => updateItem(setExperience, i, "description", e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Education */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" /> Eğitim
          </h2>
          <Button onClick={() => addItem(setEducation, emptyEdu)} size="sm" variant="ghost"><Plus className="h-4 w-4 mr-1" />Ekle</Button>
        </div>
        <div className="space-y-3">
          {education.map((edu, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
              <Input placeholder="Okul" value={edu.school} onChange={(e) => updateItem(setEducation, i, "school", e.target.value)} />
              <Input placeholder="Bölüm" value={edu.field} onChange={(e) => updateItem(setEducation, i, "field", e.target.value)} />
              <Input placeholder="Yıl" value={edu.year} onChange={(e) => updateItem(setEducation, i, "year", e.target.value)} />
              <Button onClick={() => removeItem(setEducation, i)} size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Certifications */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" /> Sertifikalar
          </h2>
          <Button onClick={() => addItem(setCertifications, emptyCert)} size="sm" variant="ghost"><Plus className="h-4 w-4 mr-1" />Ekle</Button>
        </div>
        <div className="space-y-3">
          {certifications.map((cert, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-start">
              <Input placeholder="Sertifika adı" value={cert.name} onChange={(e) => updateItem(setCertifications, i, "name", e.target.value)} />
              <Input placeholder="Kurum" value={cert.issuer} onChange={(e) => updateItem(setCertifications, i, "issuer", e.target.value)} />
              <Input placeholder="Yıl" value={cert.year} onChange={(e) => updateItem(setCertifications, i, "year", e.target.value)} className="w-20" />
              <Button onClick={() => removeItem(setCertifications, i)} size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Projects */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Projeler
          </h2>
          <Button onClick={() => addItem(setProjects, emptyProject)} size="sm" variant="ghost"><Plus className="h-4 w-4 mr-1" />Ekle</Button>
        </div>
        <div className="space-y-3">
          {projects.map((proj, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
              <Input placeholder="Proje adı" value={proj.name} onChange={(e) => updateItem(setProjects, i, "name", e.target.value)} />
              <Input placeholder="Teknolojiler" value={proj.tech} onChange={(e) => updateItem(setProjects, i, "tech", e.target.value)} />
              <Button onClick={() => removeItem(setProjects, i)} size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Events & Trainings */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" /> Etkinlikler & Eğitimler
          </h2>
          <Button onClick={() => addItem(setEventsTrainings, emptyEvent)} size="sm" variant="ghost"><Plus className="h-4 w-4 mr-1" />Ekle</Button>
        </div>
        <div className="space-y-3">
          {eventsTrainings.map((ev, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-start">
              <Input placeholder="Etkinlik adı" value={ev.name} onChange={(e) => updateItem(setEventsTrainings, i, "name", e.target.value)} />
              <Input placeholder="Tür (konferans, kurs...)" value={ev.type} onChange={(e) => updateItem(setEventsTrainings, i, "type", e.target.value)} />
              <Input placeholder="Yıl" value={ev.year} onChange={(e) => updateItem(setEventsTrainings, i, "year", e.target.value)} className="w-20" />
              <Button onClick={() => removeItem(setEventsTrainings, i)} size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default ProfileFormSection;
