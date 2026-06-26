import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { CANDIDATE_STORAGE_KEY } from "../constants";
import type { BiveyosCandidateRecord } from "../types";

type CandidateRow = Database["public"]["Tables"]["candidates"]["Row"];
type CandidateInsert = Database["public"]["Tables"]["candidates"]["Insert"];

export type CandidatePersistenceSource = "supabase" | "local";

export interface CandidatePersistenceResult {
  source: CandidatePersistenceSource;
  error?: string;
}

const canUseLocalStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

const readLocalCandidates = (): BiveyosCandidateRecord[] => {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(CANDIDATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as BiveyosCandidateRecord[] : [];
  } catch {
    return [];
  }
};

const writeLocalCandidates = (candidates: BiveyosCandidateRecord[]) => {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(CANDIDATE_STORAGE_KEY, JSON.stringify(candidates));
};

const upsertLocalCandidate = (candidate: BiveyosCandidateRecord) => {
  const current = readLocalCandidates();
  const exists = current.some((item) => item.id === candidate.id);
  const next = exists
    ? current.map((item) => item.id === candidate.id ? { ...candidate, createdAt: item.createdAt || candidate.createdAt } : item)
    : [candidate, ...current];
  writeLocalCandidates(next);
};

const removeLocalCandidate = (id: string) => {
  writeLocalCandidates(readLocalCandidates().filter((candidate) => candidate.id !== id));
};

const fromRow = (row: CandidateRow): BiveyosCandidateRecord => ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  fullName: row.full_name,
  email: row.email || "",
  phone: row.phone || "",
  jobTitle: row.job_title,
  department: row.department || "",
  experienceYears: row.experience_years || "",
  education: row.education || "",
  jobDescription: row.job_description || "",
  cvText: row.cv_text,
  cvFileName: "",
  notes: row.notes || "",
  status: row.status,
  source: row.source,
  createdAt: row.created_at,
});

const toInsert = (candidate: BiveyosCandidateRecord, userId: string): CandidateInsert => ({
  id: candidate.id,
  user_id: userId,
  first_name: candidate.firstName,
  last_name: candidate.lastName,
  full_name: candidate.fullName,
  email: candidate.email || null,
  phone: candidate.phone || null,
  job_title: candidate.jobTitle,
  department: candidate.department || null,
  experience_years: candidate.experienceYears || null,
  education: candidate.education || null,
  job_description: candidate.jobDescription || null,
  cv_text: candidate.cvText,
  notes: candidate.notes || null,
  status: candidate.status || "Hazırlık",
  source: candidate.source || "Manuel CRM",
  created_at: candidate.createdAt,
});

const getUserId = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
};

export const listCandidates = async (): Promise<{
  candidates: BiveyosCandidateRecord[];
  source: CandidatePersistenceSource;
}> => {
  const localCandidates = readLocalCandidates();
  const userId = await getUserId();
  if (!userId) {
    return { candidates: localCandidates, source: "local" };
  }

  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.warn("[biveyos] candidates table unavailable, using local fallback", error?.message);
    return { candidates: localCandidates, source: "local" };
  }

  const candidates = data.map(fromRow);
  writeLocalCandidates(candidates);
  return { candidates, source: "supabase" };
};

export const saveCandidateRecord = async (candidate: BiveyosCandidateRecord): Promise<CandidatePersistenceResult> => {
  upsertLocalCandidate(candidate);
  const userId = await getUserId();
  if (!userId) return { source: "local", error: "Oturum bulunamadı; aday yerel olarak saklandı." };

  const { error } = await supabase
    .from("candidates")
    .upsert(toInsert(candidate, userId), { onConflict: "id" });

  if (error) {
    console.warn("[biveyos] candidate supabase save failed, local fallback kept", error.message);
    return { source: "local", error: error.message };
  }

  return { source: "supabase" };
};

export const deleteCandidateRecord = async (id: string): Promise<CandidatePersistenceResult> => {
  removeLocalCandidate(id);
  const userId = await getUserId();
  if (!userId) return { source: "local", error: "Oturum bulunamadı; aday yerelden silindi." };

  const { error } = await supabase
    .from("candidates")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.warn("[biveyos] candidate supabase delete failed, local deletion kept", error.message);
    return { source: "local", error: error.message };
  }

  return { source: "supabase" };
};
