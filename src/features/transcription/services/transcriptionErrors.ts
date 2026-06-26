import type { EdgeFunctionError } from "@/lib/edgeFunctionClient";

export interface TranscriptionInvokePayload {
  transcript?: string;
  transcriptResult?: { warnings?: string[]; error?: string };
  provider?: string;
  providerError?: string;
  providerErrors?: Array<{ provider: string; error: string }>;
  warnings?: string[];
  error?: string;
}

export const formatTranscriptionFailure = (
  error: EdgeFunctionError | null,
  payload?: TranscriptionInvokePayload | null,
) => {
  const providerErrors = payload?.providerErrors || [];
  const providerSummary = providerErrors.length > 0
    ? providerErrors.map((item) => `${item.provider}: ${item.error}`).join(" | ")
    : payload?.providerError || payload?.error;

  if (error?.detail && providerSummary) {
    return `${error.message} (${providerSummary})`;
  }
  if (error?.message) return error.message;
  if (providerSummary) return providerSummary;
  return "Transkript oluşturulamadı. Lütfen farklı bir dosya deneyin.";
};
