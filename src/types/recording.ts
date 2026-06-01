export interface InterviewQuestion {
  category: string;
  question: string;
  difficulty?: "easy" | "medium" | "hard";
  questionType?: string;
  isRequired?: boolean;
  isCustom?: boolean;
  tip?: string;
}

export interface InterviewSetupConfig {
  difficultyLevel: "easy" | "medium" | "hard";
  interviewStyle: "formal" | "conversational" | "challenging" | "executive";
  aiQuestionCount: number;
  includeCustomQuestions: boolean;
}

export interface RecordingInfo {
  type: "mülakat" | "toplantı";
  behavioralAnalysis?: boolean;
  // Toplantı alanları
  meetingTopic?: string;
  meetingAgenda?: string;
  meetingPurpose?: string;
  expectedOutcomes?: string;
  decisionTopics?: string;
  additionalNotes?: string;
  participants?: string[];
  // Mülakat alanları
  position?: string;
  department?: string;
  requiredSkills?: string[];
  seniorityLevel?: string;
  candidateSummary?: string;
  interviewNotes?: string;
  evaluationCriteria?: string[];
  customQuestions?: string[];
  companyName?: string;
  organizationName?: string;
  experienceYears?: string;
  candidateName?: string;
  candidateSurname?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  candidateCurrentRole?: string;
  candidateExperience?: string;
  candidateEducation?: string;
  candidateNotes?: string;
  // AI tarafından önerilen sorular
  suggestedQuestions?: InterviewQuestion[];
  // Advanced interview config
  interviewConfig?: InterviewSetupConfig;
}
