/**
 * Shared AI Client Configuration
 * Supports Lovable AI Gateway (default) and custom providers.
 */

export interface AIRequestOptions {
  messages: Array<{ role: string; content: string | Record<string, unknown> | Array<Record<string, unknown>> }>;
  temperature?: number;
  stream?: boolean;
  response_format?: { type: string };
  model?: string;
}

export interface AIClientConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  isCustom: boolean;
}

const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

export function getAIConfig(): AIClientConfig {
  const customUrl = Deno.env.get("CUSTOM_AI_API_URL");
  const customKey = Deno.env.get("CUSTOM_AI_API_KEY");
  const customModel = Deno.env.get("CUSTOM_AI_MODEL");

  if (customUrl && customKey) {
    let defaultModel = customModel || DEFAULT_MODEL;
    if (!customModel) {
      if (customUrl.includes("generativelanguage.googleapis.com")) defaultModel = "gemini-2.5-flash";
      else if (customUrl.includes("api.openai.com")) defaultModel = "gpt-4o-mini";
    }
    return { apiUrl: customUrl, apiKey: customKey, model: defaultModel, isCustom: true };
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("AI not configured.");

  return { apiUrl: LOVABLE_GATEWAY_URL, apiKey: lovableKey, model: customModel || DEFAULT_MODEL, isCustom: false };
}

export async function callAI(options: AIRequestOptions): Promise<Response> {
  const config = getAIConfig();
  const body: {
    model: string;
    messages: AIRequestOptions["messages"];
    temperature: number;
    stream?: boolean;
    response_format?: { type: string };
  } = {
    model: options.model || config.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.5,
  };
  if (options.stream) body.stream = true;
  if (options.response_format) body.response_format = options.response_format;

  return fetch(config.apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function handleAIError(response: Response, corsHeaders: Record<string, string>): Response | null {
  if (response.ok) return null;
  if (response.status === 429) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (response.status === 402) {
    return new Response(JSON.stringify({ error: "Payment required. Please check your AI provider credits." }),
      { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return null;
}

/** Safe JSON parse from AI response with fallback */
export async function parseAIResponse<T = unknown>(
  response: Response,
  corsHeaders: Record<string, string>,
): Promise<{ data: T | null; error: Response | null }> {
  const errResp = handleAIError(response, corsHeaders);
  if (errResp) return { data: null, error: errResp };

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("AI error:", response.status, text);
    return {
      data: null,
      error: new Response(JSON.stringify({ error: `AI error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }),
    };
  }

  try {
    const aiResponse = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let content = aiResponse.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const data = JSON.parse(content) as T;
    return { data, error: null };
  } catch (e) {
    console.error("JSON parse error:", e);
    return {
      data: null,
      error: new Response(JSON.stringify({ error: "AI response could not be parsed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }),
    };
  }
}
