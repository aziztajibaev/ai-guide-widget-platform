import OpenAI from "openai";
import { getAiProviderDefinition, type AiProviderId } from "./ai-providers";
import type {
  AiSource,
  GuideStep,
  PageElementMetadata,
  PublicGuideRule,
  PublicKnowledgeDocument
} from "./guide-types";
import { getProjectAiRuntimeProvider } from "./store";

type ChooseGuideParams = {
  projectId?: string;
  question: string;
  documents: PublicKnowledgeDocument[];
  path: string;
  pageLanguage?: string;
  metadata: PageElementMetadata[];
  completedSteps?: GuideStep[];
  mode?: "start" | "next";
};

type Provider = AiProviderId | "lmstudio" | "rules";

type RuntimeAiProvider = {
  provider: Provider;
  requested: string;
  configured: boolean;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  source: "project" | "env" | "rules";
};

type AiGuideDecision = {
  guide: PublicGuideRule | null;
  answer: string | null;
  source: AiSource;
};

type GeneratedDecision = {
  guide: PublicGuideRule | null;
  answer: string | null;
};

type PayloadLimits = {
  documentLimit?: number;
  documentChars?: number;
  metadataLimit?: number;
  metadataLabelChars?: number;
  metadataTextChars?: number;
};

type AnswerLanguage = "uz" | "ru" | "en";

export type AiProviderStatus = {
  requested: string;
  active: Provider;
  configured: boolean;
  model: string;
  lastError: string | null;
};

let openaiClient: OpenAI | null = null;
let lastAiProviderError: string | null = null;
let lastAiProviderErrorFor: Provider | null = null;
let lastGeminiModel: string | null = null;
let lastGroqModel: string | null = null;
let lastLmStudioModel: string | null = null;

const robotStates = new Set(["idle", "talking", "pointing", "pointing-left", "pointing-right", "thinking", "success", "error"]);
const placements = new Set(["auto", "top", "right", "bottom", "left"]);
const waitModes = new Set(["click", "focus", "visible", "manual"]);
const stopWords = new Set([
  "where",
  "what",
  "which",
  "can",
  "how",
  "the",
  "this",
  "that",
  "with",
  "from",
  "for",
  "click",
  "button",
  "please",
  "uchun",
  "nima",
  "qanday",
  "qanaqa",
  "qilaman",
  "qilish",
  "kerak",
  "qayerda",
  "qayer",
  "sen",
  "siz",
  "kimsan"
]);

const uzbekSuffixes = ["larini", "larni", "lash", "dagi", "dan", "lar", "ning", "ni", "ga", "da", "i"];
const guideIntentPattern =
  /\b(where|menu|menyu|menuda|menyuda|path|route|qayer|qaer|qayerda|qaerda|qayerdan|qaerdan|qayerga|qaerga|show|guide|navigate|open|click|press|focus|fill|filter|search|find|create|add|select|form|forma|yarat|yaratil|yangi|qo'sh|qosh|ko'rsat|korsat|bos|och|top|yo'naltir|yonaltir)\b/i;
const identityPattern = /\b(sen kimsan|siz kimsiz|who are you|what are you|nima qila olasan|help|yordam)\b/i;
const aiStatusPattern =
  /\b(lmstudio|lm studio|openai|anthropic|claude|groq|deepseek|gemini|mistral|xai|grok|cohere|perplexity|openrouter|ai|provider|model|token|ishlay|working|status|ulangan)\b/i;
const genericTargetWords = new Set(["filter", "search", "select", "click", "button", "field", "input", "find"]);
const createWords = new Set(["create", "new", "yangi", "yarat", "yaratish", "add", "form", "forma", "qosh", "qo'sh"]);
const settingsWords = new Set(["settings", "setting"]);
const maxAiDocuments = 8;
const maxAiDocumentChars = 3500;
const groqPayloadLimits: PayloadLimits = {
  documentLimit: 4,
  documentChars: 1400,
  metadataLimit: 80,
  metadataLabelChars: 70,
  metadataTextChars: 100
};
const russianQueryHints: Array<[RegExp, string[]]> = [
  [/\b(zakaz|buyurt|order)\w*/i, ["order", "\u0437\u0430\u043a\u0430\u0437", "\u043e\u0444\u043e\u0440\u043c\u0438\u0442\u044c", "\u0441\u043e\u0437\u0434\u0430\u0442\u044c"]],
  [/\b(yarat|yaratil|create|new|yangi|qosh|qo'sh|add)\w*/i, ["create", "new", "add", "\u0441\u043e\u0437\u0434\u0430\u0442\u044c", "\u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0435", "\u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c"]],
  [/\b(foydalanuv|user|polzovatel)\w*/i, ["user", "\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c"]],
  [/\b(tashkilot|organiz|org)\w*/i, ["organization", "\u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f"]],
  [/\b(rasch|raschot|rashot|rashotniy|schet|schyot|shot|hisob)\w*/i, ["account", "settlement", "\u0440\u0430\u0441\u0447\u0435\u0442\u043d\u044b\u0439", "\u0440\u0430\u0441\u0447\u0451\u0442\u043d\u044b\u0439", "\u0441\u0447\u0435\u0442", "\u0441\u0447\u0451\u0442"]],
  [/\b(ombor|sklad|warehouse)\w*/i, ["warehouse", "\u0441\u043a\u043b\u0430\u0434"]],
  [/\b(tovar|tmc|tms|mahsulot)\w*/i, ["product", "\u0442\u043c\u0446", "\u0442\u043e\u0432\u0430\u0440"]],
  [/\b(narx|cena|price)\w*/i, ["price", "\u0446\u0435\u043d\u0430", "\u0446\u0435\u043d\u044b"]],
  [/\b(rol|role)\w*/i, ["role", "\u0440\u043e\u043b\u044c", "\u0440\u043e\u043b\u0438"]],
  [/\b(to'?lov|oplata|payment)\w*/i, ["payment", "\u043e\u043f\u043b\u0430\u0442\u0430", "\u043e\u043f\u043b\u0430\u0442\u044b"]],
  [/\b(qaytar|vozvrat|return)\w*/i, ["return", "\u0432\u043e\u0437\u0432\u0440\u0430\u0442"]],
  [/\b(xarid|zakup|purchase)\w*/i, ["purchase", "\u0437\u0430\u043a\u0443\u043f\u043a\u0430"]],
  [/\b(hisobot|otchet|report)\w*/i, ["report", "\u043e\u0442\u0447\u0435\u0442", "\u043e\u0442\u0447\u0451\u0442", "\u043e\u0442\u0447\u0435\u0442\u044b"]],
  [/\b(sozlam|nastroy|setting)\w*/i, ["settings", "\u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430", "\u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438"]],
  [/\b(vizit|tashrif|visit)\w*/i, ["visit", "\u0432\u0438\u0437\u0438\u0442"]],
  [/\b(mijoz|klient|client)\w*/i, ["client", "\u043a\u043b\u0438\u0435\u043d\u0442"]],
  [/\b(ishchi|raboch|zona|zone)\w*/i, ["workzone", "\u0440\u0430\u0431\u043e\u0447\u0430\u044f", "\u0437\u043e\u043d\u0430"]],
  [/\b(kassa|cash)\w*/i, ["cashbox", "\u043a\u0430\u0441\u0441\u0430"]],
  [/\b(moliya|finans|finance)\w*/i, ["finance", "\u0444\u0438\u043d\u0430\u043d\u0441\u044b"]],
  [/\b(spravochnik|ma'?lumotnoma|reference)\w*/i, ["reference", "\u0441\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a", "\u0441\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a\u0438"]]
];

function normalizeForMatch(input: string) {
  return input
    .toLowerCase()
    .replace(/\u0441\u043e\u0437\u0434\u0430\u0442\u044c|\u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0435|\u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c/g, " create ")
    .replace(/\u043d\u043e\u0432\u044b\u0439|\u043d\u043e\u0432\u0430\u044f|\u043d\u043e\u0432\u043e\u0435/g, " new ")
    .replace(/\u0437\u0430\u043a\u0430\u0437\u044b|\u0437\u0430\u043a\u0430\u0437\u0430|\u0437\u0430\u043a\u0430\u0437/g, " order ")
    .replace(/\u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438|\u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430/g, " settings ")
    .replace(/\u0444\u0438\u043b\u044c\u0442\u0440/g, " filter ")
    .replace(/\u043f\u043e\u0438\u0441\u043a/g, " search ")
    .replace(/\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b/g, " user ")
    .replace(/\u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446/g, " organization ")
    .replace(/\u0440\u0430\u0441\u0447[\u0435\u0451]\u0442\u043d|\u0440\u0430\u0441\u0447[\u0435\u0451]\u0442|\u0441\u0447[\u0435\u0451]\u0442/g, " account ")
    .replace(/\u0441\u043a\u043b\u0430\u0434/g, " warehouse ")
    .replace(/\u0442\u043c\u0446|\u0442\u043e\u0432\u0430\u0440/g, " product ")
    .replace(/\u0446\u0435\u043d/g, " price ")
    .replace(/\u0440\u043e\u043b/g, " role ")
    .replace(/\u043e\u043f\u043b\u0430\u0442/g, " payment ")
    .replace(/\u0432\u043e\u0437\u0432\u0440\u0430\u0442/g, " return ")
    .replace(/\u0437\u0430\u043a\u0443\u043f/g, " purchase ")
    .replace(/\u043e\u0442\u0447\u0435\u0442|\u043e\u0442\u0447\u0451\u0442/g, " report ")
    .replace(/\u0432\u0438\u0437\u0438\u0442/g, " visit ")
    .replace(/\u043a\u043b\u0438\u0435\u043d\u0442/g, " client ")
    .replace(/\u0440\u0430\u0431\u043e\u0447/g, " work ")
    .replace(/\u0437\u043e\u043d/g, " zone ")
    .replace(/\u043a\u0430\u0441\u0441/g, " cashbox ")
    .replace(/\u0444\u0438\u043d\u0430\u043d\u0441/g, " finance ")
    .replace(/\u0441\u043f\u0440\u0430\u0432\u043e\u0447/g, " reference ");
}

function isCreateConcept(word: string) {
  return (
    createWords.has(word) ||
    word.startsWith("yarat") ||
    word.startsWith("create") ||
    word.startsWith("add") ||
    word.startsWith("qosh") ||
    word.startsWith("qo'sh")
  );
}

function isSettingsConcept(word: string) {
  return settingsWords.has(word) || word.startsWith("sozlam") || word.startsWith("nastroy") || word.startsWith("setting");
}

function expandQueryWords(question: string) {
  const rawWords = normalizeForMatch(question)
    .replace(/[^\p{L}\p{N}' ]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
  const words = new Set<string>();

  for (const [pattern, hints] of russianQueryHints) {
    if (pattern.test(question)) {
      hints.forEach((hint) => normalizeForMatch(hint).split(/\s+/).filter(Boolean).forEach((word) => words.add(word)));
    }
  }

  for (const word of rawWords) {
    words.add(word);
    for (const suffix of uzbekSuffixes) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) {
        words.add(word.slice(0, -suffix.length));
      }
    }
    if (word.endsWith("s") && word.length > 3) {
      words.add(word.slice(0, -1));
    }
    if (word.startsWith("zakaz") || word.startsWith("order") || word.startsWith("buyurt")) {
      words.add("order");
    }
    if (word.startsWith("yarat") || word.startsWith("yaratil") || word.startsWith("create") || word.startsWith("new") || word.startsWith("yangi")) {
      words.add("create");
      words.add("new");
      words.add("add");
    }
    if (word.startsWith("form") || word.startsWith("qosh") || word.startsWith("qo'sh")) {
      words.add("form");
      words.add("create");
      words.add("add");
    }
    if (
      word.startsWith("rasch") ||
      word.startsWith("rashot") ||
      word.startsWith("schet") ||
      word.startsWith("schyot") ||
      word.startsWith("hisob") ||
      word === "shot"
    ) {
      words.add("account");
      words.add("settlement");
    }
    if (word.startsWith("rol")) {
      words.add("role");
      words.add("roles");
    }
    if (word.startsWith("gender") || word.startsWith("jins")) {
      words.add("gender");
      words.add("male");
      words.add("female");
    }
    if (word === "ism" || word.startsWith("nom") || word.startsWith("name")) {
      words.add("name");
    }
    if (word === "id" || word.startsWith("ident")) {
      words.add("id");
    }
    if (word.startsWith("filtr") || word.startsWith("filter")) {
      words.add("filter");
      words.add("search");
      words.add("select");
    }
  }

  return Array.from(words).filter((word) => !stopWords.has(word));
}

function getOpenAiClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function errorSummary(provider: Provider, error: unknown) {
  if (error instanceof Error) {
    return `${provider}: ${error.message.slice(0, 180)}`;
  }

  return `${provider}: request failed`;
}

function clearAiProviderError() {
  lastAiProviderError = null;
  lastAiProviderErrorFor = null;
}

function rememberAiProviderError(provider: Provider, message: string) {
  lastAiProviderError = message;
  lastAiProviderErrorFor = provider;
}

async function responseErrorSummary(provider: string, response: Response) {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: string | { status?: string; type?: string; code?: string; message?: string } };
    const rawError = parsed.error;
    const errorObject = rawError && typeof rawError === "object" ? rawError : null;
    const status = errorObject?.status || errorObject?.type || errorObject?.code || response.statusText || "HTTP error";
    const message = typeof rawError === "string" ? ` - ${rawError}` : errorObject?.message ? ` - ${errorObject.message}` : "";
    return `${provider}: ${response.status} ${status}${message}`.slice(0, 240);
  } catch {
    return `${provider}: ${response.status} ${response.statusText || "HTTP error"}`.slice(0, 240);
  }
}

function resolveProvider(): Provider {
  const requested = (process.env.AI_PROVIDER || "auto").toLowerCase();
  const lmStudioBaseUrl = (process.env.LMSTUDIO_BASE_URL || process.env.LM_STUDIO_BASE_URL || "").trim();
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  const groqKey = (process.env.GROQ_API_KEY || "").trim();
  const deepseekKey = (process.env.DEEPSEEK_API_KEY || "").trim();
  const openAiKey = (process.env.OPENAI_API_KEY || "").trim();
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  const mistralKey = (process.env.MISTRAL_API_KEY || "").trim();
  const xaiKey = (process.env.XAI_API_KEY || "").trim();
  const cohereKey = (process.env.COHERE_API_KEY || "").trim();
  const perplexityKey = (process.env.PERPLEXITY_API_KEY || "").trim();
  const openRouterKey = (process.env.OPENROUTER_API_KEY || "").trim();

  if (requested === "rules" || requested === "none") return "rules";
  if ((requested === "lmstudio" || requested === "lm-studio") && lmStudioBaseUrl) return "lmstudio";
  if (requested === "groq" && groqKey) return "groq";
  if (requested === "deepseek" && deepseekKey) return "deepseek";
  if ((requested === "anthropic" || requested === "claude") && anthropicKey) return "anthropic";
  if (requested === "gemini" && geminiKey) return "gemini";
  if (requested === "openai" && openAiKey) return "openai";
  if (requested === "mistral" && mistralKey) return "mistral";
  if ((requested === "xai" || requested === "grok") && xaiKey) return "xai";
  if (requested === "cohere" && cohereKey) return "cohere";
  if (requested === "perplexity" && perplexityKey) return "perplexity";
  if ((requested === "openrouter" || requested === "open-router") && openRouterKey) return "openrouter";

  if (requested === "auto") {
    if (lmStudioBaseUrl) return "lmstudio";
    if (groqKey) return "groq";
    if (deepseekKey) return "deepseek";
    if (geminiKey) return "gemini";
    if (openAiKey) return "openai";
    if (anthropicKey) return "anthropic";
    if (mistralKey) return "mistral";
    if (xaiKey) return "xai";
    if (cohereKey) return "cohere";
    if (perplexityKey) return "perplexity";
    if (openRouterKey) return "openrouter";
  }

  return "rules";
}

export function setRuntimeAiProvider(provider: string) {
  const normalized = provider.toLowerCase();
  if (
    ![
      "auto",
      "lmstudio",
      "lm-studio",
      "groq",
      "deepseek",
      "gemini",
      "openai",
      "anthropic",
      "mistral",
      "xai",
      "grok",
      "cohere",
      "perplexity",
      "openrouter",
      "open-router",
      "rules"
    ].includes(normalized)
  ) {
    return false;
  }

  process.env.AI_PROVIDER =
    normalized === "lm-studio"
      ? "lmstudio"
      : normalized === "grok"
        ? "xai"
        : normalized === "open-router"
          ? "openrouter"
          : normalized;
  clearAiProviderError();
  lastGeminiModel = null;
  lastGroqModel = null;
  lastLmStudioModel = null;
  return true;
}

function lmStudioBaseUrl() {
  return (process.env.LMSTUDIO_BASE_URL || process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1").replace(
    /\/+$/g,
    ""
  );
}

function lmStudioHeaders(key: string) {
  return {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {})
  };
}

async function getLmStudioModel(baseUrl: string, key: string) {
  const configured = (process.env.LMSTUDIO_MODEL || process.env.LM_STUDIO_MODEL || "").trim();
  if (configured) return configured;

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: lmStudioHeaders(key),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return "local-model";
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    return payload.data?.find((model) => model.id)?.id || "local-model";
  } catch {
    return "local-model";
  }
}

function getGroqModels() {
  const configured = (process.env.GROQ_MODELS || process.env.GROQ_MODEL || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const models = configured.length
    ? configured
    : ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

  for (const fallback of ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]) {
    if (!models.includes(fallback)) {
      models.push(fallback);
    }
  }

  return models;
}

function getGeminiModels() {
  const configured = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const models = configured.length ? configured : ["gemini-2.5-flash", "gemini-2.0-flash"];

  for (const fallback of ["gemini-2.5-flash", "gemini-2.0-flash"]) {
    if (!models.includes(fallback)) {
      models.push(fallback);
    }
  }

  return models;
}

function normalizePageLanguage(language?: string): AnswerLanguage | null {
  const normalized = (language || "").toLowerCase();
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("uz")) return "uz";
  return null;
}

function detectAnswerLanguage(question: string, pageLanguage?: string): AnswerLanguage {
  const normalizedQuestion = question.toLowerCase();
  if (/[а-яё]/i.test(question)) return "ru";
  if (/[ʻʼ‘’`]|o'|g'|\b(qayerda|qayer|qaerda|qaer|qanday|qanaqa|nima|kim|salom|rahmat|iltimos|kerak|tugma|bo'lim|bolim|yarat|yaratil|qo'sh|qosh|ko'rsat|korsat|menga|senga|sen|men|bormi|qil|shuni|qani)\b/i.test(normalizedQuestion)) {
    return "uz";
  }
  if (/\b(how|where|what|which|who|create|button|filter|search|show|open|help|hello|thanks)\b/i.test(normalizedQuestion)) {
    return "en";
  }

  return normalizePageLanguage(pageLanguage) ?? "uz";
}

function localized(language: AnswerLanguage, values: Record<AnswerLanguage, string>) {
  return values[language] ?? values.uz;
}

function envApiKey(provider: Provider) {
  return provider === "lmstudio"
    ? process.env.LMSTUDIO_API_KEY || process.env.LM_STUDIO_API_KEY || ""
    : provider === "openai"
      ? process.env.OPENAI_API_KEY || ""
      : provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY || ""
        : provider === "gemini"
          ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
          : provider === "groq"
            ? process.env.GROQ_API_KEY || ""
            : provider === "deepseek"
              ? process.env.DEEPSEEK_API_KEY || ""
              : provider === "mistral"
                ? process.env.MISTRAL_API_KEY || ""
                : provider === "xai"
                  ? process.env.XAI_API_KEY || ""
                  : provider === "cohere"
                    ? process.env.COHERE_API_KEY || ""
                    : provider === "perplexity"
                      ? process.env.PERPLEXITY_API_KEY || ""
                      : provider === "openrouter"
                        ? process.env.OPENROUTER_API_KEY || ""
                        : "";
}

function defaultProviderModel(active: Provider) {
  const definition = getAiProviderDefinition(active);

  return active === "lmstudio"
    ? lastLmStudioModel
      ? `${lastLmStudioModel} active`
      : process.env.LMSTUDIO_MODEL || process.env.LM_STUDIO_MODEL || "auto-detect"
    : active === "groq"
      ? lastGroqModel
        ? `${lastGroqModel} active`
        : getGroqModels().join(" -> ")
      : active === "gemini"
        ? lastGeminiModel
          ? `${lastGeminiModel} active`
          : getGeminiModels().join(" -> ")
        : active === "openai"
          ? process.env.OPENAI_MODEL || definition?.defaultModel || "gpt-4o-mini"
          : active === "anthropic"
            ? process.env.ANTHROPIC_MODEL || definition?.defaultModel || "claude-sonnet-4-20250514"
            : active === "deepseek"
              ? process.env.DEEPSEEK_MODEL || definition?.defaultModel || "deepseek-chat"
              : active === "mistral"
                ? process.env.MISTRAL_MODEL || definition?.defaultModel || "mistral-small-latest"
                : active === "xai"
                  ? process.env.XAI_MODEL || definition?.defaultModel || "grok-3-mini"
                  : active === "cohere"
                    ? process.env.COHERE_MODEL || definition?.defaultModel || "command-a-03-2025"
                    : active === "perplexity"
                      ? process.env.PERPLEXITY_MODEL || definition?.defaultModel || "sonar"
                      : active === "openrouter"
                        ? process.env.OPENROUTER_MODEL || definition?.defaultModel || "openai/gpt-4o-mini"
                        : "rules";
}

async function resolveRuntimeProvider(projectPublicId?: string): Promise<RuntimeAiProvider> {
  const projectProvider = await getProjectAiRuntimeProvider(projectPublicId);

  if (projectProvider) {
    return {
      provider: projectProvider.provider,
      requested: projectProvider.provider,
      configured: true,
      model: projectProvider.model,
      apiKey: projectProvider.apiKey,
      baseUrl: projectProvider.baseUrl,
      source: "project"
    };
  }

  const active = resolveProvider();
  const requested = (process.env.AI_PROVIDER || "auto").toLowerCase();

  if (active === "rules") {
    return {
      provider: "rules",
      requested,
      configured: false,
      model: "rules",
      source: "rules"
    };
  }

  return {
    provider: active,
    requested,
    configured: true,
    model: defaultProviderModel(active),
    apiKey: envApiKey(active).trim() || undefined,
    baseUrl: getAiProviderDefinition(active)?.baseUrl,
    source: "env"
  };
}

export function getAiProviderStatus(): AiProviderStatus {
  const active = resolveProvider();
  const requested = (process.env.AI_PROVIDER || "auto").toLowerCase();
  const model = defaultProviderModel(active);

  return {
    requested,
    active,
    configured: active !== "rules",
    model,
    lastError: lastAiProviderErrorFor === active ? lastAiProviderError : null
  };
}

export async function getProjectAiProviderStatus(projectPublicId?: string): Promise<AiProviderStatus> {
  const runtimeProvider = await resolveRuntimeProvider(projectPublicId);

  return {
    requested: runtimeProvider.requested,
    active: runtimeProvider.provider,
    configured: runtimeProvider.configured,
    model: runtimeProvider.model,
    lastError: lastAiProviderErrorFor === runtimeProvider.provider ? lastAiProviderError : null
  };
}

function systemPrompt() {
  return [
    "You are Smartup SFA, a general AI assistant inside a website first, and a UI guide only when the user needs direction on the page.",
    "Decide whether the best response is a conversational answer or a visual guidance step.",
    "Most knowledgeDocuments are in Russian. First internally translate the user's question to Russian, use that Russian meaning for document reasoning, then answer in answerLanguage.",
    "Always answer in answerLanguage from the payload. If userLanguage and pageLanguage conflict, userLanguage wins.",
    "Use knowledgeDocuments as product manuals, page explanations, terminology, and workflow rules.",
    "The visible page metadata is the source of truth for what is currently on screen. If documents conflict with the visible page metadata, trust the page metadata.",
    "Do not use hardcoded project keys, saved guide names, or hidden assumptions. Use only the current payload.",
    "If the answer cannot be supported by visible DOM or knowledgeDocuments, say that you do not know.",
    "For general questions, explanations, greetings, or questions that do not require pointing to the page, return an answer.",
    "For navigation, where-is, how-to-click, filtering, form, or workflow questions, return a guide step.",
    "You are responsible for selecting the target ref from pageElements. Do not rely on saved guide flows.",
    "Do not invent UI elements from documents. Documents explain meaning; visible page metadata decides the exact target.",
    "Do not choose a generic Create/Add button when the requested object is not visible in that element label, nearby text, or current page context. For example, on an Orders page, a Create button is not correct for creating users or settlement accounts.",
    "If knowledgeDocuments describe a menu path for the requested task and the first menu item is visible in pageElements, return a guide to that first visible menu item and include the full path in the step message.",
    "Use only refs that appear exactly in pageElements[].ref. Never rewrite, shorten, or create a ref.",
    "Compare the user's words with each element's label, text, role, and tagName. Handle Uzbek, Russian, and English wording.",
    "For document answers, think step-by-step silently, use the most relevant Russian document, and return a concise practical answer. Do not mention internal translation.",
    "For questions about a specific filter field such as Role, Name, User ID, or Gender, prefer that field's input/select over a general search box, table header, or filter panel.",
    "For table lookup questions, prefer the row or cell containing the requested visible text.",
    "Return only the next safe step. In mode next, use completedSteps to avoid repeating an already completed target.",
    "The steps array must contain exactly one step. Never return multiple steps, never return the same target twice, and never repeat a completed target.",
    "Never ask the widget to click or fill anything automatically. The user performs every action.",
    "For buttons and links use waitFor click. For inputs, textareas, and selects use waitFor focus.",
    "Return JSON only.",
    "For an answer use: {\"type\":\"answer\",\"message\":\"short helpful answer\"}.",
    "For a guide use: {\"type\":\"guide\",\"slug\":\"ai-runtime-guide\",\"title\":\"...\",\"intent\":\"...\",\"aliases\":[],\"urlPattern\":\"/path\",\"steps\":[{\"target\":\"e1\",\"message\":\"short instruction\",\"robotState\":\"pointing\",\"placement\":\"auto\",\"waitFor\":\"click\"}]}",
    "Return {\"type\":\"answer\",\"message\":\"Done. I do not see another safe step on this screen.\"} when the task appears complete or there is no safe visible target."
  ].join(" ");
}

function scoreDocumentForQuestion(document: PublicKnowledgeDocument, words: string[], normalizedQuestion: string) {
  if (!words.length) return 0;
  const title = normalizeForMatch(document.title);
  const tags = normalizeForMatch(document.tags.join(" "));
  const content = normalizeForMatch(document.content.slice(0, 16000));
  const strongWords = words.filter((word) => !genericTargetWords.has(word) && !isCreateConcept(word) && !isSettingsConcept(word));
  const wantsCreation = words.some(isCreateConcept);
  const asksUser = /\b(user|foydalanuv|polzovatel)\w*/i.test(normalizedQuestion);
  const asksAccount = /\b(account|rasch|raschot|rashot|rashotniy|schet|schyot|shot|hisob)\w*/i.test(normalizedQuestion);
  let score = 0;

  if (normalizedQuestion.length > 8 && content.includes(normalizedQuestion.slice(0, 80))) {
    score += 20;
  }

  for (const word of words) {
    if (title.includes(word)) score += strongWords.includes(word) ? 28 : 10;
    if (tags.includes(word)) score += 7;
    if (content.includes(word)) score += 2;
  }

  if (strongWords.length && !strongWords.some((word) => title.includes(word) || tags.includes(word))) {
    score -= 18;
  }

  if (wantsCreation && strongWords.some((word) => title.includes(word))) {
    if (/\b(create|new|add)\b/.test(title)) {
      score += 32;
    } else {
      score -= 8;
    }
  }

  if (asksUser) {
    score += title.includes("user") ? 70 : -30;
  }

  if (asksAccount) {
    score += title.includes("account") ? 70 : -30;
  }

  return score;
}

function selectRelevantDocuments(params: ChooseGuideParams, limit = maxAiDocuments) {
  const enabledDocuments = params.documents.filter((document) => document.enabled !== false);
  const question = normalizeForMatch(params.question);
  const words = expandQueryWords(question).filter((word) => !genericTargetWords.has(word));
  if (!words.length) return [];

  return enabledDocuments
    .map((document) => ({ document, score: scoreDocumentForQuestion(document, words, question) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.document);
}

function documentAnswerExcerpt(document: PublicKnowledgeDocument, language: AnswerLanguage = "ru") {
  const lines = document.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length < 3) return false;
      const lower = line.toLowerCase();
      if (lower.startsWith("source url:") || lower.startsWith("title:") || lower.startsWith("summary:")) return false;
      if (/^\+?\d[\d\s()+-]{7,}$/.test(line)) return false;
      return true;
    });
  const excerpt = lines.join(" ").replace(/\s+/g, " ").slice(0, 650).trim();
  const answer = excerpt ? `${document.title}: ${excerpt}` : document.title;
  if (language === "ru") return answer;
  return localized(language, {
    uz: `Hujjatdagi mos ma'lumot: ${answer}`,
    ru: answer,
    en: `Relevant document note: ${answer}`
  });
}

const quotedLabelPattern = /[\u00ab"]\s*([^\u00bb"]+?)\s*[\u00bb"]/g;
const menuPathTriggerPattern =
  /[\u2192\u203a>]|\u043f\u0435\u0440\u0435\u0439\u0434|\u0432\u044b\u0431\u0435\u0440|\u043d\u0430\u0439\u0434|\u043e\u0442\u043a\u0440\u043e\u0439|\u043d\u0430\u0436\u043c|\u043c\u0435\u043d\u044e|\u0440\u0430\u0437\u0434\u0435\u043b|\u0432\u043a\u043b\u0430\u0434\u043a|\u043f\u0443\u0442\u044c/i;
const arrowPathPattern = /\s*(?:\u2192|\u203a|->|>)\s*/;
const stepLinePattern = /^\s*(?:\u0448\u0430\u0433|step)\s+\d+/i;

function compactMatchText(value: string) {
  return normalizeForMatch(value)
    .replace(/[^\p{L}\p{N}' ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMenuPart(value: string) {
  const firstQuote = Array.from(value.matchAll(quotedLabelPattern))[0]?.[1];
  let part = (firstQuote || value)
    .replace(/^[^:]{0,90}:\s*/, "")
    .replace(/[\u00ab\u00bb"]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\d.)\s-]+/, "")
    .replace(/[.;:,]+$/g, "")
    .trim();

  if (!part || stepLinePattern.test(part) || part.length > 70) {
    return "";
  }

  return part;
}

function extractQuotedLabels(line: string) {
  return Array.from(line.matchAll(quotedLabelPattern))
    .map((match) => cleanMenuPart(match[1]))
    .filter(Boolean);
}

function extractDocumentMenuPaths(document: PublicKnowledgeDocument) {
  const paths: Array<{ parts: string[]; line: string }> = [];
  const sequentialParts: string[] = [];

  for (const line of document.content
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 5)) {
    if (!menuPathTriggerPattern.test(line)) {
      sequentialParts.length = 0;
      continue;
    }

    const quoted = extractQuotedLabels(line);
    const buttonInstruction = /\u043a\u043d\u043e\u043f\u043a/i.test(line);

    if (quoted.length === 1 && !buttonInstruction) {
      sequentialParts.push(quoted[0]);

      if (sequentialParts.length >= 2) {
        paths.push({ parts: [...sequentialParts], line });
      }
    } else {
      sequentialParts.length = 0;
    }

    if (quoted.length >= 2) {
      paths.push({ parts: quoted, line });
    }

    if (/[\u2192\u203a>]/.test(line)) {
      const arrowParts = line
        .split(arrowPathPattern)
        .map(cleanMenuPart)
        .filter(Boolean);

      if (arrowParts.length >= 2) {
        paths.push({ parts: arrowParts, line });
      }
    }
  }

  return paths
    .filter((path) => path.parts.length >= 2 && !stepLinePattern.test(path.parts[0]))
    .slice(0, 8);
}

function findVisibleMenuTarget(path: string[], elements: PageElementMetadata[]) {
  const candidates = elements.filter((item) => {
    const tagName = item.tagName.toLowerCase();
    const role = (item.role ?? "").toLowerCase();
    const text = `${item.label ?? ""} ${item.text ?? ""}`.trim();
    return Boolean(text) && (["a", "button", "li", "span", "div"].includes(tagName) || ["link", "button", "menuitem", "tab"].includes(role));
  });

  for (const part of path) {
    const targetText = compactMatchText(part);
    if (!targetText) continue;

    const best = candidates
      .map((item) => {
        const label = compactMatchText(`${item.label ?? ""} ${item.text ?? ""}`);
        const words = targetText.split(/\s+/).filter(Boolean);
        const score =
          label === targetText
            ? 30
            : label.includes(targetText)
              ? 20
              : words.length > 1 && words.every((word) => label.includes(word))
                ? 12
                : 0;
        return { item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0];

    if (best) {
      return { item: best.item, visiblePart: part };
    }
  }

  return null;
}

function documentMenuGuide(params: ChooseGuideParams, specificWords: string[], elements: PageElementMetadata[]): GeneratedDecision | null {
  const matchingDocument = selectRelevantDocuments(params, 1)[0] ?? params.documents.find((document) => {
    const haystack = normalizeForMatch(`${document.title} ${document.tags.join(" ")} ${document.content}`);
    return specificWords.some((word) => haystack.includes(word));
  });

  if (!matchingDocument) {
    return null;
  }

  for (const path of extractDocumentMenuPaths(matchingDocument)) {
    const target = findVisibleMenuTarget(path.parts, elements);
    if (!target) continue;

    const pathText = path.parts.join(" -> ");
    return {
      answer: null,
      guide: {
        slug: "ai-document-menu-guide",
        title: matchingDocument.title.slice(0, 80),
        intent: params.question,
        aliases: [],
        urlPattern: params.path || null,
        steps: [
          {
            target: target.item.selector,
            message: `Hujjatdagi yo'l: ${pathText}. Avval "${target.visiblePart}" menyusini oching.`,
            robotState: "pointing",
            placement: "auto",
            waitFor: "click"
          }
        ]
      }
    };
  }

  return null;
}

function isUnsafeGenericCreateStep(params: ChooseGuideParams, step: GuideStep) {
  const target = params.metadata.find((item) => item.selector === step.target);
  if (!target) return false;

  const questionWords = expandQueryWords(params.question).filter((word) => !genericTargetWords.has(word));
  const entityWords = questionWords.filter((word) => !isCreateConcept(word) && !isSettingsConcept(word));
  if (!entityWords.length) return false;

  const targetText = compactMatchText(`${target.label ?? ""} ${target.text ?? ""} ${target.role ?? ""} ${target.tagName}`);
  const createMatch = Array.from(createWords).some((word) => targetText.includes(word));
  if (!createMatch) return false;

  const pageText = compactMatchText(
    params.metadata.map((item) => `${item.label ?? ""} ${item.text ?? ""} ${item.role ?? ""} ${item.tagName}`).join(" ")
  );

  return !entityWords.some((word) => targetText.includes(word) || pageText.includes(word));
}

function isGenericCreateTargetForDifferentEntity(specificWords: string[], target: PageElementMetadata) {
  const entityWords = specificWords.filter(
    (word) => !genericTargetWords.has(word) && !isCreateConcept(word) && !isSettingsConcept(word)
  );

  if (!entityWords.length) return false;

  const targetText = compactMatchText(`${target.label ?? ""} ${target.text ?? ""} ${target.role ?? ""} ${target.tagName}`);
  const createMatch = Array.from(createWords).some((word) => targetText.includes(word));
  if (!createMatch) return false;

  return !entityWords.some((word) => targetText.includes(word));
}

function targetContainsUnaskedEntity(specificWords: string[], target: PageElementMetadata) {
  const targetText = compactMatchText(`${target.label ?? ""} ${target.text ?? ""} ${target.role ?? ""} ${target.tagName}`);
  const importantWords = [
    "order",
    "user",
    "account",
    "organization",
    "warehouse",
    "product",
    "role",
    "payment",
    "purchase",
    "report",
    "finance",
    "reference"
  ];

  return importantWords.some((word) => targetText.includes(word) && !specificWords.includes(word));
}

function metadataRef(item: PageElementMetadata, index: number) {
  return item.ref || `e${index + 1}`;
}

function metadataPayloadScore(item: PageElementMetadata, words: string[]) {
  const label = normalizeForMatch(item.label ?? "");
  const text = normalizeForMatch(item.text ?? "");
  const role = normalizeForMatch(item.role ?? "");
  const tagName = item.tagName.toLowerCase();
  const rawSelector = item.selector.toLowerCase();
  const selector = normalizeForMatch(item.selector);
  const haystack = `${label} ${text} ${role} ${tagName} ${selector}`;
  const queryScore = words.reduce((score, word) => {
    if (label.includes(word)) return score + 22;
    if (text.includes(word)) return score + 12;
    if (selector.includes(word)) return score + 5;
    if (haystack.includes(word)) return score + 3;
    return score;
  }, 0);
  const interactiveScore =
    ["button", "a", "input", "textarea", "select"].includes(tagName) ||
    ["button", "link", "menuitem", "tab", "textbox", "combobox"].includes(role)
      ? 10
      : 0;
  const headingScore = /^h[1-4]$/.test(tagName) ? 7 : 0;
  const guideScore = rawSelector.includes("[data-guide=") ? 16 : 0;
  const menuScore = ["menuitem", "tab", "navigation"].includes(role) ? 7 : 0;
  const tablePenalty = ["td", "tr"].includes(tagName) && queryScore === 0 ? 14 : 0;

  return queryScore + interactiveScore + headingScore + guideScore + menuScore - tablePenalty;
}

function summarizeMetadata(metadata: PageElementMetadata[], limits: PayloadLimits = {}, question = "") {
  const metadataLimit = limits.metadataLimit ?? 90;
  const labelChars = limits.metadataLabelChars ?? 64;
  const textChars = limits.metadataTextChars ?? 110;
  const words = expandQueryWords(question).filter((word) => !genericTargetWords.has(word)).slice(0, 24);

  return metadata
    .map((item, index) => ({ item, index, score: metadataPayloadScore(item, words) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, metadataLimit)
    .map(({ item, index }) => ({
      ref: metadataRef(item, index),
      role: item.role,
      label: item.label?.slice(0, labelChars),
      text: item.text?.slice(0, textChars),
      tagName: item.tagName
    }));
}

function metadataTargetRef(metadata: PageElementMetadata[], selector: string) {
  const index = metadata.findIndex((item) => item.selector === selector);
  return index >= 0 ? metadataRef(metadata[index], index) : "completed";
}

function buildPayload(params: ChooseGuideParams, limits: PayloadLimits = {}) {
  const answerLanguage = detectAnswerLanguage(params.question, params.pageLanguage);
  const documentLimit = limits.documentLimit ?? maxAiDocuments;
  const documentChars = limits.documentChars ?? maxAiDocumentChars;
  const knowledgeDocuments = selectRelevantDocuments(params, documentLimit).map((document) => ({
    title: document.title,
    tags: document.tags,
    content: document.content.slice(0, documentChars)
  }));

  return {
    mode: params.mode ?? "start",
    question: params.question,
    pageLanguage: normalizePageLanguage(params.pageLanguage) ?? "unknown",
    userLanguage: answerLanguage,
    answerLanguage,
    russianSearchTerms: expandQueryWords(params.question).slice(0, 28),
    path: params.path,
    completedSteps: (params.completedSteps ?? []).map((step) => ({
      target: metadataTargetRef(params.metadata, step.target),
      message: step.message,
      waitFor: step.waitFor
    })), 
    knowledgeDocuments,
    pageElements: summarizeMetadata(params.metadata, limits, params.question)
  };
}

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return null;
    }
  }
}

function allowedTargetMap(metadata: PageElementMetadata[]) {
  const targets = new Map<string, string>();

  metadata.forEach((item, index) => {
    targets.set(item.selector, item.selector);
    targets.set(metadataRef(item, index), item.selector);
  });

  return targets;
}

function normalizeStep(value: unknown, allowedTargets: Map<string, string>): GuideStep | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.target !== "string") return null;
  const target = allowedTargets.get(raw.target.trim());
  if (!target) return null;
  if (typeof raw.message !== "string" || !raw.message.trim()) return null;

  return {
    target,
    message: raw.message.slice(0, 180),
    robotState:
      typeof raw.robotState === "string" && robotStates.has(raw.robotState)
        ? (raw.robotState as GuideStep["robotState"])
        : "pointing",
    placement:
      typeof raw.placement === "string" && placements.has(raw.placement)
        ? (raw.placement as GuideStep["placement"])
        : "auto",
    waitFor:
      typeof raw.waitFor === "string" && waitModes.has(raw.waitFor)
        ? (raw.waitFor as GuideStep["waitFor"])
        : "click"
  };
}

function normalizeAiSteps(params: ChooseGuideParams, steps: GuideStep[]) {
  const completedTargets = new Set((params.completedSteps ?? []).map((step) => step.target));
  const seenTargets = new Set<string>();
  const safeSteps: GuideStep[] = [];

  for (const step of steps) {
    if (params.mode === "next" && completedTargets.has(step.target)) {
      continue;
    }

    if (seenTargets.has(step.target) || isUnsafeGenericCreateStep(params, step)) {
      continue;
    }

    seenTargets.add(step.target);
    safeSteps.push(step);
  }

  return safeSteps.slice(0, 1);
}

function normalizeGeneratedDecision(content: string, params: ChooseGuideParams): GeneratedDecision | null {
  const parsed = parseJsonObject(content);
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;

  if (raw.type === "answer" && typeof raw.message === "string" && raw.message.trim()) {
    return { guide: null, answer: raw.message.trim().slice(0, 500) };
  }

  const allowedTargets = allowedTargetMap(params.metadata);
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((step) => normalizeStep(step, allowedTargets)).filter((step): step is GuideStep => Boolean(step))
    : [];

  if (!steps.length) {
    return null;
  }

  const safeSteps = normalizeAiSteps(params, steps);

  if (!safeSteps.length) {
    return null;
  }

  return {
    answer: null,
    guide: {
      slug: "ai-runtime-guide",
      title: typeof raw.title === "string" ? raw.title.slice(0, 80) : "AI generated guide",
      intent: typeof raw.intent === "string" ? raw.intent.slice(0, 180) : params.question,
      aliases: [],
      urlPattern: params.path || null,
      steps: safeSteps
    }
  };
}

async function generateWithOpenAi(params: ChooseGuideParams) {
  const openai = getOpenAiClient();
  if (!openai) return null;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: JSON.stringify(buildPayload(params)) }
    ]
  });

  const content = response.choices[0]?.message.content;
  clearAiProviderError();
  return content ? normalizeGeneratedDecision(content, params) : null;
}

async function generateWithDeepSeek(params: ChooseGuideParams) {
  const key = (process.env.DEEPSEEK_API_KEY || "").trim();
  if (!key) return null;

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/g, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: JSON.stringify(buildPayload(params)) }
      ]
    })
  });

  if (!response.ok) {
    rememberAiProviderError("deepseek", await responseErrorSummary("deepseek", response));
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  const decision = content ? normalizeGeneratedDecision(content, params) : null;

  if (decision?.guide || decision?.answer) {
    clearAiProviderError();
    return decision;
  }

  rememberAiProviderError("deepseek", "deepseek: empty or unsafe response");
  return null;
}

async function generateWithLmStudio(params: ChooseGuideParams, runtimeProvider?: RuntimeAiProvider) {
  const key = (runtimeProvider?.apiKey || process.env.LMSTUDIO_API_KEY || process.env.LM_STUDIO_API_KEY || "").trim();
  const baseUrl = (runtimeProvider?.baseUrl || lmStudioBaseUrl()).replace(/\/+$/g, "");
  const model = runtimeProvider?.model || (await getLmStudioModel(baseUrl, key));
  const promptPayload = JSON.stringify(buildPayload(params, groqPayloadLimits));
  const baseBody = {
    model,
    temperature: 0.1,
    max_tokens: 700,
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: promptPayload }
    ]
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: lmStudioHeaders(key),
    body: JSON.stringify(baseBody),
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    rememberAiProviderError("lmstudio", await responseErrorSummary("lmstudio", response));
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  const decision = content ? normalizeGeneratedDecision(content, params) : null;

  if (decision?.guide || decision?.answer) {
    clearAiProviderError();
    lastLmStudioModel = model;
    return decision;
  }

  rememberAiProviderError("lmstudio", "lmstudio: empty or unsafe response");
  return null;
}

async function generateWithGroq(params: ChooseGuideParams) {
  const key = (process.env.GROQ_API_KEY || "").trim();
  if (!key) return null;

  const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/g, "");
  const promptPayload = JSON.stringify(buildPayload(params, groqPayloadLimits));
  const errors: string[] = [];

  for (const model of getGroqModels()) {
    const baseBody = {
      model,
      temperature: 0.1,
      max_tokens: 650,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: promptPayload }
      ]
    };

    let response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        ...baseBody,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok && response.status === 400) {
      const errorText = await response.clone().text().catch(() => "");
      if (/response_format|json_object/i.test(errorText)) {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify(baseBody)
        });
      }
    }

    if (!response.ok) {
      errors.push(await responseErrorSummary(`groq ${model}`, response));
      continue;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    const decision = content ? normalizeGeneratedDecision(content, params) : null;

    if (decision?.guide || decision?.answer) {
      clearAiProviderError();
      lastGroqModel = model;
      return decision;
    }

    errors.push(`groq ${model}: empty or unsafe response`);
  }

  lastGroqModel = null;
  rememberAiProviderError("groq", errors.join(" | ").slice(0, 500) || "groq: no response");
  return null;
}

async function generateWithGemini(params: ChooseGuideParams, runtimeProvider?: RuntimeAiProvider) {
  const key = (runtimeProvider?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) return null;

  const errors: string[] = [];

  for (const model of runtimeProvider?.model ? [runtimeProvider.model] : getGeminiModels()) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt() }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(buildPayload(params)) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
        })
      }
    );

    if (!response.ok) {
      errors.push(await responseErrorSummary(`gemini ${model}`, response));
      continue;
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    const decision = content ? normalizeGeneratedDecision(content, params) : null;

    if (decision?.guide || decision?.answer) {
      clearAiProviderError();
      lastGeminiModel = model;
      return decision;
    }

    errors.push(`gemini ${model}: empty or unsafe response`);
  }

  lastGeminiModel = null;
  rememberAiProviderError("gemini", errors.join(" | ").slice(0, 500) || "gemini: no response");
  return null;
}

async function generateWithAnthropic(params: ChooseGuideParams, runtimeProvider?: RuntimeAiProvider) {
  const key = runtimeProvider?.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const baseUrl = (runtimeProvider?.baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/g, "");
  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01"
    },
    body: JSON.stringify({
      model: runtimeProvider?.model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 800,
      temperature: 0.1,
      system: systemPrompt(),
      messages: [{ role: "user", content: JSON.stringify(buildPayload(params)) }]
    })
  });

  if (!response.ok) {
    rememberAiProviderError("anthropic", await responseErrorSummary("anthropic", response));
    return null;
  }

  const payload = (await response.json()) as { content?: Array<{ text?: string }> };
  const content = payload.content?.map((part) => part.text ?? "").join("");
  clearAiProviderError();
  return content ? normalizeGeneratedDecision(content, params) : null;
}

function runtimeSource(provider: Provider): AiSource {
  return provider === "rules" ? "rules-fallback" : provider;
}

function chatCompletionEndpoint(provider: Provider, baseUrl?: string) {
  const fallback = provider === "lmstudio" ? lmStudioBaseUrl() : getAiProviderDefinition(provider)?.baseUrl;
  const normalizedBaseUrl = (baseUrl || fallback || "").replace(/\/+$/g, "");

  if (provider === "perplexity") {
    return normalizedBaseUrl.endsWith("/sonar") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1/sonar`;
  }

  return `${normalizedBaseUrl}/chat/completions`;
}

async function generateWithOpenAiCompatible(params: ChooseGuideParams, runtimeProvider: RuntimeAiProvider) {
  const key = (runtimeProvider.apiKey || envApiKey(runtimeProvider.provider)).trim();
  if (!key) return null;

  const endpoint = chatCompletionEndpoint(runtimeProvider.provider, runtimeProvider.baseUrl);
  const promptPayload = JSON.stringify(buildPayload(params, groqPayloadLimits));
  const baseBody = {
    model: runtimeProvider.model,
    temperature: 0.1,
    max_tokens: runtimeProvider.provider === "perplexity" ? 700 : 900,
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: promptPayload }
    ]
  };

  const request = (body: Record<string, unknown>) =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body)
    });

  let response = await request({
    ...baseBody,
    response_format: { type: "json_object" }
  });

  if (!response.ok && [400, 422].includes(response.status)) {
    const errorText = await response.clone().text().catch(() => "");
    if (/response_format|json_object|structured/i.test(errorText)) {
      response = await request(baseBody);
    }
  }

  if (!response.ok) {
    rememberAiProviderError(runtimeProvider.provider, await responseErrorSummary(runtimeProvider.provider, response));
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  const content = Array.isArray(rawContent) ? rawContent.map((item) => item.text ?? "").join("") : rawContent;
  const decision = content ? normalizeGeneratedDecision(content, params) : null;

  if (decision?.guide || decision?.answer) {
    clearAiProviderError();
    return decision;
  }

  rememberAiProviderError(runtimeProvider.provider, `${runtimeProvider.provider}: empty or unsafe response`);
  return null;
}

async function generateWithCohere(params: ChooseGuideParams, runtimeProvider: RuntimeAiProvider) {
  const key = (runtimeProvider.apiKey || process.env.COHERE_API_KEY || "").trim();
  if (!key) return null;

  const baseUrl = (runtimeProvider.baseUrl || "https://api.cohere.com/v2").replace(/\/+$/g, "");
  const response = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: runtimeProvider.model || process.env.COHERE_MODEL || "command-a-03-2025",
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: JSON.stringify(buildPayload(params, groqPayloadLimits)) }
      ]
    })
  });

  if (!response.ok) {
    rememberAiProviderError("cohere", await responseErrorSummary("cohere", response));
    return null;
  }

  const payload = (await response.json()) as {
    message?: { content?: Array<{ text?: string }> | string };
    text?: string;
  };
  const rawContent = payload.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent.map((part) => part.text ?? "").join("")
    : rawContent || payload.text || "";
  const decision = content ? normalizeGeneratedDecision(content, params) : null;

  if (decision?.guide || decision?.answer) {
    clearAiProviderError();
    return decision;
  }

  rememberAiProviderError("cohere", "cohere: empty or unsafe response");
  return null;
}

async function generateWithRuntimeProvider(params: ChooseGuideParams, runtimeProvider: RuntimeAiProvider) {
  if (runtimeProvider.provider === "rules") return null;
  if (runtimeProvider.provider === "lmstudio") return generateWithLmStudio(params, runtimeProvider);
  if (runtimeProvider.provider === "gemini") return generateWithGemini(params, runtimeProvider);
  if (runtimeProvider.provider === "anthropic") return generateWithAnthropic(params, runtimeProvider);
  if (runtimeProvider.provider === "cohere") return generateWithCohere(params, runtimeProvider);
  return generateWithOpenAiCompatible(params, runtimeProvider);
}

export async function chooseGuideWithAi(params: ChooseGuideParams): Promise<AiGuideDecision> {
  const runtimeProvider = await resolveRuntimeProvider(params.projectId);
  const provider = runtimeProvider.provider;

  try {
    if (runtimeProvider.source === "project") {
      const decision = await generateWithRuntimeProvider(params, runtimeProvider);
      if (decision?.guide || decision?.answer) return { ...decision, source: runtimeSource(provider) };
    }

    if (runtimeProvider.source !== "project") {
      if (provider === "lmstudio") {
        const decision = await generateWithLmStudio(params);
        if (decision?.guide || decision?.answer) return { ...decision, source: "lmstudio" };
      }

      if (provider === "groq") {
        const decision = await generateWithGroq(params);
        if (decision?.guide || decision?.answer) return { ...decision, source: "groq" };
      }

      if (provider === "deepseek") {
        const decision = await generateWithDeepSeek(params);
        if (decision?.guide || decision?.answer) return { ...decision, source: "deepseek" };
      }

      if (provider === "gemini") {
        const decision = await generateWithGemini(params);
        if (decision?.guide || decision?.answer) return { ...decision, source: "gemini" };
      }

      if (provider === "openai") {
        const decision = await generateWithOpenAi(params);
        if (decision?.guide || decision?.answer) return { ...decision, source: "openai" };
      }

      if (provider === "anthropic") {
        const decision = await generateWithAnthropic(params);
        if (decision?.guide || decision?.answer) return { ...decision, source: "anthropic" };
      }

      if (["mistral", "xai", "cohere", "perplexity", "openrouter"].includes(provider)) {
        const decision = await generateWithRuntimeProvider(params, runtimeProvider);
        if (decision?.guide || decision?.answer) return { ...decision, source: runtimeSource(provider) };
      }
    }
  } catch (error) {
    if (provider === "gemini") lastGeminiModel = null;
    if (provider === "lmstudio") lastLmStudioModel = null;
    rememberAiProviderError(provider, errorSummary(provider, error));
    const decision = fallbackDecision(params);
    return {
      ...decision,
      source: decision.guide || decision.answer ? "rules-fallback" : "none"
    };
  }

  const decision = fallbackDecision(params);
  return {
    ...decision,
    source: decision.guide || decision.answer ? "rules-fallback" : "none"
  };
}

function fallbackAnswer(params: ChooseGuideParams, specificWords: string[]) {
  const language = detectAnswerLanguage(params.question, params.pageLanguage);

  if (identityPattern.test(params.question)) {
    return localized(language, {
      uz: "Men Smartup SFA yordamchisiman. Savollarga javob beraman, sahifadagi kerakli joyni topib ko'rsataman va jarayonlarda keyingi qadamni aytib boraman.",
      ru: "Я помощник Smartup SFA. Отвечаю на вопросы, нахожу нужные элементы на странице и подсказываю следующие шаги.",
      en: "I am the Smartup SFA assistant. I answer questions, find the right place on the page, and guide you through the next steps."
    });
  }

  if (aiStatusPattern.test(params.question) && /lmstudio|lm studio|groq|deepseek|gemini|ai|provider|model/i.test(params.question)) {
    const status = getAiProviderStatus();
    if (status.lastError) {
      return localized(language, {
        uz: `${status.active} sozlangan, lekin API javobi xato qaytaryapti: ${status.lastError}. Provider sozlamasi yoki quota/billing holatini tekshirish kerak.`,
        ru: `${status.active} настроен, но API вернул ошибку: ${status.lastError}. Проверьте настройки provider, quota или billing.`,
        en: `${status.active} is configured, but the API returned an error: ${status.lastError}. Check provider settings, quota, or billing.`
      });
    }
    if (status.configured) {
      return localized(language, {
        uz: `${status.active} sozlangan va faol model: ${status.model}.`,
        ru: `${status.active} настроен. Активная модель: ${status.model}.`,
        en: `${status.active} is configured. Active model: ${status.model}.`
      });
    }
    return localized(language, {
      uz: `Hozir AI provider "${status.active}" rejimida. AI ishlashi uchun admin paneldan LM Studio, Groq, DeepSeek yoki Gemini provayderini tanlang.`,
      ru: `Сейчас AI provider в режиме "${status.active}". Чтобы AI работал, выберите LM Studio, Groq, DeepSeek или Gemini в админ-панели.`,
      en: `The AI provider is currently "${status.active}". To enable AI, choose LM Studio, Groq, DeepSeek, or Gemini in the admin panel.`
    });
  }

  const matchingDocument = selectRelevantDocuments(params, 1)[0] ?? params.documents.find((document) => {
    const haystack = normalizeForMatch(`${document.title} ${document.tags.join(" ")} ${document.content}`);
    return specificWords.some((word) => haystack.includes(word));
  });

  if (matchingDocument) {
    return documentAnswerExcerpt(matchingDocument, language);
  }

  return localized(language, {
    uz: "Buni aniq bilmayman. Ko'rinib turgan sahifadagi tugma yoki bo'lim nomini aytsangiz, uni topib ko'rsataman.",
    ru: "Я точно не знаю. Назовите кнопку или раздел, который виден на странице, и я покажу его.",
    en: "I do not know that for sure. Tell me the visible button or section name, and I will point it out."
  });
}

function fallbackStepMessage(params: ChooseGuideParams, target: PageElementMetadata, label: string) {
  const question = normalizeForMatch(params.question);
  const language = detectAnswerLanguage(params.question, params.pageLanguage);
  const isField = ["input", "textarea", "select"].includes(target.tagName);
  const isCommand = ["button", "a"].includes(target.tagName) || target.role === "button" || target.role === "link";

  if (
    isCommand &&
    (question.includes("zakaz") || question.includes("buyurt") || question.includes("order")) &&
    (question.includes("yarat") || question.includes("create") || question.includes("new") || question.includes("yangi"))
  ) {
    return localized(language, {
      uz: "Zakaz yaratish uchun shu tugmani bosing.",
      ru: "Чтобы создать заказ, нажмите эту кнопку.",
      en: "Click this button to create an order."
    });
  }

  if (isField) {
    return localized(language, {
      uz: `${label} maydonini to'ldiring yoki tanlang.`,
      ru: `Заполните или выберите поле ${label}.`,
      en: `Fill or select the ${label} field.`
    });
  }

  if (isCommand) {
    return localized(language, {
      uz: `"${label}" tugmasini bosing.`,
      ru: `Нажмите кнопку "${label}".`,
      en: `Click the "${label}" button.`
    });
  }

  return localized(language, {
    uz: `Mana shu joy: ${label}.`,
    ru: `Вот нужное место: ${label}.`,
    en: `Here is the place: ${label}.`
  });
}

function fallbackDecision(params: ChooseGuideParams): GeneratedDecision {
  const completedTargets = new Set((params.completedSteps ?? []).map((step) => step.target));
  const elements = params.metadata.filter((item) => !completedTargets.has(item.selector));
  const question = normalizeForMatch(params.question);
  const specificWords = expandQueryWords(question);
  const wantsGuide = guideIntentPattern.test(question);
  const createIntent = specificWords.some(isCreateConcept);
  const directTarget = elements
    .map((item) => {
      const haystack = normalizeForMatch(`${item.label ?? ""} ${item.text ?? ""} ${item.role ?? ""} ${item.tagName}`);
      const isField = ["input", "textarea", "select"].includes(item.tagName);
      const primaryWords = specificWords.filter((word) => !genericTargetWords.has(word));
      const primaryMatches = primaryWords.filter((word) => haystack.includes(word)).length;
      const entityWords = primaryWords.filter((word) => !isCreateConcept(word) && !isSettingsConcept(word));
      const entityMatches = entityWords.filter((word) => haystack.includes(word)).length;
      const genericMatches = specificWords.filter((word) => genericTargetWords.has(word) && haystack.includes(word)).length;
      const isCommand = ["button", "a"].includes(item.tagName) || item.role === "button" || item.role === "link";
      const createMatch = createIntent && Array.from(createWords).some((word) => haystack.includes(word));
      const settingsMatch = createIntent && Array.from(settingsWords).some((word) => haystack.includes(word));
      const genericCreateMismatch = createMatch && entityWords.length > 0 && entityMatches === 0;
      const score =
        primaryMatches * 14 +
        entityMatches * 12 +
        genericMatches * 4 +
        (primaryWords.length > 0 && primaryWords.every((word) => haystack.includes(word)) ? 10 : 0) +
        (isField ? 6 : 0) +
        (isCommand ? 4 : 0) +
        (createMatch && isCommand ? 22 : 0) -
        (genericCreateMismatch ? 100 : 0) -
        (settingsMatch ? 18 : 0) +
        (item.tagName === "tr" ? 3 : item.tagName === "td" ? 2 : 0);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)[0];

  const target = directTarget && directTarget.score >= 6 ? directTarget.item : null;
  const menuGuide = documentMenuGuide(params, specificWords, elements);
  const targetIsWrongGenericCreate = target ? isGenericCreateTargetForDifferentEntity(specificWords, target) : false;
  const targetHasUnaskedEntity = target ? targetContainsUnaskedEntity(specificWords, target) : false;

  if (menuGuide && (wantsGuide || targetIsWrongGenericCreate || targetHasUnaskedEntity)) {
    return menuGuide;
  }

  if (!target || (!wantsGuide && (!directTarget || directTarget.score < 12))) {
    if (menuGuide && (wantsGuide || !target)) {
      return menuGuide;
    }

    return {
      guide: null,
      answer: fallbackAnswer(params, specificWords)
    };
  }


  const isField = ["input", "textarea", "select"].includes(target.tagName);
  const isCommand = ["button", "a"].includes(target.tagName) || target.role === "button" || target.role === "link";
  const label = target.label || target.text || target.selector;
  const message = fallbackStepMessage(params, target, label);

  return {
    answer: null,
    guide: {
      slug: "ai-runtime-guide",
      title: "AI generated guide",
      intent: params.question,
      aliases: [],
      urlPattern: params.path || null,
      steps: [
        {
          target: target.selector,
          message,
          robotState: "pointing",
          placement: "auto",
          waitFor: isField ? "focus" : isCommand ? "click" : "visible"
        }
      ]
    }
  };
}
