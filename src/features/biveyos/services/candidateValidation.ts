import type { BiveyosCandidateRecord, CandidateValidationResult } from "../types";

export const validateCandidate = (candidate: BiveyosCandidateRecord): CandidateValidationResult => {
  const errors: string[] = [];

  if (!candidate.firstName.trim()) errors.push("Ad zorunlu.");
  if (!candidate.lastName.trim()) errors.push("Soyad zorunlu.");
  if (!candidate.jobTitle.trim()) errors.push("Başvurulan pozisyon zorunlu.");
  if (!candidate.cvText.trim()) errors.push("CV metni zorunlu.");

  return {
    valid: errors.length === 0,
    errors,
  };
};
