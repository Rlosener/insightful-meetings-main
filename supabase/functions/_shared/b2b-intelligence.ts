type Correction = {
  from: string;
  to: string;
  confidence: "high" | "medium";
  reason: string;
};

export type EntityType =
  | "organization"
  | "company"
  | "institution"
  | "program"
  | "project"
  | "product"
  | "platform"
  | "person"
  | "department"
  | "position";

export type EntityConfidence = "high" | "medium" | "low";

export type DetectedEntity = {
  name: string;
  normalized: string;
  type: EntityType;
  confidence: EntityConfidence;
  source: string;
  aliases: string[];
};

type PublicContextItem = {
  entity: string;
  source: string;
  summary: string;
};

type RecordingInfoInput = Record<string, unknown> | null | undefined;
type InterviewQuestionInput = Record<string, unknown>;

const BUILT_IN_ENTITY_ALIASES: Record<string, string[]> = {
  Donebird: ["done bird", "don bird", "dunbird", "donedbird", "donebird", "doneburd"],
  HAVELSAN: ["habersan", "havelsan", "havelsin", "havelsun"],
  "JET CUBE": ["jetcube", "jet cube", "cet cube", "cetcube"],
  BİVEYOS: ["biveyos", "biveyos", "biveyöz", "biveyoz", "biviyos"],
  Bigital: ["big it al", "bijital", "bigital", "bigitali"],
};

const OFFICIAL_CONTEXT_CATALOG = [
  {
    entity: "HAVELSAN",
    aliases: ["havelsan"],
    urls: ["https://www.havelsan.com.tr/tr"],
  },
  {
    entity: "Donebird",
    aliases: ["donebird"],
    urls: ["https://donebird.com"],
  },
] as const;

const normalizeKey = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const unique = <T,>(items: T[]) => Array.from(new Set(items));

const levenshtein = (a: string, b: string) => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
};

const extractTextValues = (value: unknown): string[] => {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(extractTextValues);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(extractTextValues);
  return [];
};

type CandidateSeed = {
  value: string;
  source: string;
  type: EntityType;
  confidence: EntityConfidence;
};

const pushSeed = (
  seeds: CandidateSeed[],
  value: unknown,
  source: string,
  type: EntityType,
  confidence: EntityConfidence,
) => {
  for (const item of extractTextValues(value)) {
    const cleaned = item.replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.length < 2) continue;
    seeds.push({ value: cleaned, source, type, confidence });
  }
};

const classifyFreeformEntity = (value: string): { type: EntityType; confidence: EntityConfidence } => {
  const normalized = normalizeKey(value);

  if (/\b(a s|anonim|holding|ltd|limited|inc|corp|company|co)\b/.test(normalized)) {
    return { type: "company", confidence: "medium" };
  }
  if (/\b(universitesi|universitesi|bakanligi|ministry|kurumu|kuruluşu|kurulusu|vakfi|vakfı|belediyesi)\b/.test(normalized)) {
    return { type: "institution", confidence: "medium" };
  }
  if (/\b(programi|programı|program|bigg|accelerator|hizlandirma)\b/.test(normalized)) {
    return { type: "program", confidence: "medium" };
  }
  if (/\b(proje|project)\b/.test(normalized)) {
    return { type: "project", confidence: "medium" };
  }
  if (/\b(platform|platformu|portal|suite)\b/.test(normalized)) {
    return { type: "platform", confidence: "medium" };
  }
  if (/\b(ürünü|urunu|ürün|urün|product)\b/.test(normalized)) {
    return { type: "product", confidence: "medium" };
  }
  if (/\b(muhendis|engineer|manager|director|lead|specialist|uzmani|uzman|developer|analyst)\b/.test(normalized)) {
    return { type: "position", confidence: "medium" };
  }
  if (/\b(insan kaynaklari|ik|engineering|muhendislik|satış|satis|marketing|pazarlama|urun|product)\b/.test(normalized)) {
    return { type: "department", confidence: "medium" };
  }

  return { type: "organization", confidence: "low" };
};

const collectEntitySeeds = (recordingInfo: RecordingInfoInput, interviewQuestions?: InterviewQuestionInput[]) => {
  const seeds: CandidateSeed[] = [];

  for (const builtin of Object.keys(BUILT_IN_ENTITY_ALIASES)) {
    const builtinType: EntityType =
      builtin === "Donebird" ? "platform" :
      builtin === "HAVELSAN" ? "company" :
      builtin === "JET CUBE" ? "program" :
      builtin === "BİVEYOS" ? "product" :
      "platform";
    seeds.push({ value: builtin, source: "builtin_dictionary", type: builtinType, confidence: "high" });
  }

  pushSeed(seeds, recordingInfo?.companyName, "companyName", "company", "high");
  pushSeed(seeds, recordingInfo?.organizationName, "organizationName", "organization", "high");
  pushSeed(seeds, recordingInfo?.position, "position", "position", "high");
  pushSeed(seeds, recordingInfo?.department, "department", "department", "high");
  pushSeed(seeds, recordingInfo?.candidateName, "candidateName", "person", "high");
  pushSeed(seeds, recordingInfo?.candidateSurname, "candidateSurname", "person", "medium");
  pushSeed(seeds, recordingInfo?.participants, "participants", "person", "high");
  pushSeed(seeds, recordingInfo?.meetingTopic, "meetingTopic", "project", "medium");
  pushSeed(seeds, recordingInfo?.meetingAgenda, "meetingAgenda", "project", "low");
  pushSeed(seeds, recordingInfo?.meetingPurpose, "meetingPurpose", "program", "low");
  pushSeed(seeds, recordingInfo?.decisionTopics, "decisionTopics", "project", "low");
  pushSeed(seeds, recordingInfo?.expectedOutcomes, "expectedOutcomes", "project", "low");
  pushSeed(seeds, recordingInfo?.additionalNotes, "additionalNotes", "organization", "low");
  pushSeed(seeds, recordingInfo?.interviewNotes, "interviewNotes", "organization", "low");
  pushSeed(seeds, recordingInfo?.requiredSkills, "requiredSkills", "position", "low");
  pushSeed(seeds, recordingInfo?.evaluationCriteria, "evaluationCriteria", "program", "low");
  pushSeed(seeds, recordingInfo?.customQuestions, "customQuestions", "project", "low");

  for (const question of interviewQuestions || []) {
    pushSeed(seeds, question?.question, "interviewQuestions", "project", "low");
    pushSeed(seeds, question?.category, "interviewQuestionCategory", "program", "low");
  }

  return seeds
    .map((seed) => {
      const wordCount = seed.value.split(/\s+/).length;
      if (wordCount > 8 || seed.value.length < 3) return null;
      const likelyEntity =
        /[A-ZÇĞİÖŞÜ]/.test(seed.value) ||
        /^[A-Z0-9\s/+&.-]+$/.test(seed.value) ||
        wordCount <= 4 ||
        seed.confidence !== "low";
      if (!likelyEntity) return null;
      return seed;
    })
    .filter(Boolean) as CandidateSeed[];
};

const buildCandidateDictionary = (recordingInfo: RecordingInfoInput, interviewQuestions?: InterviewQuestionInput[]) => {
  const grouped = new Map<string, DetectedEntity>();

  for (const seed of collectEntitySeeds(recordingInfo, interviewQuestions)) {
    const normalized = normalizeKey(seed.value);
    if (!normalized) continue;

    const existing = grouped.get(normalized);
    if (existing) {
      existing.aliases = Array.from(new Set([...existing.aliases, seed.value]));
      if (seed.confidence === "high" || (seed.confidence === "medium" && existing.confidence === "low")) {
        existing.confidence = seed.confidence;
        existing.type = seed.type;
        existing.source = seed.source;
      }
      continue;
    }

    grouped.set(normalized, {
      name: seed.value,
      normalized,
      type: seed.type,
      confidence: seed.confidence,
      source: seed.source,
      aliases: [seed.value],
    });
  }

  for (const entry of grouped.values()) {
    if (entry.confidence === "low") {
      const inferred = classifyFreeformEntity(entry.name);
      entry.type = inferred.type;
      entry.confidence = inferred.confidence;
    }
  }

  const dictionary = Array.from(grouped.values()).map((entity) => {
    const aliases = BUILT_IN_ENTITY_ALIASES[entity.name] || [];
    const automaticAliases = unique([
      entity.name,
      entity.name.replace(/\s+/g, ""),
      entity.name.replace(/[-_/]+/g, " "),
      entity.name.replace(/[().]/g, ""),
      entity.name.replace(/\s*&\s*/g, " and "),
    ]).filter((value) => value && normalizeKey(value) !== entity.normalized);

    return {
      canonical: entity.name,
      normalized: entity.normalized,
      type: entity.type,
      confidence: entity.confidence,
      source: entity.source,
      aliases: Array.from(new Set([entity.name, ...entity.aliases, ...aliases, ...automaticAliases])).map((value) => ({
        raw: value,
        normalized: normalizeKey(value),
      })),
    };
  });

  return dictionary.sort((a, b) => b.normalized.length - a.normalized.length);
};

export function buildProperNounGlossary(recordingInfo: RecordingInfoInput, interviewQuestions?: InterviewQuestionInput[]) {
  return buildCandidateDictionary(recordingInfo, interviewQuestions).map((item) => item.canonical);
}

export function detectEntities(recordingInfo: RecordingInfoInput, interviewQuestions?: InterviewQuestionInput[]): DetectedEntity[] {
  return buildCandidateDictionary(recordingInfo, interviewQuestions).map((item) => ({
    name: item.canonical,
    normalized: item.normalized,
    type: item.type,
    confidence: item.confidence,
    source: item.source,
    aliases: item.aliases.map((alias) => alias.raw),
  }));
}

export function normalizeTranscriptWithEntities(
  transcript: string,
  recordingInfo: RecordingInfoInput,
  interviewQuestions?: InterviewQuestionInput[],
): { transcript: string; corrections: Correction[]; glossary: string[] } {
  const dictionary = buildCandidateDictionary(recordingInfo, interviewQuestions);
  let updatedTranscript = transcript;
  const corrections: Correction[] = [];

  for (const entry of dictionary) {
    for (const alias of entry.aliases) {
      if (!alias.normalized || alias.normalized === entry.normalized) continue;

      const explicitPattern = new RegExp(`\\b${escapeRegExp(alias.raw)}\\b`, "gi");
      updatedTranscript = updatedTranscript.replace(explicitPattern, (match) => {
        if (normalizeKey(match) === entry.normalized) return match;
        corrections.push({
          from: match,
          to: entry.canonical,
          confidence: entry.confidence === "low" ? "medium" : "high",
          reason: "explicit_alias_match",
        });
        return entry.canonical;
      });
    }
  }

  const tokens = updatedTranscript.match(/[^\s]+|\s+/g) || [];
  const wordIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => /\S/.test(token));

  for (const entry of dictionary) {
    const wordCount = entry.canonical.split(/\s+/).length;
    if (wordCount === 0) continue;

    for (let i = 0; i <= wordIndexes.length - wordCount; i++) {
      const slice = wordIndexes.slice(i, i + wordCount);
      const candidate = slice.map(({ token }) => token).join(" ");
      const normalizedCandidate = normalizeKey(candidate);

      if (!normalizedCandidate || normalizedCandidate === entry.normalized) continue;
      if (normalizedCandidate.length < 4 || entry.normalized.length < 4) continue;

      const distance = levenshtein(normalizedCandidate.replace(/\s+/g, ""), entry.normalized.replace(/\s+/g, ""));
      if (entry.confidence === "low") continue;
      const protectedEntity =
        entry.type === "organization" ||
        entry.type === "company" ||
        entry.type === "institution" ||
        entry.type === "program" ||
        entry.type === "project" ||
        entry.type === "product" ||
        entry.type === "platform";
      const maxDistance = protectedEntity
        ? (entry.normalized.length >= 12 ? 3 : 2)
        : (entry.normalized.length >= 10 ? 2 : 1);
      if (distance > maxDistance) continue;

      const rawStart = slice[0].index;
      const rawEnd = slice[slice.length - 1].index;
      const originalTokens = tokens.slice(rawStart, rawEnd + 1).join("");

      if (normalizeKey(originalTokens) === entry.normalized) continue;

      tokens.splice(rawStart, rawEnd - rawStart + 1, entry.canonical);
      corrections.push({
        from: originalTokens,
        to: entry.canonical,
        confidence: "medium",
        reason: "fuzzy_entity_match",
      });

      break;
    }
  }

  if (corrections.length > 0) {
    updatedTranscript = tokens.join("");
  }

  const uniqueCorrections = corrections.filter(
    (item, index, arr) => arr.findIndex((other) => other.from === item.from && other.to === item.to) === index,
  );

  return {
    transcript: updatedTranscript,
    corrections: uniqueCorrections,
    glossary: dictionary.map((item) => item.canonical),
  };
}

const withTimeout = async (url: string, timeoutMs = 3500) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: { "User-Agent": "Donebird-B2B-Context/1.0" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const extractHtmlMetadata = (html: string) => {
  const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, " ").trim() || "";
  const metaDescription =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]?.trim() ||
    "";

  return {
    title,
    metaDescription,
  };
};

export async function fetchControlledPublicContext(recordingInfo: RecordingInfoInput): Promise<{
  items: PublicContextItem[];
  sources: string[];
}> {
  const strongEntities = detectEntities(recordingInfo).filter((item) => item.confidence !== "low");
  const normalizedGlossary = strongEntities.map((item) => item.normalized);
  const matchedEntries = OFFICIAL_CONTEXT_CATALOG.filter((entry) =>
    entry.aliases.some((alias) => normalizedGlossary.includes(normalizeKey(alias))),
  );

  const items: PublicContextItem[] = [];
  const sources: string[] = [];

  for (const entry of matchedEntries) {
    for (const url of entry.urls) {
      try {
        const response = await withTimeout(url);
        if (!response.ok) continue;

        const html = await response.text();
        const metadata = extractHtmlMetadata(html);
        const summary = [metadata.title, metadata.metaDescription]
          .filter(Boolean)
          .join(" - ")
          .slice(0, 320);

        if (!summary) continue;

        items.push({
          entity: entry.entity,
          source: url,
          summary,
        });
        sources.push(url);
        break;
      } catch (error) {
        console.warn("[b2b-intelligence] public context fetch failed", entry.entity, url, error);
      }
    }
  }

  return { items, sources };
}
