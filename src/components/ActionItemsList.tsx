import { useState, useEffect } from "react";
import {
  Target, User, Calendar, AlertTriangle, CheckCircle2,
  Circle, Lightbulb, Plus, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ActionItem {
  id: string;
  task_description: string;
  owner: string | null;
  priority: "low" | "medium" | "high";
  deadline: string | null;
  status: "incomplete" | "complete";
  ai_suggestion: string | null;
  sort_order: number;
}

interface AnalysisActionItem {
  task_description: string;
  owner?: string | null;
  priority?: "low" | "medium" | "high";
  deadline?: string | null;
  ai_suggestion?: string | null;
}

interface Props {
  recordingId: string;
  analysisActionItems?: (string | AnalysisActionItem)[];
}

const priorityConfig = {
  high: { label: "Yüksek", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  medium: { label: "Orta", cls: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20" },
  low: { label: "Düşük", cls: "bg-muted text-muted-foreground border-border" },
};

const ActionItemsList = ({ recordingId, analysisActionItems }: Props) => {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [synced, setSynced] = useState(false);

  // Fetch existing items from DB
  useEffect(() => {
    fetchItems();
  }, [recordingId]);

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("action_items")
      .select("*")
      .eq("recording_id", recordingId)
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setItems(data as ActionItem[]);
      // If no DB items exist and analysis has structured items, sync them
      if (data.length === 0 && analysisActionItems?.length && !synced) {
        setSynced(true);
        syncFromAnalysis();
      }
    }
    setLoading(false);
  };

  const syncFromAnalysis = async () => {
    if (!analysisActionItems?.length) return;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const rows = analysisActionItems.map((item, i) => {
      if (typeof item === "string") {
        return {
          recording_id: recordingId,
          user_id: userData.user!.id,
          task_description: item,
          owner: null,
          priority: "medium" as const,
          deadline: null,
          status: "incomplete" as const,
          ai_suggestion: null,
          sort_order: i,
        };
      }
      return {
        recording_id: recordingId,
        user_id: userData.user!.id,
        task_description: item.task_description,
        owner: item.owner || null,
        priority: item.priority || "medium",
        deadline: item.deadline || null,
        status: "incomplete" as const,
        ai_suggestion: item.ai_suggestion || null,
        sort_order: i,
      };
    });

    const { data, error } = await supabase.from("action_items").insert(rows).select();
    if (!error && data) {
      setItems(data as ActionItem[]);
    }
  };

  const toggleStatus = async (item: ActionItem) => {
    const newStatus = item.status === "complete" ? "incomplete" : "complete";
    const { error } = await supabase
      .from("action_items")
      .update({ status: newStatus })
      .eq("id", item.id);

    if (!error) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
    }
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from("action_items").delete().eq("id", id);
    if (!error) {
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success("Aksiyon maddesi silindi");
    }
  };

  const addItem = async () => {
    if (!newTask.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data, error } = await supabase.from("action_items").insert({
      recording_id: recordingId,
      user_id: userData.user.id,
      task_description: newTask.trim(),
      priority: "medium",
      status: "incomplete",
      sort_order: items.length,
    }).select().single();

    if (!error && data) {
      setItems(prev => [...prev, data as ActionItem]);
      setNewTask("");
      setShowAdd(false);
      toast.success("Aksiyon maddesi eklendi");
    }
  };

  const completedCount = items.filter(i => i.status === "complete").length;
  const highPriorityCount = items.filter(i => i.priority === "high" && i.status === "incomplete").length;

  if (loading) return null;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="text-muted-foreground">
            <span className="font-bold text-foreground">{completedCount}</span> / {items.length} tamamlandı
          </span>
          {highPriorityCount > 0 && (
            <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive gap-1">
              <AlertTriangle className="h-3 w-3" /> {highPriorityCount} yüksek öncelik
            </Badge>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)} className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" /> Ekle
          </Button>
        </div>
      )}

      {/* Add new item */}
      {(showAdd || items.length === 0) && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Yeni aksiyon maddesi..."
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={addItem} disabled={!newTask.trim()} className="h-8 text-xs">
            Ekle
          </Button>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {items.map((item) => {
          const isComplete = item.status === "complete";
          const pCfg = priorityConfig[item.priority] || priorityConfig.medium;

          return (
            <div
              key={item.id}
              className={`group rounded-xl border bg-card p-4 shadow-card transition-all hover:shadow-md ${
                isComplete ? "opacity-60 border-border" : item.priority === "high" ? "border-destructive/20" : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <button
                  onClick={() => toggleStatus(item)}
                  className={`mt-0.5 shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    isComplete
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/30 hover:border-primary"
                  }`}
                >
                  {isComplete && <CheckCircle2 className="h-3 w-3" />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <p className={`text-sm font-medium ${isComplete ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.task_description}
                  </p>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${pCfg.cls}`}>
                      {pCfg.label}
                    </Badge>
                    {item.owner && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <User className="h-3 w-3" /> {item.owner}
                      </span>
                    )}
                    {item.deadline && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Calendar className="h-3 w-3" /> {item.deadline}
                      </span>
                    )}
                  </div>

                  {/* AI suggestion */}
                  {item.ai_suggestion && !isComplete && (
                    <div className="flex items-start gap-1.5 p-2 rounded-lg bg-[hsl(var(--warning))]/5 border border-[hsl(var(--warning))]/10">
                      <Lightbulb className="h-3 w-3 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                      <p className="text-[10px] text-[hsl(var(--warning))]">{item.ai_suggestion}</p>
                    </div>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && !showAdd && (
        <div className="text-center py-6 text-muted-foreground">
          <Target className="h-6 w-6 mx-auto mb-2 opacity-40" />
          <p className="text-xs">Aksiyon maddesi bulunamadı</p>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)} className="mt-2 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Manuel ekle
          </Button>
        </div>
      )}
    </div>
  );
};

export default ActionItemsList;
