import type { PromptDefinition } from "./prompt-registry.ts";

export const renderTemplate = (template: string, values: Record<string, unknown>) =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (Array.isArray(value)) return value.join(", ");
    if (value === null || value === undefined || value === "") return "Belirtilmedi";
    return String(value);
  });

export const renderPrompt = (prompt: PromptDefinition, values: Record<string, unknown>) => {
  const createdAt = new Date().toISOString();
  return {
    systemPrompt: renderTemplate(prompt.systemPrompt, values),
    userPrompt: renderTemplate(prompt.userPromptTemplate, values),
    metadata: {
      promptId: prompt.id,
      promptVersion: prompt.version,
      usedBy: prompt.usedBy,
      timestamp: createdAt,
      createdAt,
      outputFormat: prompt.outputFormat,
    },
  };
};

export const logPromptUsage = (
  metadata: ReturnType<typeof renderPrompt>["metadata"],
  extra: Record<string, unknown> = {},
) => {
  console.log("[prompt]", JSON.stringify({ ...metadata, ...extra }));
};
