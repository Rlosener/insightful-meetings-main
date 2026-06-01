export type PromptOutputFormat = "json" | "text";

export interface PromptDefinition {
  id: string;
  name: string;
  description: string;
  usedBy: string[];
  version: string;
  inputFields: string[];
  outputFormat: PromptOutputFormat;
  inputSchema?: unknown;
  outputSchema?: unknown;
  systemPrompt: string;
  userPromptTemplate: string;
  expectedOutput?: string;
  safetyRules: string[];
  safetyNotes?: string[];
}

export interface PromptRenderResult {
  systemPrompt: string;
  userPrompt: string;
  metadata: {
    promptId: string;
    promptVersion: string;
    usedBy: string[];
    timestamp: string;
    createdAt: string;
    outputFormat: PromptOutputFormat;
  };
}
