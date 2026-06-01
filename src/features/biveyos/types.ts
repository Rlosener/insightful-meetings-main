export interface BiveyosCandidateRecord {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  department: string;
  experienceYears: string;
  education: string;
  jobDescription: string;
  cvText: string;
  cvFileName?: string;
  notes: string;
  status: string;
  source: string;
  createdAt: string;
}

export interface CandidateValidationResult {
  valid: boolean;
  errors: string[];
}
