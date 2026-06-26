import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { callAI, parseAIResponse } from "../_shared/ai-client.ts";
import { aiProviderChecks, healthResponse, isHealthRequest, supabaseChecks } from "../_shared/health.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TRUSTED_SOURCE_HINTS = [
  "Reuters",
  "Bloomberg",
  "Financial Times",
  "Wall Street Journal",
  "CNBC",
  "AA",
  "Anadolu Ajansı",
  "TRT Haber",
  "Dünya",
  "Dunya",
  "Ekonomim",
  "Hürriyet",
  "Hurriyet",
  "Habertürk",
  "Haberturk",
  "NTV",
  "Business HT",
  "KAP",
  "Resmi Gazete",
  "Ticaret Bakanlığı",
  "Ticaret Bakanligi",
  "Sanayi ve Teknoloji Bakanlığı",
  "Sanayi ve Teknoloji Bakanligi",
  "TCMB",
  "TÜİK",
  "TUIK",
  "EPDK",
  "TOBB",
  "OECD",
  "IMF",
  "World Bank",
  "European Commission",
  "IEA",
  "World Steel",
  "McKinsey",
  "PwC",
  "Deloitte",
  "KPMG",
];

type Confidence = "high" | "medium" | "low" | "insufficient_evidence";
type RequestType = "overview" | "chat" | "sector_analysis" | "sector_retrieval";

type SourceName =
  | "meetings"
  | "interviews"
  | "actions"
  | "members"
  | "practices"
  | "profile"
  | "sector"
  | "advisor_history";

type EvidenceSnippet = {
  id: string;
  source: SourceName;
  title: string;
  content: string;
  score: number;
  date?: string | null;
};

type RetrievedDevelopment = {
  title: string;
  description: string;
  source: string;
  url: string;
  published_at: string | null;
  relevance_score: number;
  relevance_reasons: string[];
  tags: string[];
  trusted: boolean;
  query: string;
};

const STOP_WORDS = new Set([
  "ve", "ile", "bir", "bu", "için", "icin", "gibi", "olan", "olarak", "çok", "cok", "daha", "ama", "veya",
  "şu", "su", "son", "güncel", "guncel", "nedir", "hangi", "neden", "nasıl", "nasil", "ne", "mi", "mı", "mu",
  "mü", "the", "and", "for", "with", "from", "that", "your", "şirket", "sirket",
]);

const unique = <T,>(items: T[]) => [...new Set(items.filter(Boolean as any))];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeText = (value: unknown) =>
  typeof value === "string"
    ? value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9çğıöşü\s-]/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";

const rawArray = (value: unknown) => Array.isArray(value) ? value : [];

const safeArray = (value: unknown) => rawArray(value).filter((item) => typeof item === "string" && item.trim()) as string[];

const tokenize = (value: unknown) =>
  unique(
    normalizeText(value)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );

const scoreTokenOverlap = (left: string[], right: string[]) => {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return overlap;
};

const ALLOWED_TYPES: RequestType[] = ["overview", "chat", "sector_analysis", "sector_retrieval"];

const getSectorProfileGaps = (profile: any) => {
  if (!profile) {
    return ["company_profile"];
  }

  const missing: string[] = [];
  if (!profile.sector && !profile.sub_sector) missing.push("sector");
  if (safeArray(profile.products_services).length === 0) missing.push("products_services");
  if (safeArray(profile.target_markets).length === 0) missing.push("target_markets");

  return missing;
};

const buildProfileSignals = (profile: any) => {
  if (!profile) {
    return {
      keywords: [] as string[],
      focusAreas: [] as string[],
      queryTerms: [] as string[],
      summary: "Şirket profili bulunamadı.",
    };
  }

  const products = safeArray(profile.products_services);
  const markets = safeArray(profile.target_markets);
  const costs = safeArray(profile.critical_cost_items);
  const risks = safeArray(profile.strategic_risks);
  const dependencies = safeArray(profile.supply_dependencies);
  const cities = safeArray(profile.operation_cities);

  const rawTerms = [
    profile.company_name,
    profile.sector,
    profile.sub_sector,
    profile.operation_type,
    profile.import_structure,
    profile.export_structure,
    profile.notes,
    ...products,
    ...markets,
    ...costs,
    ...risks,
    ...dependencies,
    ...cities,
  ].filter(Boolean) as string[];

  const keywords = unique(rawTerms.flatMap((term) => tokenize(term)).slice(0, 80));
  const queryTerms = unique([
    profile.sector,
    profile.sub_sector,
    ...products.slice(0, 4),
    ...costs.slice(0, 3),
    ...markets.slice(0, 3),
    ...dependencies.slice(0, 3),
  ].filter((term): term is string => typeof term === "string" && term.trim().length > 0));

  const summaryParts = [
    profile.company_name ? `Şirket: ${profile.company_name}` : null,
    profile.sector ? `Sektör: ${profile.sector}${profile.sub_sector ? ` / ${profile.sub_sector}` : ""}` : null,
    products.length > 0 ? `Ürünler/Hizmetler: ${products.slice(0, 5).join(", ")}` : null,
    markets.length > 0 ? `Hedef pazarlar: ${markets.slice(0, 4).join(", ")}` : null,
    costs.length > 0 ? `Kritik maliyetler: ${costs.slice(0, 4).join(", ")}` : null,
    dependencies.length > 0 ? `Tedarik bağımlılıkları: ${dependencies.slice(0, 4).join(", ")}` : null,
  ].filter(Boolean);

  return {
    keywords,
    focusAreas: unique([...costs, ...risks, ...dependencies, ...products].slice(0, 12)),
    queryTerms,
    summary: summaryParts.join(" | ") || "Şirket profili sınırlı.",
  };
};

const buildSectorQueries = (profile: any) => {
  const { queryTerms } = buildProfileSignals(profile);
  if (queryTerms.length === 0) return [];

  const seeds = unique(queryTerms).slice(0, 6);
  const suffixes = [
    "sektör gelişmeleri",
    "industry news",
    "tedarik zinciri",
    "maliyet baskısı",
    "ihracat",
    "regulation",
  ];

  return unique(
    seeds.flatMap((seed) => suffixes.slice(0, 2).map((suffix) => `${seed} ${suffix}`)).slice(0, 8),
  );
};

const isTrustedSource = (source: string) => {
  const normalized = normalizeText(source);
  return TRUSTED_SOURCE_HINTS.some((hint) => normalized.includes(normalizeText(hint)));
};

const decodeHtml = (value: string) =>
  value
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

const parseRssItems = (xml: string) => {
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return itemMatches.map((match) => {
    const item = match[1];
    const extract = (tag: string) => {
      const found = item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return found ? decodeHtml(found[1]) : "";
    };

    const title = extract("title");
    const link = extract("link");
    const pubDate = extract("pubDate");
    const description = extract("description");
    const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceMatch ? decodeHtml(sourceMatch[1]) : safeHostFromUrl(link);

    return { title, link, pubDate, description, source };
  }).filter((item) => item.title && item.link);
};

const safeHostFromUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const fetchWithTimeout = async (url: string, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const deriveRadarTags = (item: { title: string; description: string }, profile: any) => {
  const combined = normalizeText(`${item.title} ${item.description}`);
  const tags = new Set<string>();
  const profileSignals = buildProfileSignals(profile);

  for (const focus of profileSignals.focusAreas) {
    const normalizedFocus = normalizeText(focus);
    if (normalizedFocus && combined.includes(normalizedFocus)) {
      tags.add(focus);
    }
  }

  const keywordMap: Record<string, string> = {
    enerji: "enerji",
    ihracat: "ihracat",
    import: "ithalat",
    ithalat: "ithalat",
    supply: "tedarik",
    tedarik: "tedarik",
    regulation: "regülasyon",
    regülasyon: "regülasyon",
    tariff: "tarife",
    vergi: "vergi",
    financing: "finansman",
    kur: "kur",
    ai: "ai",
  };

  Object.entries(keywordMap).forEach(([needle, label]) => {
    if (combined.includes(normalizeText(needle))) {
      tags.add(label);
    }
  });

  return [...tags].slice(0, 6);
};

const scoreRetrievedDevelopment = (item: { title: string; description: string; source: string }, profile: any) => {
  const profileSignals = buildProfileSignals(profile);
  const contentTokens = tokenize(`${item.title} ${item.description}`);
  const overlap = scoreTokenOverlap(profileSignals.keywords, contentTokens);
  const reasons: string[] = [];

  if (overlap >= 5) reasons.push("Şirket profilindeki anahtar alanlarla güçlü örtüşme var.");
  else if (overlap >= 3) reasons.push("Şirket profilindeki birkaç kritik alanla ilişkili.");

  const combined = normalizeText(`${item.title} ${item.description}`);

  for (const focusArea of profileSignals.focusAreas.slice(0, 5)) {
    const normalizedFocus = normalizeText(focusArea);
    if (normalizedFocus && combined.includes(normalizedFocus)) {
      reasons.push(`Doğrudan ilgili sinyal: ${focusArea}`);
    }
  }

  if (isTrustedSource(item.source)) {
    reasons.push("Güvenilir kaynak filtresinden geçti.");
  }

  let score = overlap * 1.6;
  if (isTrustedSource(item.source)) score += 2;
  if (profileSignals.queryTerms.some((term) => combined.includes(normalizeText(term)))) score += 2;

  return {
    score: clamp(Math.round(score), 1, 10),
    reasons: unique(reasons).slice(0, 3),
  };
};

const fetchSectorDevelopments = async (profile: any): Promise<{ developments: RetrievedDevelopment[]; queriesUsed: string[] }> => {
  const queries = buildSectorQueries(profile);
  if (queries.length === 0) {
    return { developments: [], queriesUsed: [] };
  }

  const results: RetrievedDevelopment[] = [];

  for (const query of queries.slice(0, 6)) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=tr&gl=TR&ceid=TR:tr`;
      const response = await fetchWithTimeout(url);
      if (!response.ok) continue;

      const xml = await response.text();
      const items = parseRssItems(xml).slice(0, 8);

      for (const item of items) {
        const trusted = isTrustedSource(item.source);
        const { score, reasons } = scoreRetrievedDevelopment({
          title: item.title,
          description: item.description,
          source: item.source,
        }, profile);

        const relevanceScore = trusted ? score : Math.max(1, score - 2);
        if (!trusted && relevanceScore < 4) continue;

        results.push({
          title: item.title,
          description: item.description || "Kısa özet bulunamadı.",
          source: item.source,
          url: item.link,
          published_at: item.pubDate || null,
          relevance_score: relevanceScore,
          relevance_reasons: trusted
            ? reasons
            : unique([...reasons, "Kaynak güven filtresinde ikincil kaynak olarak işaretlendi."]).slice(0, 3),
          tags: deriveRadarTags({ title: item.title, description: item.description }, profile),
          trusted,
          query,
        });
      }
    } catch (error) {
      console.error("Sector retrieval failed for query:", query, error);
    }
  }

  const deduped = new Map<string, RetrievedDevelopment>();
  results.forEach((item) => {
    const key = normalizeText(item.title);
    const existing = deduped.get(key);
    if (!existing || item.relevance_score > existing.relevance_score) {
      deduped.set(key, item);
    }
  });

  return {
    developments: [...deduped.values()]
      .sort((left, right) => right.relevance_score - left.relevance_score)
      .slice(0, 8),
    queriesUsed: queries,
  };
};

const buildEvidencePack = ({
  question,
  profile,
  meetings,
  interviews,
  actions,
  members,
  practices,
  sectorDevs,
  advisorHistory,
}: {
  question: string;
  profile: any;
  meetings: any[];
  interviews: any[];
  actions: any[];
  members: any[];
  practices: any[];
  sectorDevs: any[];
  advisorHistory: any[];
}) => {
  const questionTokens = tokenize(question);
  const profileSignals = buildProfileSignals(profile);
  const targetTokens = unique([...questionTokens, ...profileSignals.keywords.slice(0, 30)]);

  const snippets: EvidenceSnippet[] = [];

  if (profile) {
    snippets.push({
      id: "profile",
      source: "profile",
      title: profile.company_name || "Şirket profili",
      content: profileSignals.summary,
      score: 3 + scoreTokenOverlap(targetTokens, tokenize(profileSignals.summary)),
    });
  }

  meetings.slice(0, 20).forEach((recording) => {
    const analysis = (recording.analysis_data || {}) as any;
    const decisions = rawArray(analysis.decisions_made).map((item: any) => typeof item === "string" ? item : item?.decision).filter(Boolean);
    const unresolved = safeArray(analysis.unresolved_topics).concat(safeArray(analysis.unresolved_issues));
    const summary = [
      recording.title,
      recording.summary,
      analysis.executive_summary?.overall_evaluation,
      decisions.join("; "),
      unresolved.join("; "),
    ].filter(Boolean).join(" | ");

    snippets.push({
      id: `meeting-${recording.id}`,
      source: "meetings",
      title: recording.title,
      content: summary,
      date: recording.date,
      score: scoreTokenOverlap(targetTokens, tokenize(summary)) + 2,
    });
  });

  interviews.slice(0, 12).forEach((recording) => {
    const analysis = (recording.analysis_data || {}) as any;
    const summary = [
      recording.title,
      analysis.hiring_recommendation?.decision,
      analysis.hiring_recommendation?.summary,
      analysis.executive_summary?.overall_evaluation,
    ].filter(Boolean).join(" | ");

    snippets.push({
      id: `interview-${recording.id}`,
      source: "interviews",
      title: recording.title,
      content: summary,
      date: recording.date,
      score: scoreTokenOverlap(targetTokens, tokenize(summary)) + 1.5,
    });
  });

  actions.slice(0, 30).forEach((action, index) => {
    const summary = [
      action.task_description,
      action.owner,
      action.priority,
      action.status,
      action.ai_suggestion,
    ].filter(Boolean).join(" | ");

    snippets.push({
      id: `action-${index}`,
      source: "actions",
      title: action.task_description,
      content: summary,
      date: action.created_at,
      score: scoreTokenOverlap(targetTokens, tokenize(summary)) + (action.status !== "completed" ? 1.5 : 0),
    });
  });

  members.slice(0, 20).forEach((member, index) => {
    const summary = [
      member.full_name,
      member.position,
      member.department,
      safeArray(member.skills).join(", "),
      member.notes,
      member.ai_analysis,
    ].filter(Boolean).join(" | ");

    snippets.push({
      id: `member-${index}`,
      source: "members",
      title: member.full_name || `Personel ${index + 1}`,
      content: summary,
      score: scoreTokenOverlap(targetTokens, tokenize(summary)) + 1,
    });
  });

  practices.slice(0, 10).forEach((practice, index) => {
    const analysis = (practice.analysis_data || {}) as any;
    const summary = [
      practice.position,
      practice.department,
      analysis.executive_summary?.overall_evaluation,
      analysis.summary,
    ].filter(Boolean).join(" | ");

    snippets.push({
      id: `practice-${index}`,
      source: "practices",
      title: practice.position || `Pratik mülakat ${index + 1}`,
      content: summary,
      date: practice.created_at,
      score: scoreTokenOverlap(targetTokens, tokenize(summary)) + 0.5,
    });
  });

  sectorDevs.slice(0, 15).forEach((development, index) => {
    const summary = [
      development.title,
      development.description,
      development.ai_commentary,
      safeArray(development.tags).join(", "),
      development.risk_level,
    ].filter(Boolean).join(" | ");

    snippets.push({
      id: `sector-${index}`,
      source: "sector",
      title: development.title,
      content: summary,
      date: development.created_at,
      score: scoreTokenOverlap(targetTokens, tokenize(summary)) + 2,
    });
  });

  advisorHistory.slice(0, 6).forEach((history, index) => {
    const answer = history.answer as any;
    const summary = [
      history.question,
      answer?.executive_summary,
      safeArray(answer?.key_findings).join("; "),
    ].filter(Boolean).join(" | ");

    snippets.push({
      id: `history-${index}`,
      source: "advisor_history",
      title: history.question,
      content: summary,
      date: history.created_at,
      score: scoreTokenOverlap(targetTokens, tokenize(summary)) + 0.5,
    });
  });

  const sorted = snippets
    .filter((snippet) => snippet.content.trim().length > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);

  const compactContext = sorted
    .map((snippet, index) => `${index + 1}. [${snippet.source}] ${snippet.title}${snippet.date ? ` (${String(snippet.date).slice(0, 10)})` : ""}: ${snippet.content.slice(0, 360)}`)
    .join("\n");

  return {
    compactContext,
    sourcesUsed: unique(sorted.map((snippet) => snippet.source)),
    evidenceCount: sorted.length,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    console.log("[company-advisor] raw request body:", rawBody);

    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch (_error) {
      return new Response(JSON.stringify({ error: "Request body geçerli JSON değil." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isHealthRequest(body)) {
      return healthResponse("company-advisor", {
        ...supabaseChecks({ anon: true }),
        ...aiProviderChecks(),
      }, corsHeaders);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Yetkilendirme gerekli" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Oturum geçersiz" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestType = typeof body?.type === "string" ? body.type.trim() : "";
    console.log("[company-advisor] parsed type:", requestType || "<empty>");

    if (!requestType) {
      return new Response(JSON.stringify({ error: "type alanı zorunlu. Geçerli değerler: overview, chat, sector_analysis, sector_retrieval." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_TYPES.includes(requestType as RequestType)) {
      return new Response(JSON.stringify({ error: `Desteklenmeyen type: ${requestType}. Geçerli değerler: overview, chat, sector_analysis, sector_retrieval.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { question, chatHistory, developmentTitle, developmentDescription } = body;
    const type = requestType as RequestType;

    const [recordingsRes, actionsRes, membersRes, practiceRes, profileRes, historyRes, sectorRes] = await Promise.all([
      supabase.from("recordings").select("id, title, type, date, duration, summary, analysis_data").eq("user_id", user.id).order("date", { ascending: false }).limit(30),
      supabase.from("action_items").select("task_description, owner, priority, status, deadline, ai_suggestion, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80),
      supabase.from("company_members").select("full_name, position, department, skills, notes, ai_analysis").eq("user_id", user.id),
      supabase.from("practice_interviews").select("position, department, analysis_data, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("company_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("advisor_history").select("question, answer, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("sector_developments").select("title, description, risk_level, ai_commentary, tags, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);

    const recordings = recordingsRes.data || [];
    const actions = actionsRes.data || [];
    const members = membersRes.data || [];
    const practices = practiceRes.data || [];
    const companyProfile = profileRes.data as any;
    const advisorHistory = historyRes.data || [];
    const sectorDevs = sectorRes.data || [];

    const meetings = recordings.filter((recording: any) => recording.type === "toplantı");
    const interviews = recordings.filter((recording: any) => recording.type === "mülakat");

    const pendingActions = actions.filter((action: any) => action.status !== "completed");
    const overdueActions = pendingActions.filter((action: any) => action.deadline && new Date(action.deadline) < new Date());

    const profileSignals = buildProfileSignals(companyProfile);

    const allTopics = recordings.slice(0, 20).flatMap((recording: any) => {
      const analysis = recording.analysis_data as any;
      return [...safeArray(analysis?.key_topics), ...safeArray(analysis?.unresolved_topics), ...safeArray(analysis?.unresolved_issues)];
    });

    const topicFrequency: Record<string, number> = {};
    allTopics.forEach((topic) => {
      const key = normalizeText(topic);
      if (key) topicFrequency[key] = (topicFrequency[key] || 0) + 1;
    });

    const recurringThemes = Object.entries(topicFrequency)
      .filter(([, count]) => count >= 2)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([topic, count]) => `${topic} (${count}x)`);

    const hiringDecisions = interviews
      .slice(0, 10)
      .map((recording: any) => (recording.analysis_data as any)?.hiring_recommendation?.decision)
      .filter(Boolean);

    const hiringStats = {
      total: hiringDecisions.length,
      recommended: hiringDecisions.filter((decision: string) => decision === "recommend" || decision === "strongly_recommend").length,
      notRecommended: hiringDecisions.filter((decision: string) => decision === "not_recommend").length,
    };

    const stats = {
      totalMeetings: meetings.length,
      totalInterviews: interviews.length,
      totalMembers: members.length,
      totalActions: actions.length,
      pendingActions: pendingActions.length,
      overdueActions: overdueActions.length,
      completedActions: actions.filter((action: any) => action.status === "completed").length,
      practiceInterviews: practices.length,
    };

    if (type === "sector_retrieval") {
      console.log("[company-advisor] branch=sector_retrieval");
      const profileGaps = getSectorProfileGaps(companyProfile);

      if (!companyProfile) {
        return new Response(JSON.stringify({
          error: "Şirket profili bulunamadı. Otomatik tarama için önce şirket profilinizi oluşturun.",
          missing_fields: profileGaps,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (profileGaps.length > 0) {
        return new Response(JSON.stringify({
          error: `Şirket profili otomatik tarama için eksik. Lütfen şu alanları doldurun: ${profileGaps.join(", ")}.`,
          missing_fields: profileGaps,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { developments, queriesUsed } = await fetchSectorDevelopments(companyProfile);
      return new Response(JSON.stringify({
        developments,
        queries_used: queriesUsed,
        profile_summary: profileSignals.summary,
        insufficient_data: developments.length === 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "sector_analysis") {
      console.log("[company-advisor] branch=sector_analysis");
      if (!developmentTitle || String(developmentTitle).trim().length < 3) {
        return new Response(JSON.stringify({ error: "developmentTitle alanı zorunlu." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!companyProfile) {
        return new Response(JSON.stringify({ error: "Şirket profili bulunamadı. Önce şirket profilini oluşturun." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const response = await callAI({
        messages: [
          {
            role: "system",
            content: `Sen bir sektörel analiz uzmanısın. Verilen gelişmeyi şirket profiline göre yorumla. Türkçe cevap ver.

CEVAP FORMATI (JSON):
{
  "risk_level": "high | medium | low",
  "opportunity_level": "high | medium | low",
  "cost_impact": "kısa etki açıklaması veya null",
  "sales_impact": "kısa etki açıklaması veya null",
  "margin_impact": "kısa etki açıklaması veya null",
  "supply_impact": "kısa etki açıklaması veya null",
  "market_impact": "kısa etki açıklaması veya null",
  "ai_commentary": "3-4 cümlelik şirkete özel yorum",
  "recommended_action": "1-2 cümlelik önerilen aksiyon",
  "relevance_score": 1-10
}

KURALLAR:
- Yalnızca verilen bilgilere dayan
- Yorumu şirketin sektörüne, ürünlerine, pazarlarına ve maliyet yapısına bağla
- İlişki zayıfsa relevance_score'u düşük ver
- Veri yetersizse bunu açıkça söyle
- Uydurma haber, risk veya fırsat üretme`,
          },
          {
            role: "user",
            content: `ŞİRKET PROFİLİ:\n${profileSignals.summary}\n\nGELİŞME:\nBaşlık: ${developmentTitle}\nAçıklama: ${developmentDescription || "Belirtilmemiş"}`,
          },
        ],
        temperature: 0.25,
        response_format: { type: "json_object" },
        model: "google/gemini-2.5-flash-lite",
      });

      const { data: analysisData, error: parseError } = await parseAIResponse(response, corsHeaders);
      if (parseError) return parseError;

      return new Response(JSON.stringify({ analysis: analysisData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "overview") {
      console.log("[company-advisor] branch=overview");
      const recentMeetings = meetings.slice(0, 5).map((recording: any) => {
        const analysis = recording.analysis_data as any;
        return {
          title: recording.title,
          date: recording.date,
          type: recording.type,
          summary: recording.summary || analysis?.executive_summary?.overall_evaluation || null,
          score: analysis?.overall_score ?? null,
          decisions: rawArray(analysis?.decisions_made).map((item: any) => typeof item === "string" ? item : item?.decision).filter(Boolean).slice(0, 2),
        };
      });

      const recentInterviews = interviews.slice(0, 5).map((recording: any) => {
        const analysis = recording.analysis_data as any;
        return {
          title: recording.title,
          date: recording.date,
          score: analysis?.overall_score ?? null,
          decision: analysis?.hiring_recommendation?.decision || null,
          summary: analysis?.hiring_recommendation?.summary?.slice(0, 100) || null,
        };
      });

      const topOverdueActions = overdueActions.slice(0, 5).map((action: any) => ({
        task: action.task_description,
        owner: action.owner,
        priority: action.priority,
        deadline: action.deadline,
      }));

      return new Response(JSON.stringify({
        stats,
        recentMeetings,
        recentInterviews,
        overdueActions: topOverdueActions,
        recurringThemes,
        hiringStats,
        hasEnoughData: recordings.length > 0,
        hasProfile: !!companyProfile,
        recentSectorDevs: sectorDevs.slice(0, 3).map((development: any) => ({
          title: development.title,
          risk_level: development.risk_level,
        })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type !== "chat") {
      return new Response(JSON.stringify({ error: `type=${type} için uygun işleyici bulunamadı.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[company-advisor] branch=chat");
    if (!question || question.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Lütfen bir soru yazın." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasData = recordings.length > 0 || members.length > 0 || actions.length > 0 || !!companyProfile;
    if (!hasData) {
      return new Response(JSON.stringify({
        answer: {
          executive_summary: "Henüz yeterli şirket verisi bulunamadı.",
          key_findings: ["Toplantı, aksiyon veya şirket profili verisi arttıkça daha somut öneriler üretebilirim."],
          risks: [],
          recommended_actions: ["Şirket profilini doldurun", "Toplantı kayıtları ekleyin", "Aksiyon takibini sisteme işleyin"],
          trend_observation: null,
          data_basis: "Yeterli veri bulunmadığı için yorum sınırlı kaldı.",
          confidence: "insufficient_evidence" as Confidence,
        },
        sources_used: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const evidencePack = buildEvidencePack({
      question,
      profile: companyProfile,
      meetings,
      interviews,
      actions,
      members,
      practices,
      sectorDevs,
      advisorHistory,
    });

    const historyMessages = (chatHistory || []).slice(-4).map((message: any) => ({
      role: message.role,
      content: message.role === "assistant" && message.answer
        ? `Önceki yanıt özeti: ${message.answer.executive_summary || message.content}`
        : message.content,
    }));

    const insufficientEvidence = evidencePack.evidenceCount < 3;

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `Sen Donebird AI Şirket Danışmanısın. Retrieval-first çalışan, somut ve karar verdirici bir B2B danışmansın. Türkçe cevap ver.

KURALLAR:
- Yalnızca verilen kanıt paketine ve şirket profiline dayan
- Veri paketinde olmayan bilgiyi uydurma
- Genel geçer tavsiyeler yerine kanıta bağlı, uygulanabilir yorum yaz
- Kanıt zayıfsa bunu açıkça belirt ve confidence'ı düşür
- Kullandığın ana yorumlar mümkünse doğrudan seçilmiş evidence ile ilişkilensin
- Fake haber, fake sektör içgörüsü veya doğrulanmamış iddia üretme

CEVAP FORMATI (JSON):
{
  "executive_summary": "2-3 cümlelik güçlü yönetici özeti",
  "key_findings": ["kanıta dayalı bulgu 1", "kanıta dayalı bulgu 2", "kanıta dayalı bulgu 3"],
  "risks": ["kanıtla desteklenen risk 1", "risk 2"],
  "recommended_actions": ["somut aksiyon 1", "somut aksiyon 2", "somut aksiyon 3"],
  "trend_observation": "varsa tekrar eden desen, yoksa null",
  "data_basis": "kısa veri temeli özeti",
  "confidence": "high | medium | low | insufficient_evidence"
}`,
        },
        ...historyMessages,
        {
          role: "user",
          content: `ŞİRKET PROFİLİ:\n${profileSignals.summary}\n\nSORU:\n${question.slice(0, 500)}\n\nSEÇİLMİŞ KANIT PAKETİ:\n${evidencePack.compactContext || "Kanıt paketi çok sınırlı."}\n\nNOT:\n${insufficientEvidence ? "Kanıt zayıf; yeterli veri yoksa bunu açıkça söyle." : "Yalnızca seçilmiş kanıtlardan hareket et."}`,
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
      model: "google/gemini-2.5-flash-lite",
    });

    const { data: answerData, error: parseErr } = await parseAIResponse(response, corsHeaders);
    if (parseErr) return parseErr;

    try {
      await supabase.from("advisor_history").insert({
        user_id: user.id,
        question: question.slice(0, 500),
        answer: answerData,
        sources_used: evidencePack.sourcesUsed,
      });
    } catch (error) {
      console.error("Failed to save advisor history:", error);
    }

    return new Response(JSON.stringify({
      answer: answerData,
      sources_used: evidencePack.sourcesUsed,
      evidence_count: evidencePack.evidenceCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Company advisor error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Bilinmeyen hata" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
