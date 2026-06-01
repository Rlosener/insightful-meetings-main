import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { InterviewQuestion } from "@/types/recording";
import { Plus, X, GripVertical, Trash2, Save, FolderOpen, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  customQuestions: InterviewQuestion[];
  onQuestionsChange: (questions: InterviewQuestion[]) => void;
}

const CATEGORIES = ["Durumsal", "Davranışsal", "Problem Çözme", "Role Özel", "Eleştirel Düşünme", "Liderlik", "İletişim", "Yaratıcılık", "Genel"];
const QUESTION_TYPES = [
  { value: "situational", label: "Durumsal" },
  { value: "behavioral", label: "Davranışsal" },
  { value: "problem-solving", label: "Problem Çözme" },
  { value: "role-specific", label: "Role Özel" },
  { value: "critical-thinking", label: "Eleştirel Düşünme" },
  { value: "leadership", label: "Liderlik" },
  { value: "communication", label: "İletişim" },
  { value: "creativity", label: "Yaratıcılık" },
];
const DIFFICULTIES: { value: "easy" | "medium" | "hard"; label: string }[] = [
  { value: "easy", label: "Kolay" },
  { value: "medium", label: "Orta" },
  { value: "hard", label: "Zor" },
];

interface Template {
  id: string;
  name: string;
  description: string | null;
}

const CustomQuestionsManager = ({ customQuestions, onQuestionsChange }: Props) => {
  const [newQuestion, setNewQuestion] = useState("");
  const [newCategory, setNewCategory] = useState("Genel");
  const [newType, setNewType] = useState("behavioral");
  const [newDifficulty, setNewDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [newRequired, setNewRequired] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("interview_question_templates")
      .select("id, name, description")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTemplates(data || []);
  };

  const addQuestion = () => {
    if (!newQuestion.trim()) return;
    const q: InterviewQuestion = {
      category: newCategory,
      question: newQuestion.trim(),
      difficulty: newDifficulty,
      questionType: newType,
      isRequired: newRequired,
      isCustom: true,
    };
    onQuestionsChange([...customQuestions, q]);
    setNewQuestion("");
    setNewRequired(false);
  };

  const removeQuestion = (idx: number) => {
    onQuestionsChange(customQuestions.filter((_, i) => i !== idx));
  };

  const moveQuestion = (from: number, to: number) => {
    if (to < 0 || to >= customQuestions.length) return;
    const arr = [...customQuestions];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    onQuestionsChange(arr);
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim() || customQuestions.length === 0) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: tmpl, error: tmplErr } = await supabase
        .from("interview_question_templates")
        .insert({ user_id: user.id, name: templateName.trim() })
        .select("id")
        .single();
      if (tmplErr) throw tmplErr;

      const rows = customQuestions.map((q, i) => ({
        user_id: user.id,
        question: q.question,
        category: q.category,
        question_type: q.questionType || "behavioral",
        difficulty: q.difficulty || "medium",
        is_required: q.isRequired || false,
        sort_order: i,
        template_id: tmpl.id,
      }));

      const { error: qErr } = await supabase.from("custom_interview_questions").insert(rows);
      if (qErr) throw qErr;

      toast.success("Şablon kaydedildi!");
      setTemplateName("");
      setShowSave(false);
      loadTemplates();
    } catch (e: any) {
      toast.error(e.message || "Şablon kaydedilemedi");
    }
  };

  const loadTemplate = async (templateId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("custom_interview_questions")
      .select("*")
      .eq("template_id", templateId)
      .eq("user_id", user.id)
      .order("sort_order");
    if (data) {
      const loaded: InterviewQuestion[] = data.map((q) => ({
        category: q.category,
        question: q.question,
        difficulty: q.difficulty as "easy" | "medium" | "hard",
        questionType: q.question_type,
        isRequired: q.is_required,
        isCustom: true,
      }));
      onQuestionsChange(loaded);
      toast.success("Şablon yüklendi!");
    }
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("interview_question_templates").delete().eq("id", id);
    loadTemplates();
    toast.success("Şablon silindi");
  };

  const diffColors: Record<string, string> = {
    easy: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
    medium: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
    hard: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h3 className="font-display font-semibold text-sm">Özel Sorular</h3>
          {customQuestions.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{customQuestions.length}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {templates.length > 0 && (
            <Select onValueChange={loadTemplate}>
              <SelectTrigger className="h-8 text-xs w-40">
                <FolderOpen className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Şablon yükle" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <div key={t.id} className="flex items-center justify-between pr-2">
                    <SelectItem value={t.id} className="flex-1">{t.name}</SelectItem>
                    <button onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }} className="text-destructive hover:text-destructive/80 ml-2">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </SelectContent>
            </Select>
          )}
          {customQuestions.length > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowSave(!showSave)}>
              <Save className="h-3 w-3 mr-1" /> Kaydet
            </Button>
          )}
        </div>
      </div>

      {/* Save template */}
      {showSave && (
        <div className="flex gap-2">
          <Input
            placeholder="Şablon adı..."
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8" onClick={saveAsTemplate} disabled={!templateName.trim()}>
            Kaydet
          </Button>
        </div>
      )}

      {/* Question list */}
      {customQuestions.length > 0 && (
        <div className="space-y-2">
          {customQuestions.map((q, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 group">
              <div className="flex flex-col gap-0.5 mt-1">
                <button onClick={() => moveQuestion(i, i - 1)} className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity" disabled={i === 0}>
                  <GripVertical className="h-3 w-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{q.question}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="outline" className="text-[9px] h-4">{q.category}</Badge>
                  <Badge className={`text-[9px] h-4 border-0 ${diffColors[q.difficulty || "medium"]}`}>
                    {q.difficulty === "easy" ? "Kolay" : q.difficulty === "hard" ? "Zor" : "Orta"}
                  </Badge>
                  {q.isRequired && <Badge variant="destructive" className="text-[9px] h-4">Zorunlu</Badge>}
                </div>
              </div>
              <button onClick={() => removeQuestion(i)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add question form */}
      <div className="space-y-3 pt-2 border-t border-border">
        <div className="space-y-2">
          <Input
            placeholder="Yeni soru yazın..."
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addQuestion())}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Select value={newCategory} onValueChange={setNewCategory}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={newType} onValueChange={setNewType}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={newDifficulty} onValueChange={(v) => setNewDifficulty(v as any)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTIES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch checked={newRequired} onCheckedChange={setNewRequired} className="scale-75" />
            <Label className="text-xs text-muted-foreground">Zorunlu</Label>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={addQuestion} disabled={!newQuestion.trim()} className="w-full">
          <Plus className="h-3 w-3 mr-1" /> Soru Ekle
        </Button>
      </div>
    </div>
  );
};

export default CustomQuestionsManager;
