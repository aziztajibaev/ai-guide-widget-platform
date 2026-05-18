import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminDir = path.join(root, "apps", "admin");
const seedStorePath = path.join(adminDir, "data", "store.json");
const localStorePath = path.join(adminDir, "data", "store.local.json");
const publicDir = path.join(adminDir, "public");
const fontAwesomeDir = path.join(root, "node_modules", "@fortawesome", "fontawesome-free");
const port = Number(process.env.PORT || 3000);
const adminSessionCookieName = "smartup_admin_session";
const adminSessionMaxAgeSeconds = 8 * 60 * 60;
let lastAiProviderError = null;
let lastAiProviderErrorFor = null;
let lastGeminiModel = null;
let lastGroqModel = null;
let lastLmStudioModel = null;
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
const providerCatalog = [
  ["openai", "OpenAI", "GPT", "Fast general answers and structured guide generation.", "gpt-4o-mini", "https://api.openai.com/v1", "openai-compatible"],
  ["anthropic", "Anthropic", "Claude", "Strong reasoning for complex workflow instructions.", "claude-sonnet-4-20250514", "https://api.anthropic.com/v1", "anthropic"],
  ["gemini", "Google Gemini", "Gemini", "Low-latency answers with Google model support.", "gemini-2.5-flash", "https://generativelanguage.googleapis.com/v1beta", "gemini"],
  ["mistral", "Mistral AI", "Mistral", "European hosted models with compact latency.", "mistral-small-latest", "https://api.mistral.ai/v1", "openai-compatible"],
  ["groq", "Groq", "Groq", "Very fast inference for guided support flows.", "llama-3.3-70b-versatile", "https://api.groq.com/openai/v1", "openai-compatible"],
  ["deepseek", "DeepSeek", "DeepSeek", "Cost-efficient chat completions for product help.", "deepseek-chat", "https://api.deepseek.com", "openai-compatible"],
  ["xai", "xAI", "Grok", "Grok models through an OpenAI-compatible API.", "grok-3-mini", "https://api.x.ai/v1", "openai-compatible"],
  ["cohere", "Cohere", "Cohere", "Enterprise language models through the v2 Chat API.", "command-a-03-2025", "https://api.cohere.com/v2", "cohere"],
  ["perplexity", "Perplexity", "Sonar", "Web-grounded answers with Sonar chat completions.", "sonar", "https://api.perplexity.ai/v1/sonar", "perplexity"],
  ["openrouter", "OpenRouter", "Router", "One token to route across many hosted models.", "openai/gpt-4o-mini", "https://openrouter.ai/api/v1", "openai-compatible"]
].map(([id, name, shortName, description, defaultModel, baseUrl, protocol]) => ({
  id,
  name,
  shortName,
  description,
  defaultModel,
  baseUrl,
  protocol
}));
const providerIds = new Set(providerCatalog.map((provider) => provider.id));
const genericTargetWords = new Set(["filter", "search", "select", "click", "button", "field", "input", "find"]);
const createWords = new Set(["create", "new", "yangi", "yarat", "yaratish", "создать", "создание", "новый", "добавить"]);
const settingsWords = new Set(["settings", "setting", "настройки", "настройка"]);
const maxAiDocuments = 8;
const maxAiDocumentChars = 3500;
const groqPayloadLimits = {
  documentLimit: 4,
  documentChars: 1400,
  metadataLimit: 80,
  metadataLabelChars: 70,
  metadataTextChars: 100
};
const russianQueryHints = [
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
createWords.add("form");
createWords.add("forma");
createWords.add("qosh");
createWords.add("qo'sh");

function normalizeForMatch(input) {
  return String(input || "")
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

function isCreateConcept(word) {
  return (
    createWords.has(word) ||
    word.startsWith("yarat") ||
    word.startsWith("create") ||
    word.startsWith("add") ||
    word.startsWith("qosh") ||
    word.startsWith("qo'sh")
  );
}

function isSettingsConcept(word) {
  return settingsWords.has(word) || word.startsWith("sozlam") || word.startsWith("nastroy") || word.startsWith("setting");
}

function expandQueryWords(question) {
  const rawWords = normalizeForMatch(question)
    .replace(/[^\p{L}\p{N}' ]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
  const words = new Set();

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
      words.add("заказ");
      words.add("заказы");
    }
    if (word.startsWith("yarat") || word.startsWith("yaratil") || word.startsWith("create") || word.startsWith("new") || word.startsWith("yangi")) {
      words.add("create");
      words.add("new");
      words.add("новый");
      words.add("добавить");
      words.add("создать");
      words.add("создание");
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

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim().replace(/^"|"$/g, "");
    process.env[key] = value;
  }
}

loadEnvFile(path.join(adminDir, ".env"));

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function configuredAdminCredentials() {
  const email = String(process.env.ADMIN_EMAIL || process.env.SMARTUP_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || process.env.SMARTUP_ADMIN_PASSWORD || "").trim();

  if (email && password) {
    return { email, password };
  }

  if (isProduction()) {
    return null;
  }

  return {
    email: email || "admin@smartup.local",
    password: password || "smartup-admin"
  };
}

function configuredAdminEmail() {
  return configuredAdminCredentials()?.email || "";
}

function configuredAdminPassword() {
  return configuredAdminCredentials()?.password || "";
}

function adminSessionSecret() {
  const secret = String(
    process.env.ADMIN_SESSION_SECRET ||
      process.env.AUTH_SECRET ||
      process.env.NEXTAUTH_SECRET ||
      ""
  ).trim();

  if (secret) {
    return secret;
  }

  if (isProduction()) {
    throw new Error("ADMIN_SESSION_SECRET, AUTH_SECRET, or NEXTAUTH_SECRET must be configured in production.");
  }

  return "local-development-smartup-session-secret";
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signSessionPayload(payload) {
  return createHmac("sha256", adminSessionSecret()).update(payload).digest("base64url");
}

function createSessionToken(email, projectId) {
  const payload = Buffer.from(
    JSON.stringify({
      email: String(email).trim().toLowerCase(),
      projectId,
      expiresAt: Date.now() + adminSessionMaxAgeSeconds * 1000
    })
  ).toString("base64url");
  return `${payload}.${signSessionPayload(payload)}`;
}

function readSessionToken(token) {
  if (!token) return null;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature || !safeEqual(signature, signSessionPayload(payload))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.email || !session.expiresAt || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator >= 0 ? [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))] : [part, ""];
      })
  );
}

function adminSession(req) {
  return readSessionToken(parseCookies(req)[adminSessionCookieName]);
}

function hashPassword(password, salt = randomBytes(16).toString("base64url")) {
  const hash = scryptSync(String(password || ""), salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [algorithm, salt, storedHash] = String(passwordHash || "").split(":");
  if (algorithm !== "scrypt" || !salt || !storedHash) return false;
  const calculatedHash = scryptSync(String(password || ""), salt, 64).toString("base64url");
  return safeEqual(calculatedHash, storedHash);
}

async function verifyAdminLogin(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const store = await readStore();
  const user = (store.users || []).find((item) => item.email === normalizedEmail);
  if (user) {
    return verifyPassword(password, user.passwordHash) ? { email: user.email, projectId: user.projectId } : null;
  }
  const fallbackAdmin = configuredAdminCredentials();
  if (fallbackAdmin && safeEqual(normalizedEmail, fallbackAdmin.email) && safeEqual(password || "", fallbackAdmin.password)) {
    return { email: normalizedEmail, projectId: store.projects[0]?.id };
  }
  return null;
}

function sessionCookie(value, maxAge = adminSessionMaxAgeSeconds) {
  const encoded = encodeURIComponent(value);
  return `${adminSessionCookieName}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function normalizeHostname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function requestHostname(req) {
  for (const header of ["origin", "referer"]) {
    const value = req.headers[header];
    if (!value) continue;
    try {
      return new URL(Array.isArray(value) ? value[0] : value).hostname.toLowerCase();
    } catch {
      return normalizeHostname(Array.isArray(value) ? value[0] : value);
    }
  }
  return null;
}

function isAllowedWidgetDomain(domain, req) {
  if (!domain) return true;
  const allowed = normalizeHostname(domain);
  const hostname = requestHostname(req);
  if (!hostname) return true;
  if (allowed === "localhost") return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

const mime = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8"
};

async function readStore() {
  if (!existsSync(localStorePath)) {
    await mkdir(path.dirname(localStorePath), { recursive: true });
    await writeFile(localStorePath, await readFile(seedStorePath, "utf8"), "utf8");
  }

  const store = JSON.parse(await readFile(localStorePath, "utf8"));
  store.users = store.users || [];
  store.guides = store.guides || [];
  store.documents = store.documents || [];
  store.events = store.events || [];
  store.aiProviders = store.aiProviders || [];
  return store;
}

async function writeStore(data) {
  await mkdir(path.dirname(localStorePath), { recursive: true });
  await writeFile(localStorePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function publicIdFromEmail(email, projects = []) {
  const base =
    String(email || "")
      .split("@")[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "project";
  const existing = new Set(projects.map((project) => project.publicId));
  let publicId = base;
  let suffix = 1;
  while (existing.has(publicId)) {
    suffix += 1;
    publicId = `${base}-${suffix}`;
  }
  return publicId;
}

async function createRegisteredUser(input) {
  const store = await readStore();
  const email = String(input.email || "").trim().toLowerCase();
  if (email === configuredAdminEmail()) return null;
  if (!email || (store.users || []).some((user) => user.email === email)) return null;
  const now = new Date().toISOString();
  const project = {
    id: createId("project"),
    publicId: publicIdFromEmail(email, store.projects),
    name: String(input.projectName || "").trim() || `${email.split("@")[0] || "My"} Guide`,
    domain: null,
    theme: { accent: "#2563eb", robotBaseUrl: "/robot", robotAssetFormat: "png", logoText: "smartup" },
    createdAt: now,
    updatedAt: now
  };
  const user = {
    id: createId("user"),
    email,
    passwordHash: hashPassword(input.password),
    projectId: project.id,
    createdAt: now,
    updatedAt: now
  };
  store.projects.push(project);
  store.users.push(user);
  await writeStore(store);
  return { email: user.email, projectId: user.projectId };
}

function adminProjectForSession(store, session) {
  if (session?.projectId) {
    return store.projects.find((project) => project.id === session.projectId) || null;
  }
  return store.projects[0] || null;
}

function adminProjectPayload(store, project) {
  return {
    ...project,
    guides: store.guides.filter((guide) => guide.projectId === project.id).map(publicGuide),
    documents: store.documents.filter((document) => document.projectId === project.id).map(publicDocument),
    events: store.events.filter((event) => event.projectId === project.id).slice(0, 20)
  };
}

async function resetProjectToSeed(store, project) {
  const seed = JSON.parse(await readFile(seedStorePath, "utf8"));
  seed.users = seed.users || [];
  seed.guides = seed.guides || [];
  seed.documents = seed.documents || [];
  seed.events = seed.events || [];
  seed.aiProviders = seed.aiProviders || [];

  const seedProject = (seed.projects || []).find((item) => item.publicId === project.publicId);
  if (!seedProject) return null;

  const now = new Date().toISOString();
  const resetProject = {
    ...seedProject,
    id: project.id,
    publicId: project.publicId,
    createdAt: project.createdAt || seedProject.createdAt,
    updatedAt: now
  };

  store.projects = store.projects.map((item) => (item.id === project.id ? resetProject : item));
  store.guides = [
    ...store.guides.filter((guide) => guide.projectId !== project.id),
    ...seed.guides
      .filter((guide) => guide.projectId === seedProject.id)
      .map((guide) => ({ ...guide, projectId: project.id, updatedAt: now }))
  ];
  store.documents = [
    ...store.documents.filter((document) => document.projectId !== project.id),
    ...seed.documents
      .filter((document) => document.projectId === seedProject.id)
      .map((document) => ({ ...document, projectId: project.id, updatedAt: now }))
  ];
  store.events = store.events.filter((event) => event.projectId !== project.id);
  store.aiProviders = store.aiProviders.filter((provider) => provider.projectId !== project.id);

  await writeStore(store);
  return resetProject;
}

function maskToken(token) {
  const clean = String(token || "").trim();
  if (!clean) return "";
  if (clean.length <= 8) return "••••";
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

function providerDashboard(store, project) {
  const activeProvider = project?.activeAiProvider || null;
  const providers = providerCatalog.map((definition) => {
    const credential = (store.aiProviders || []).find(
      (item) => item.projectId === project.id && item.provider === definition.id
    );
    const hasToken = Boolean(credential?.apiKey || credential?.encryptedApiKey);
    return {
      provider: definition.id,
      name: definition.name,
      shortName: definition.shortName,
      description: definition.description,
      defaultModel: definition.defaultModel,
      model: credential?.model || definition.defaultModel,
      enabled: Boolean(credential?.enabled && hasToken),
      hasToken,
      keyHint: credential?.keyHint || null,
      active: activeProvider === definition.id,
      baseUrl: definition.baseUrl,
      protocol: definition.protocol
    };
  });
  const active = providers.find((provider) => provider.active);
  return {
    requested: active?.provider || "rules",
    active: active?.provider || "rules",
    activeProvider,
    configured: Boolean(active),
    model: active?.model || "rules",
    lastError: active && lastAiProviderErrorFor === active.provider ? lastAiProviderError : null,
    providers
  };
}

function upsertPreviewProvider(store, project, input) {
  const definition = providerCatalog.find((provider) => provider.id === input.provider);
  if (!definition) return false;
  const now = new Date().toISOString();
  const existingIndex = (store.aiProviders || []).findIndex(
    (item) => item.projectId === project.id && item.provider === input.provider
  );
  const existing = existingIndex >= 0 ? store.aiProviders[existingIndex] : null;
  const cleanToken = String(input.apiKey || "").trim();
  const credential = {
    id: existing?.id || createId("provider"),
    projectId: project.id,
    provider: definition.id,
    apiKey: cleanToken || existing?.apiKey || "",
    keyHint: cleanToken ? maskToken(cleanToken) : existing?.keyHint || "",
    model: String(input.model || existing?.model || definition.defaultModel).trim(),
    enabled: Boolean(cleanToken || existing?.apiKey) && input.enabled !== false,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  if (existingIndex >= 0) store.aiProviders[existingIndex] = credential;
  else store.aiProviders.push(credential);
  if (input.makeActive && credential.enabled) {
    project.activeAiProvider = definition.id;
  }
  project.updatedAt = now;
  return true;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...headers
  });
  res.end(body);
}

function json(res, status, body, headers = {}) {
  send(res, status, JSON.stringify(body), { "Content-Type": mime[".json"], ...headers });
}

function redirect(res, location) {
  send(res, 302, "", { Location: location });
}

async function bodyJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

function publicGuide(guide) {
  return {
    slug: guide.slug,
    title: guide.title,
    intent: guide.intent,
    aliases: guide.aliases,
    urlPattern: guide.urlPattern,
    steps: guide.steps
  };
}

function publicDocument(document) {
  return {
    id: document.id,
    title: document.title,
    content: document.content,
    tags: document.tags || [],
    enabled: document.enabled !== false
  };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё' ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bestGuide(question, guides, routePath) {
  const q = normalize(question);
  let best = null;
  let bestScore = 0;

  for (const guide of guides) {
    const candidates = [guide.title, guide.intent, ...guide.aliases].map(normalize);
    let score = guide.urlPattern && routePath.includes(guide.urlPattern) ? 3 : 0;

    for (const candidate of candidates) {
      if (q === candidate) {
        score += 10;
      } else if (q.includes(candidate) || candidate.includes(q)) {
        score += 6;
      } else {
        score += candidate.split(" ").filter((word) => word && q.includes(word)).length;
      }
    }

    if (score > bestScore) {
      best = guide;
      bestScore = score;
    }
  }

  return bestScore > 1 ? best : null;
}

function metadataRef(item, index) {
  return item?.ref || `e${index + 1}`;
}

function metadataPayloadScore(item = {}, words = []) {
  const label = normalizeForMatch(item.label || "");
  const text = normalizeForMatch(item.text || "");
  const role = normalizeForMatch(item.role || "");
  const tagName = String(item.tagName || "").toLowerCase();
  const rawSelector = String(item.selector || "").toLowerCase();
  const selector = normalizeForMatch(item.selector || "");
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

function safeMetadataSummary(metadata = [], limits = {}, question = "") {
  const metadataLimit = limits.metadataLimit || 90;
  const labelChars = limits.metadataLabelChars || 64;
  const textChars = limits.metadataTextChars || 110;
  const words = expandQueryWords(question).filter((word) => !genericTargetWords.has(word)).slice(0, 24);

  return metadata
    .map((item, index) => ({ item, index, score: metadataPayloadScore(item, words) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, metadataLimit)
    .map(({ item, index }) => ({
      ref: metadataRef(item, index),
      role: item.role,
      label: item.label?.slice?.(0, labelChars),
      text: item.text?.slice?.(0, textChars),
      tagName: item.tagName
    }));
}

function metadataTargetRef(metadata = [], selector = "") {
  const index = metadata.findIndex((item) => item?.selector === selector);
  return index >= 0 ? metadataRef(metadata[index], index) : "completed";
}

function aiProviderStatus() {
  const requested = normalizeAiProvider(process.env.AI_PROVIDER || "auto");
  const active = resolveAiProvider();

  return {
    requested,
    active,
    configured: active !== "rules",
    model:
      active === "lmstudio"
        ? lastLmStudioModel
          ? `${lastLmStudioModel} active`
          : String(process.env.LMSTUDIO_MODEL || process.env.LM_STUDIO_MODEL || "auto-detect")
        : active === "groq"
        ? lastGroqModel
          ? `${lastGroqModel} active`
          : getGroqModels().join(" -> ")
        : active === "deepseek"
        ? String(process.env.DEEPSEEK_MODEL || "deepseek-chat")
        : active === "gemini"
          ? lastGeminiModel
            ? `${lastGeminiModel} active`
            : getGeminiModels().join(" -> ")
          : "rules",
    lastError: lastAiProviderErrorFor === active ? lastAiProviderError : null
  };
}

function normalizeAiProvider(value) {
  const provider = String(value || "auto").toLowerCase();
  return ["auto", "lmstudio", "lm-studio", "groq", "deepseek", "gemini", "openai", "anthropic", "rules", "none"].includes(provider)
    ? provider === "lm-studio"
      ? "lmstudio"
      : provider
    : "auto";
}

function resolveAiProvider() {
  const requested = normalizeAiProvider(process.env.AI_PROVIDER || "auto");
  const hasLmStudio = Boolean(String(process.env.LMSTUDIO_BASE_URL || process.env.LM_STUDIO_BASE_URL || "").trim());
  const hasGroq = Boolean(String(process.env.GROQ_API_KEY || "").trim());
  const hasDeepSeek = Boolean(String(process.env.DEEPSEEK_API_KEY || "").trim());
  const hasGemini = Boolean(String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim());

  if (requested === "rules" || requested === "none") return "rules";
  if (requested === "lmstudio" && hasLmStudio) return "lmstudio";
  if (requested === "groq" && hasGroq) return "groq";
  if (requested === "deepseek" && hasDeepSeek) return "deepseek";
  if (requested === "gemini" && hasGemini) return "gemini";
  if (requested === "auto") {
    if (hasLmStudio) return "lmstudio";
    if (hasGroq) return "groq";
    if (hasDeepSeek) return "deepseek";
    if (hasGemini) return "gemini";
  }

  return "rules";
}

function setRuntimeAiProvider(provider) {
  const normalized = normalizeAiProvider(provider);
  if (!["auto", "lmstudio", "groq", "deepseek", "gemini", "rules"].includes(normalized)) return false;
  process.env.AI_PROVIDER = normalized;
  clearAiProviderError();
  lastGeminiModel = null;
  lastGroqModel = null;
  lastLmStudioModel = null;
  return true;
}

function lmStudioBaseUrl() {
  return String(process.env.LMSTUDIO_BASE_URL || process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1").replace(/\/+$/g, "");
}

function lmStudioHeaders(key) {
  return {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {})
  };
}

async function getLmStudioModel(baseUrl, key) {
  const configured = String(process.env.LMSTUDIO_MODEL || process.env.LM_STUDIO_MODEL || "").trim();
  if (configured) return configured;

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: lmStudioHeaders(key),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return "local-model";
    const payload = await response.json();
    return payload?.data?.find?.((model) => model?.id)?.id || "local-model";
  } catch {
    return "local-model";
  }
}

function getGroqModels() {
  const configured = String(process.env.GROQ_MODELS || process.env.GROQ_MODEL || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const models = configured.length
    ? configured
    : ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

  for (const fallback of ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]) {
    if (!models.includes(fallback)) models.push(fallback);
  }

  return models;
}

function getGeminiModels() {
  const configured = String(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const models = configured.length ? configured : ["gemini-2.5-flash", "gemini-2.0-flash"];

  for (const fallback of ["gemini-2.5-flash", "gemini-2.0-flash"]) {
    if (!models.includes(fallback)) models.push(fallback);
  }

  return models;
}

function normalizePageLanguage(language) {
  const normalized = String(language || "").toLowerCase();
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("uz")) return "uz";
  return null;
}

function detectAnswerLanguage(question, pageLanguage = "") {
  const normalizedQuestion = String(question || "").toLowerCase();
  if (/[а-яё]/i.test(question)) return "ru";
  if (/[ʻʼ‘’`]|o'|g'|\b(qayerda|qayer|qaerda|qaer|qanday|qanaqa|nima|kim|salom|rahmat|iltimos|kerak|tugma|bo'lim|bolim|yarat|yaratil|qo'sh|qosh|ko'rsat|korsat|menga|senga|sen|men|bormi|qil|shuni|qani)\b/i.test(normalizedQuestion)) {
    return "uz";
  }
  if (/\b(how|where|what|which|who|create|button|filter|search|show|open|help|hello|thanks)\b/i.test(normalizedQuestion)) {
    return "en";
  }
  return normalizePageLanguage(pageLanguage) || "uz";
}

function localized(language, values) {
  return values[language] || values.uz;
}

function errorSummary(provider, error) {
  return `${provider}: ${error instanceof Error ? error.message : "request failed"}`.slice(0, 240);
}

function clearAiProviderError() {
  lastAiProviderError = null;
  lastAiProviderErrorFor = null;
}

function rememberAiProviderError(provider, message) {
  lastAiProviderError = message;
  lastAiProviderErrorFor = provider;
}

async function responseErrorSummary(provider, response) {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    const rawError = parsed?.error;
    const errorObject = rawError && typeof rawError === "object" ? rawError : null;
    const status = errorObject?.status || errorObject?.type || errorObject?.code || response.statusText || "HTTP error";
    const message = typeof rawError === "string" ? ` - ${rawError}` : errorObject?.message ? ` - ${errorObject.message}` : "";
    return `${provider}: ${response.status} ${status}${message}`.slice(0, 240);
  } catch {
    return `${provider}: ${response.status} ${response.statusText || "HTTP error"}`.slice(0, 240);
  }
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

function parseJsonObject(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeAiSteps(question, metadata, completedSteps, mode, steps) {
  const completedTargets = new Set((completedSteps || []).map((step) => step.target));
  const seenTargets = new Set();
  const safeSteps = [];

  for (const step of steps) {
    if (mode === "next" && completedTargets.has(step.target)) continue;
    if (seenTargets.has(step.target) || isUnsafeGenericCreateStep(question, metadata, step)) continue;
    seenTargets.add(step.target);
    safeSteps.push(step);
  }

  return safeSteps.slice(0, 1);
}

function normalizeGeneratedGuide(content, routePath, question, metadata, completedSteps = [], mode = "start") {
  const raw = parseJsonObject(content);
  if (!raw || typeof raw !== "object") return null;
  if (raw.type === "answer" && typeof raw.message === "string" && raw.message.trim()) {
    return { guide: null, answer: raw.message.trim().slice(0, 500) };
  }
  if (!Array.isArray(raw.steps)) return null;
  const allowed = new Map();
  (metadata || []).forEach((item, index) => {
    if (!item?.selector) return;
    allowed.set(item.selector, item.selector);
    allowed.set(metadataRef(item, index), item.selector);
  });
  const steps = raw.steps
    .filter((step) => step && typeof step === "object")
    .map((step) => {
      const target = typeof step.target === "string" ? allowed.get(step.target.trim()) || "" : "";
      return {
        target,
        message: typeof step.message === "string" ? step.message.slice(0, 180) : "",
        robotState: ["idle", "talking", "pointing", "pointing-left", "pointing-right", "thinking", "success", "error"].includes(step.robotState)
          ? step.robotState
          : "pointing",
        placement: ["auto", "top", "right", "bottom", "left"].includes(step.placement) ? step.placement : "auto",
        waitFor: ["click", "focus", "visible", "manual"].includes(step.waitFor) ? step.waitFor : "click"
      };
    })
    .filter((step) => step.target && step.message);
  if (!steps.length) return null;
  const safeSteps = normalizeAiSteps(question, metadata, completedSteps, mode, steps);
  if (!safeSteps.length) return null;
  return {
    answer: null,
    guide: {
      slug: "ai-runtime-guide",
      title: typeof raw.title === "string" ? raw.title.slice(0, 80) : "AI generated guide",
      intent: typeof raw.intent === "string" ? raw.intent.slice(0, 180) : question,
      aliases: [],
      urlPattern: routePath || null,
      steps: safeSteps
    }
  };
}

function scoreDocumentForQuestion(document, words, normalizedQuestion) {
  if (!words.length) return 0;
  const title = normalizeForMatch(document.title || "");
  const tags = normalizeForMatch((document.tags || []).join(" "));
  const content = normalizeForMatch(String(document.content || "").slice(0, 16000));
  const strongWords = words.filter((word) => !genericTargetWords.has(word) && !isCreateConcept(word) && !isSettingsConcept(word));
  const wantsCreation = words.some(isCreateConcept);
  const asksUser = /\b(user|foydalanuv|polzovatel)\w*/i.test(normalizedQuestion);
  const asksAccount = /\b(account|rasch|raschot|rashot|rashotniy|schet|schyot|shot|hisob)\w*/i.test(normalizedQuestion);
  let score = 0;
  if (normalizedQuestion.length > 8 && content.includes(normalizedQuestion.slice(0, 80))) score += 20;
  for (const word of words) {
    if (title.includes(word)) score += strongWords.includes(word) ? 28 : 10;
    if (tags.includes(word)) score += 7;
    if (content.includes(word)) score += 2;
  }
  if (strongWords.length && !strongWords.some((word) => title.includes(word) || tags.includes(word))) score -= 18;
  if (wantsCreation && strongWords.some((word) => title.includes(word))) {
    score += /\b(create|new|add)\b/.test(title) ? 32 : -8;
  }
  if (asksUser) score += title.includes("user") ? 70 : -30;
  if (asksAccount) score += title.includes("account") ? 70 : -30;
  return score;
}

function selectRelevantDocuments(question, documents, limit = maxAiDocuments) {
  const q = normalizeForMatch(question);
  const words = expandQueryWords(q).filter((word) => !genericTargetWords.has(word));
  if (!words.length) return [];
  return (documents || [])
    .filter((document) => document.enabled !== false)
    .map((document) => ({ document, score: scoreDocumentForQuestion(document, words, q) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.document);
}

function documentAnswerExcerpt(document, language = "ru") {
  const lines = String(document.content || "")
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
  const answer = excerpt ? `${document.title || "Smartup"}: ${excerpt}` : String(document.title || "");
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

function compactMatchText(value) {
  return normalizeForMatch(value)
    .replace(/[^\p{L}\p{N}' ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMenuPart(value) {
  const firstQuote = Array.from(String(value || "").matchAll(quotedLabelPattern))[0]?.[1];
  const part = String(firstQuote || value || "")
    .replace(/^[^:]{0,90}:\s*/, "")
    .replace(/[\u00ab\u00bb"]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\d.)\s-]+/, "")
    .replace(/[.;:,]+$/g, "")
    .trim();

  if (!part || stepLinePattern.test(part) || part.length > 70) return "";
  return part;
}

function extractQuotedLabels(line) {
  return Array.from(String(line || "").matchAll(quotedLabelPattern))
    .map((match) => cleanMenuPart(match[1]))
    .filter(Boolean);
}

function extractDocumentMenuPaths(document) {
  const paths = [];
  const sequentialParts = [];

  for (const line of String(document.content || "")
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
      if (sequentialParts.length >= 2) paths.push({ parts: [...sequentialParts], line });
    } else {
      sequentialParts.length = 0;
    }

    if (quoted.length >= 2) paths.push({ parts: quoted, line });

    if (/[\u2192\u203a>]/.test(line)) {
      const arrowParts = line.split(arrowPathPattern).map(cleanMenuPart).filter(Boolean);
      if (arrowParts.length >= 2) paths.push({ parts: arrowParts, line });
    }
  }

  return paths
    .filter((path) => path.parts.length >= 2 && !stepLinePattern.test(path.parts[0]))
    .slice(0, 8);
}

function findVisibleMenuTarget(path, elements) {
  const candidates = (elements || []).filter((item) => {
    const tagName = String(item.tagName || "").toLowerCase();
    const role = String(item.role || "").toLowerCase();
    const text = `${item.label || ""} ${item.text || ""}`.trim();
    return Boolean(text) && (["a", "button", "li", "span", "div"].includes(tagName) || ["link", "button", "menuitem", "tab"].includes(role));
  });

  for (const part of path) {
    const targetText = compactMatchText(part);
    if (!targetText) continue;

    const best = candidates
      .map((item) => {
        const label = compactMatchText(`${item.label || ""} ${item.text || ""}`);
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

    if (best) return { item: best.item, visiblePart: part };
  }

  return null;
}

function documentMenuGuide(question, documents, routePath, specificWords, elements) {
  const matchingDocument = selectRelevantDocuments(question, documents, 1)[0] || (documents || []).find((document) => {
    const haystack = normalizeForMatch(`${document.title || ""} ${(document.tags || []).join(" ")} ${document.content || ""}`);
    return specificWords.some((word) => haystack.includes(word));
  });

  if (!matchingDocument) return null;

  for (const path of extractDocumentMenuPaths(matchingDocument)) {
    const target = findVisibleMenuTarget(path.parts, elements);
    if (!target) continue;

    const pathText = path.parts.join(" -> ");
    return {
      answer: null,
      guide: {
        slug: "ai-document-menu-guide",
        title: String(matchingDocument.title || "Smartup").slice(0, 80),
        intent: question,
        aliases: [],
        urlPattern: routePath || null,
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

function isUnsafeGenericCreateStep(question, metadata, step) {
  const target = (metadata || []).find((item) => item.selector === step.target);
  if (!target) return false;

  const questionWords = expandQueryWords(question).filter((word) => !genericTargetWords.has(word));
  const entityWords = questionWords.filter((word) => !isCreateConcept(word) && !isSettingsConcept(word));
  if (!entityWords.length) return false;

  const targetText = compactMatchText(`${target.label || ""} ${target.text || ""} ${target.role || ""} ${target.tagName || ""}`);
  const createMatch = Array.from(createWords).some((word) => targetText.includes(word));
  if (!createMatch) return false;

  const pageText = compactMatchText(
    (metadata || []).map((item) => `${item.label || ""} ${item.text || ""} ${item.role || ""} ${item.tagName || ""}`).join(" ")
  );

  return !entityWords.some((word) => targetText.includes(word) || pageText.includes(word));
}

function isGenericCreateTargetForDifferentEntity(specificWords, target) {
  const entityWords = specificWords.filter(
    (word) => !genericTargetWords.has(word) && !isCreateConcept(word) && !isSettingsConcept(word)
  );
  if (!entityWords.length) return false;

  const targetText = compactMatchText(`${target.label || ""} ${target.text || ""} ${target.role || ""} ${target.tagName || ""}`);
  const createMatch = Array.from(createWords).some((word) => targetText.includes(word));
  if (!createMatch) return false;

  return !entityWords.some((word) => targetText.includes(word));
}

function targetContainsUnaskedEntity(specificWords, target) {
  const targetText = compactMatchText(`${target.label || ""} ${target.text || ""} ${target.role || ""} ${target.tagName || ""}`);
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

function fallbackAnswer(question, documents, specificWords, pageLanguage = "") {
  const language = detectAnswerLanguage(question, pageLanguage);

  if (identityPattern.test(question)) {
    return localized(language, {
      uz: "Men Smartup SFA yordamchisiman. Savollarga javob beraman, sahifadagi kerakli joyni topib ko'rsataman va jarayonlarda keyingi qadamni aytib boraman.",
      ru: "Я помощник Smartup SFA. Отвечаю на вопросы, нахожу нужные элементы на странице и подсказываю следующие шаги.",
      en: "I am the Smartup SFA assistant. I answer questions, find the right place on the page, and guide you through the next steps."
    });
  }

  if (aiStatusPattern.test(question) && /lmstudio|lm studio|groq|deepseek|gemini|ai|provider|model/i.test(question)) {
    const status = aiProviderStatus();
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

  const matchingDocument = selectRelevantDocuments(question, documents, 1)[0] || (documents || []).find((document) => {
    const haystack = normalizeForMatch(`${document.title || ""} ${(document.tags || []).join(" ")} ${document.content || ""}`);
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

function fallbackStepMessage(question, target, label, pageLanguage = "") {
  const q = normalizeForMatch(question);
  const language = detectAnswerLanguage(question, pageLanguage);
  const isField = ["input", "textarea", "select"].includes(target.tagName);
  const isCommand = ["button", "a"].includes(target.tagName) || target.role === "button" || target.role === "link";

  if (
    isCommand &&
    (q.includes("zakaz") || q.includes("buyurt") || q.includes("order")) &&
    (q.includes("yarat") || q.includes("create") || q.includes("new") || q.includes("yangi"))
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

function buildAiPayload(question, documents, routePath, metadata, completedSteps, mode, limits = {}, pageLanguage = "") {
  const answerLanguage = detectAnswerLanguage(question, pageLanguage);
  const documentLimit = limits.documentLimit || maxAiDocuments;
  const documentChars = limits.documentChars || maxAiDocumentChars;

  return {
    mode,
    question,
    pageLanguage: normalizePageLanguage(pageLanguage) || "unknown",
    userLanguage: answerLanguage,
    answerLanguage,
    russianSearchTerms: expandQueryWords(question).slice(0, 28),
    path: routePath,
    completedSteps: completedSteps.map((step) => ({
      target: metadataTargetRef(metadata, step.target),
      message: step.message,
      waitFor: step.waitFor
    })),
    knowledgeDocuments: selectRelevantDocuments(question, documents, documentLimit).map((document) => ({
      title: document.title,
      tags: document.tags || [],
      content: String(document.content || "").slice(0, documentChars)
    })),
    pageElements: safeMetadataSummary(metadata, limits, question)
  };
}

async function generateWithDeepSeek(question, documents, routePath, metadata, completedSteps, mode, pageLanguage = "") {
  const key = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (!key) return null;

  const baseUrl = String(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/g, "");
  const model = String(process.env.DEEPSEEK_MODEL || "deepseek-chat");
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
        { role: "user", content: JSON.stringify(buildAiPayload(question, documents, routePath, metadata, completedSteps, mode, {}, pageLanguage)) }
      ]
    })
  });

  if (!response.ok) {
    rememberAiProviderError("deepseek", await responseErrorSummary("deepseek", response));
    return null;
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "";
  const decision = content ? normalizeGeneratedGuide(content, routePath, question, metadata, completedSteps, mode) : null;
  if (decision?.guide || decision?.answer) {
    clearAiProviderError();
    return decision;
  }

  rememberAiProviderError("deepseek", "deepseek: empty or unsafe response");
  return null;
}

async function generateWithLmStudio(question, documents, routePath, metadata, completedSteps, mode, pageLanguage = "") {
  const key = String(process.env.LMSTUDIO_API_KEY || process.env.LM_STUDIO_API_KEY || "").trim();
  const baseUrl = lmStudioBaseUrl();
  const model = await getLmStudioModel(baseUrl, key);
  const promptPayload = JSON.stringify(buildAiPayload(question, documents, routePath, metadata, completedSteps, mode, groqPayloadLimits, pageLanguage));
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

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  const decision = content ? normalizeGeneratedGuide(content, routePath, question, metadata, completedSteps, mode) : null;
  if (decision?.guide || decision?.answer) {
    clearAiProviderError();
    lastLmStudioModel = model;
    return decision;
  }

  rememberAiProviderError("lmstudio", "lmstudio: empty or unsafe response");
  return null;
}

async function generateWithGroq(question, documents, routePath, metadata, completedSteps, mode, pageLanguage = "") {
  const key = String(process.env.GROQ_API_KEY || "").trim();
  if (!key) return null;

  const baseUrl = String(process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/g, "");
  const promptPayload = JSON.stringify(buildAiPayload(question, documents, routePath, metadata, completedSteps, mode, groqPayloadLimits, pageLanguage));
  const errors = [];

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

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content || "";
    const decision = content ? normalizeGeneratedGuide(content, routePath, question, metadata, completedSteps, mode) : null;
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

async function chooseGuide(question, documents, routePath, metadata, completedSteps = [], mode = "start", pageLanguage = "") {
  const provider = resolveAiProvider();
  if (provider === "lmstudio") {
    try {
      const decision = await generateWithLmStudio(question, documents, routePath, metadata, completedSteps, mode, pageLanguage);
      if (decision?.guide || decision?.answer) return { ...decision, source: "lmstudio" };
    } catch (error) {
      lastLmStudioModel = null;
      rememberAiProviderError("lmstudio", errorSummary("lmstudio", error));
      // Fall through to deterministic rules.
    }
  }

  if (provider === "groq") {
    try {
      const decision = await generateWithGroq(question, documents, routePath, metadata, completedSteps, mode, pageLanguage);
      if (decision?.guide || decision?.answer) return { ...decision, source: "groq" };
    } catch (error) {
      rememberAiProviderError("groq", errorSummary("groq", error));
      // Fall through to deterministic rules.
    }
  }

  if (provider === "deepseek") {
    try {
      const decision = await generateWithDeepSeek(question, documents, routePath, metadata, completedSteps, mode, pageLanguage);
      if (decision?.guide || decision?.answer) return { ...decision, source: "deepseek" };
    } catch (error) {
      rememberAiProviderError("deepseek", errorSummary("deepseek", error));
      // Fall through to deterministic rules.
    }
  }

  const geminiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (provider === "gemini" && geminiKey) {
    try {
      const errors = [];
      const requestPayload = {
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify(buildAiPayload(question, documents, routePath, metadata, completedSteps, mode, {}, pageLanguage))
              }
            ]
          }
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" }
      };

      for (const model of getGeminiModels()) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload)
          }
        );

        if (!response.ok) {
          errors.push(await responseErrorSummary(`gemini ${model}`, response));
          continue;
        }

        const payload = await response.json();
        const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
        const decision = content ? normalizeGeneratedGuide(content, routePath, question, metadata, completedSteps, mode) : null;
        if (decision?.guide || decision?.answer) {
          clearAiProviderError();
          lastGeminiModel = model;
          return { ...decision, source: "gemini" };
        }

        errors.push(`gemini ${model}: empty or unsafe response`);
      }

      lastGeminiModel = null;
      rememberAiProviderError("gemini", errors.join(" | ").slice(0, 500) || "gemini: no response");
    } catch (error) {
      lastGeminiModel = null;
      rememberAiProviderError("gemini", errorSummary("gemini", error));
      // Fall through to deterministic rules.
    }
  }

  const completedTargets = new Set((completedSteps || []).map((step) => step.target));
  const elements = (metadata || []).filter((item) => !completedTargets.has(item.selector));
  const q = normalizeForMatch(question);
  const specificWords = expandQueryWords(q);
  const wantsGuide = guideIntentPattern.test(q);
  const createIntent = specificWords.some(isCreateConcept);
  const directTarget = elements
    .map((item) => {
      const haystack = normalizeForMatch(`${item.label || ""} ${item.text || ""} ${item.role || ""} ${item.tagName}`);
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
  const menuGuide = documentMenuGuide(question, documents, routePath, specificWords, elements);
  const targetIsWrongGenericCreate = target ? isGenericCreateTargetForDifferentEntity(specificWords, target) : false;
  const targetHasUnaskedEntity = target ? targetContainsUnaskedEntity(specificWords, target) : false;
  if (menuGuide && (wantsGuide || targetIsWrongGenericCreate || targetHasUnaskedEntity)) {
    return { ...menuGuide, source: "rules-fallback" };
  }
  if (!target || (!wantsGuide && (!directTarget || directTarget.score < 12))) {
    if (menuGuide && (wantsGuide || !target)) {
      return { ...menuGuide, source: "rules-fallback" };
    }

    return {
      guide: null,
      answer: fallbackAnswer(q, documents, specificWords, pageLanguage),
      source: "rules-fallback"
    };
  }
  const isField = ["input", "textarea", "select"].includes(target.tagName);
  const isCommand = ["button", "a"].includes(target.tagName) || target.role === "button" || target.role === "link";
  const label = target.label || target.text || target.selector;
  const message = fallbackStepMessage(question, target, label, pageLanguage);
  return {
    answer: null,
    guide: {
      slug: "ai-runtime-guide",
      title: "AI generated guide",
      intent: question,
      aliases: [],
      urlPattern: routePath || null,
      steps: [
        {
          target: target.selector,
          message,
          robotState: "pointing",
          placement: "auto",
          waitFor: isField ? "focus" : isCommand ? "click" : "visible"
        }
      ]
    },
    source: "rules-fallback"
  };
}

function presentationHtml(session) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Smartup Guide</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/fontawesome/css/all.min.css" />
  <link rel="stylesheet" href="/preview.css" />
</head>
<body>
  <main class="product-landing">
    <div class="landing-progress" data-scroll-progress></div>
    <header class="product-nav">
      <a class="product-brand" href="/"><span class="product-mark"></span><span class="product-wordmark"><span>Smartup</span><span>Guide</span></span></a>
      <nav class="product-links" aria-label="Landing page sections"><a class="has-chevron" href="#features" data-nav-link>Product <i class="nav-chevron fa-solid fa-chevron-down" aria-hidden="true"></i></a><a href="#features" data-nav-link>Features</a><a href="#workflow" data-nav-link>How it works</a><a href="#admin-preview" data-nav-link>Pricing</a><a href="#workflow" data-nav-link>Docs</a><a href="#chat-preview" data-nav-link>About</a></nav>
      <div class="product-nav-actions"><a href="/login">Log in</a><a class="product-button primary small" href="/demo">Open demo <i class="button-arrow fa-solid fa-arrow-right-long" aria-hidden="true"></i></a></div>
    </header>

    <section class="product-hero">
      <div class="product-hero-copy" data-reveal>
        <h1>Guide users inside the <span>workflow</span></h1>
        <p>An AI assistant that answers from your knowledge base, points to the right control, and keeps every step inside the product.</p>
        <div class="product-hero-actions"><a class="product-button primary" href="/demo">Open demo <i class="button-arrow fa-solid fa-arrow-right-long" aria-hidden="true"></i></a><a class="product-button" href="/admin"><i class="button-shield fa-solid fa-gauge-high" aria-hidden="true"></i>Admin console</a></div>
        <div class="hero-metrics" aria-label="Smartup Guide metrics"><div class="hero-metric"><i class="hero-metric-icon fa-solid fa-rocket" aria-hidden="true"></i><strong>80%</strong><small>Faster resolution</small></div><div class="hero-metric"><i class="hero-metric-icon fa-solid fa-ticket-simple" aria-hidden="true"></i><strong>35%</strong><small>Less tickets</small></div><div class="hero-metric"><i class="hero-metric-icon fa-solid fa-robot" aria-hidden="true"></i><strong>24/7</strong><small>AI availability</small></div><div class="hero-metric"><i class="hero-metric-icon fa-solid fa-bullseye" aria-hidden="true"></i><strong>98%</strong><small>Answer accuracy</small></div></div>
      </div>
      <div class="product-hero-art" data-reveal>
        <div class="hero-live-preview" aria-label="Animated Smartup Guide product preview"><div class="preview-orbit orbit-one" aria-hidden="true"></div><div class="preview-orbit orbit-two" aria-hidden="true"></div><div class="preview-panel preview-knowledge" aria-hidden="true"><div class="preview-panel-head"><i class="preview-mini-icon fa-solid fa-database"></i><strong>Knowledge base</strong></div><span class="preview-search">Search articles...</span><ul><li><span></span> Getting started</li><li><span></span> Account &amp; billing</li><li><span></span> Integrations</li></ul></div><div class="preview-panel preview-admin" aria-hidden="true"><div class="preview-panel-head"><i class="preview-mini-icon fa-solid fa-gauge-high"></i><strong>Admin console</strong></div><div class="preview-stat"><small>Total conversations</small><strong>24,578</strong></div><div class="preview-line-chart"><span></span><span></span><span></span><span></span></div><div class="preview-bars"><i></i><i></i><i></i></div></div><div class="preview-panel preview-chat" aria-hidden="true"><div class="preview-panel-head"><span class="product-mark small-mark"></span><strong>Smartup Guide</strong></div><p class="preview-user">How do I connect my domain?</p><p class="preview-answer">Settings -&gt; Domains. I can show the next click.</p></div><div class="preview-robot-stage"><span class="preview-glow" aria-hidden="true"></span><img class="preview-robot preview-robot-talking" src="/robot/talking.png" alt="Smartup Guide robot assistant" /><img class="preview-robot preview-robot-pointing" src="/robot/pointing.png" alt="" aria-hidden="true" /><img class="preview-robot preview-robot-thinking" src="/robot/thinking.png" alt="" aria-hidden="true" /><img class="preview-robot preview-robot-success" src="/robot/success.png" alt="" aria-hidden="true" /></div><div class="preview-pointer" aria-hidden="true"><i class="preview-pointer-icon fa-solid fa-location-arrow"></i>Points to the next control</div></div>
      </div>
    </section>

    <section class="feature-band" id="features">
      <div class="feature-band-heading" data-reveal><h2>Everything your team needs to support at scale</h2></div>
      <div class="feature-card-strip"><article class="feature-tile" data-reveal><i class="feature-icon fa-solid fa-database" aria-hidden="true"></i><h2>AI answers from your knowledge base</h2><p>Approved docs and policies stay close to every support answer.</p></article><article class="feature-tile" data-reveal><i class="feature-icon fa-solid fa-location-arrow" aria-hidden="true"></i><h2>Points to the right control or setting</h2><p>Guide users toward the exact screen, button, or next action.</p></article><article class="feature-tile" data-reveal><i class="feature-icon fa-solid fa-comments" aria-hidden="true"></i><h2>Built-in chat that stays inside your product</h2><p>Keep help in context instead of sending people to another tab.</p></article><article class="feature-tile" data-reveal><i class="feature-icon fa-solid fa-chart-line" aria-hidden="true"></i><h2>Full visibility and actionable insights</h2><p>Track conversations, topics, accuracy, and unresolved moments.</p></article></div>
    </section>

    <section class="workflow-section" id="workflow">
      <div class="section-title" data-reveal><h2>How it works</h2><p>Four practical steps take the assistant from knowledge source to live guided help.</p></div>
      <div class="workflow-track" data-reveal><article class="workflow-step step-source"><div class="workflow-step-top"><span class="workflow-number">1</span><i class="workflow-step-icon fa-solid fa-cloud-arrow-up" aria-hidden="true"></i></div><small>Docs synced</small><h3>Connect knowledge</h3><p>Upload docs or connect trusted sources.</p></article><article class="workflow-step step-rules"><div class="workflow-step-top"><span class="workflow-number">2</span><i class="workflow-step-icon fa-solid fa-sliders" aria-hidden="true"></i></div><small>Rules tuned</small><h3>Configure</h3><p>Set behavior, tone, provider, and widget settings.</p></article><article class="workflow-step step-embed"><div class="workflow-step-top"><span class="workflow-number">3</span><i class="workflow-step-icon fa-solid fa-code" aria-hidden="true"></i></div><small>Snippet live</small><h3>Install</h3><p>Add the snippet to your app or site.</p></article><article class="workflow-step step-guide"><div class="workflow-step-top"><span class="workflow-number">4</span><i class="workflow-step-icon fa-solid fa-route" aria-hidden="true"></i></div><small>Help delivered</small><h3>Guide users</h3><p>Answer questions and point to the next action.</p></article></div>
    </section>

    <section class="preview-section" id="admin-preview"><div class="section-title" data-reveal><h2>Admin console that stays operational.</h2><p>The workspace puts knowledge, provider state, install snippets, project settings, and events on one scannable screen.</p></div><div class="landing-admin-preview" data-reveal><aside><strong>Smartup Guide</strong><a class="active">Knowledge base</a><a>Provider</a><a>Widget install</a><a>Project settings</a><a>Events</a></aside><div class="admin-preview-main"><div class="preview-table"><div class="preview-heading"><h3>Knowledge base</h3><button type="button">Add document</button></div><table><thead><tr><th>Document</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead><tbody><tr><td>Getting started guide</td><td>PDF</td><td>Ready</td><td>May 12</td></tr><tr><td>Account management</td><td>DOCX</td><td>Ready</td><td>May 11</td></tr><tr><td>Billing rules</td><td>PDF</td><td>Ready</td><td>May 10</td></tr><tr><td>API reference</td><td>MD</td><td>Processing</td><td>May 09</td></tr></tbody></table></div><div class="preview-grid"><div><h3>Provider</h3><p><span>Top 10 AI</span><strong>bring your token</strong><em>Ready</em></p><p><span>OpenAI / Claude / Gemini</span><strong>per workspace</strong><em>Live</em></p><p><span>Groq / DeepSeek / Mistral</span><strong>fast guided help</strong><em>Live</em></p><p><span>xAI / Cohere / Perplexity</span><strong>optional</strong><em>Idle</em></p><p><span>OpenRouter</span><strong>multi-model routing</strong><em>Ready</em></p></div><code>&lt;script src=&quot;/widget/loader.js&quot; data-project-id=&quot;YOUR_PROJECT_ID&quot;&gt;&lt;/script&gt;</code></div></div></div></section>

    <section class="chat-preview-section" id="chat-preview"><div class="chat-preview-copy" data-reveal><h2>Chat that feels like part of the product.</h2><p>The widget keeps the robot friendly, the messages readable, and the step controls close to the action, without taking over the page.</p><a class="product-button primary" href="/demo">Test the widget</a></div><div class="chat-preview-stage" data-reveal><div class="chat-stage-orbit orbit-one" aria-hidden="true"></div><div class="chat-stage-orbit orbit-two" aria-hidden="true"></div><div class="chat-context-card chat-context-knowledge" aria-hidden="true"><span>Knowledge match</span><strong>Team settings</strong></div><div class="chat-context-card chat-context-action" aria-hidden="true"><span>Next action</span><strong>Open Team screen</strong></div><img class="chat-robot-cutout" src="/robot/talking.png" alt="" aria-hidden="true" /><div class="landing-chat-window"><div class="chat-titlebar"><span class="product-mark small-mark"></span><strong>Smartup Guide</strong><button type="button" aria-label="Minimize preview"><i class="fa-solid fa-minus" aria-hidden="true"></i></button></div><div class="chat-body"><p class="assistant-message">Hi. How can I help you today?</p><p class="user-message">How do I add a team member?</p><div class="assistant-card"><strong>Follow these steps</strong><ol><li>Go to Settings, then Team.</li><li>Click Add member.</li><li>Enter email and role.</li></ol></div></div><div class="chat-controls"><span>Step 1 of 3</span><button type="button">Next</button><button type="button">Done</button></div><form class="chat-input-preview"><input aria-label="Chat question preview" placeholder="Ask a question..." /><button type="button">Send</button></form></div></div></section>

    <section class="landing-cta" data-reveal>
      <div><h2>Connect knowledge, tune the widget, and ship guided help.</h2><p>Use the admin workspace to manage identity, provider settings, install snippets, and documents.</p></div>
      <a class="product-button primary" href="/admin">Open admin console</a>
    </section>

    <script>${landingScript()}</script>
  </main>
</body>
</html>`;
}

function landingScript() {
  return `(function(){
var root=document.querySelector(".product-landing");
if(!root)return;
var progress=root.querySelector("[data-scroll-progress]");
var robot=root.querySelector("[data-hero-robot]");
var robotButtons=Array.prototype.slice.call(root.querySelectorAll("[data-robot-state]"));
var navLinks=Array.prototype.slice.call(root.querySelectorAll("[data-nav-link]"));
var sections=navLinks.map(function(link){var id=link.getAttribute("href");return id&&id.indexOf("#")===0?document.querySelector(id):null}).filter(Boolean);
var canUsePointerEffects=!window.matchMedia||!window.matchMedia("(pointer: coarse)").matches;
function updateProgress(){if(!progress)return;var max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);var value=Math.min(1,Math.max(0,window.scrollY/max));progress.style.transform="scaleX("+value+")"}
function updateActiveNav(){if(!sections.length)return;var current=sections[0];sections.forEach(function(section){if(section.getBoundingClientRect().top<160)current=section});navLinks.forEach(function(link){link.classList.toggle("is-active",link.getAttribute("href")==="#"+current.id)})}
function setRobot(button){if(!robot||!button)return;var file=button.getAttribute("data-robot-state");var name=button.getAttribute("data-robot-name")||"Smartup Guide";if(!file)return;robot.src="/robot/"+file;robot.alt=name+" robot state";robotButtons.forEach(function(item){item.classList.toggle("is-active",item===button);item.setAttribute("aria-pressed",item===button?"true":"false")})}
function scheduleFrame(callback){if("requestAnimationFrame" in window){window.requestAnimationFrame(callback);return}callback()}
function bindPreviewMouseEffect(){var preview=root.querySelector(".hero-live-preview");if(!preview||!canUsePointerEffects)return;var frame=0;var target={x:0,y:0};function apply(){frame=0;var x=target.x;var y=target.y;preview.style.setProperty("--mouse-x",(x*22).toFixed(2)+"px");preview.style.setProperty("--mouse-y",(y*18).toFixed(2)+"px");preview.style.setProperty("--mouse-rx",(-y*8).toFixed(2)+"deg");preview.style.setProperty("--mouse-ry",(x*10).toFixed(2)+"deg");preview.style.setProperty("--panel-mouse-x",(x*14).toFixed(2)+"px");preview.style.setProperty("--panel-mouse-y",(y*10).toFixed(2)+"px");preview.style.setProperty("--panel-hover-rx",(-y*3).toFixed(2)+"deg");preview.style.setProperty("--panel-hover-ry",(x*4).toFixed(2)+"deg");preview.style.setProperty("--orbit-mouse-x",(x*10).toFixed(2)+"px");preview.style.setProperty("--orbit-mouse-y",(y*8).toFixed(2)+"px");preview.style.setProperty("--orbit-hover-rx",(-y*4).toFixed(2)+"deg");preview.style.setProperty("--orbit-hover-ry",(x*5).toFixed(2)+"deg")}function queueApply(){if(frame)return;frame=1;scheduleFrame(apply)}preview.addEventListener("pointermove",function(event){var rect=preview.getBoundingClientRect();target.x=Math.max(-.5,Math.min(.5,(event.clientX-rect.left)/rect.width-.5));target.y=Math.max(-.5,Math.min(.5,(event.clientY-rect.top)/rect.height-.5));preview.classList.add("is-pointer-active");queueApply()});preview.addEventListener("pointerleave",function(){target.x=0;target.y=0;preview.classList.remove("is-pointer-active");queueApply()})}
function bindMetricMouseEffect(){if(!canUsePointerEffects)return;var metricCards=Array.prototype.slice.call(root.querySelectorAll(".hero-metric"));function resetMetricCard(card){card.classList.remove("is-pointer-active");card.style.setProperty("--metric-hover-rx","5deg");card.style.setProperty("--metric-hover-ry","var(--metric-tilt)");card.style.setProperty("--metric-glow-x","50%");card.style.setProperty("--metric-glow-y","0%")}root.addEventListener("pointermove",function(event){if(event.target&&event.target.closest&&event.target.closest(".hero-metric"))return;metricCards.forEach(resetMetricCard)},{passive:true});metricCards.forEach(function(card){var frame=0;var target={rx:"5deg",ry:"0deg",gx:"50%",gy:"0%"};function apply(){frame=0;card.style.setProperty("--metric-hover-rx",target.rx);card.style.setProperty("--metric-hover-ry",target.ry);card.style.setProperty("--metric-glow-x",target.gx);card.style.setProperty("--metric-glow-y",target.gy)}function queueApply(){if(frame)return;frame=1;scheduleFrame(apply)}card.addEventListener("pointermove",function(event){var rect=card.getBoundingClientRect();var x=Math.max(-.5,Math.min(.5,(event.clientX-rect.left)/rect.width-.5));var y=Math.max(-.5,Math.min(.5,(event.clientY-rect.top)/rect.height-.5));metricCards.forEach(function(item){if(item!==card)resetMetricCard(item)});target.rx=(-y*9).toFixed(2)+"deg";target.ry=(x*10).toFixed(2)+"deg";target.gx=(50+x*70).toFixed(2)+"%";target.gy=(12+y*70).toFixed(2)+"%";card.classList.add("is-pointer-active");queueApply()});card.addEventListener("pointerleave",function(){target.rx="5deg";target.ry="var(--metric-tilt)";target.gx="50%";target.gy="0%";resetMetricCard(card)})})}
function bindChatMouseEffect(){var stage=root.querySelector(".chat-preview-stage");if(!stage||!canUsePointerEffects)return;var frame=0;var target={x:0,y:0};function apply(){frame=0;var x=target.x;var y=target.y;stage.style.setProperty("--chat-x",(x*18).toFixed(2)+"px");stage.style.setProperty("--chat-y",(y*14).toFixed(2)+"px");stage.style.setProperty("--chat-rx",(-y*5).toFixed(2)+"deg");stage.style.setProperty("--chat-ry",(x*7).toFixed(2)+"deg");stage.style.setProperty("--chat-panel-x",(x*12).toFixed(2)+"px");stage.style.setProperty("--chat-panel-y",(y*10).toFixed(2)+"px");stage.style.setProperty("--chat-panel-rx",(-y*3).toFixed(2)+"deg");stage.style.setProperty("--chat-panel-ry",(x*4).toFixed(2)+"deg")}function queueApply(){if(frame)return;frame=1;scheduleFrame(apply)}stage.addEventListener("pointermove",function(event){var rect=stage.getBoundingClientRect();target.x=Math.max(-.5,Math.min(.5,(event.clientX-rect.left)/rect.width-.5));target.y=Math.max(-.5,Math.min(.5,(event.clientY-rect.top)/rect.height-.5));stage.classList.add("is-pointer-active");queueApply()});stage.addEventListener("pointerleave",function(){target.x=0;target.y=0;stage.classList.remove("is-pointer-active");queueApply()})}
robotButtons.forEach(function(button){button.addEventListener("click",function(){setRobot(button)})});
window.addEventListener("scroll",function(){updateProgress();updateActiveNav()},{passive:true});
window.addEventListener("resize",function(){updateProgress();updateActiveNav()});
updateProgress();
updateActiveNav();
bindPreviewMouseEffect();
bindMetricMouseEffect();
bindChatMouseEffect();
var items=Array.prototype.slice.call(root.querySelectorAll("[data-reveal]"));
if(!("IntersectionObserver" in window)){items.forEach(function(item){item.classList.add("is-visible")});return}
var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(!entry.isIntersecting)return;entry.target.classList.add("is-visible");observer.unobserve(entry.target)})},{threshold:.16,rootMargin:"0px 0px -8% 0px"});
items.forEach(function(item){if(item.getBoundingClientRect().top<window.innerHeight*.94){item.classList.add("is-visible");return}observer.observe(item)})
})();`;
}

function loginHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Smartup Guide Login</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/fontawesome/css/all.min.css" />
  <link rel="stylesheet" href="/preview.css" />
</head>
<body>
  <main class="login-shell">
    <section class="login-copy">
      <div class="login-brand inverse"><span class="brand-mark"></span><div><strong>Smartup Guide</strong><span>AI onboarding for complex web apps</span></div></div>
      <div><span class="eyebrow">Admin console</span><h1>Control your assistant before it reaches users.</h1><p>Manage knowledge, provider status, domain access, and install snippets from a secured workspace.</p></div>
      <div class="login-proof-grid"><span>Signed sessions</span><span>Domain guard</span><span>Provider fallback</span></div>
    </section>
    <section class="login-panel">
      <div class="login-brand"><span class="brand-mark"></span><div><strong>Smartup Guide</strong><span>Secure admin access</span></div></div>
      <div><h1 id="auth-title">Sign in</h1><p id="auth-copy">Access your assistant settings, knowledge, and deployment snippets.</p></div>
      <div class="auth-mode-toggle" role="tablist" aria-label="Authentication mode">
        <button class="active" id="mode-login" type="button">Sign in</button>
        <button id="mode-register" type="button">Register</button>
      </div>
      <form class="login-form" id="login-form">
        <div class="field"><label>Email</label><input autocomplete="email" id="email" placeholder="admin@company.com" type="email" /></div>
        <div class="field"><label>Password</label><input autocomplete="current-password" id="password" placeholder="Enter password" type="password" /></div>
        <div class="field" id="project-field" hidden><label>Workspace name</label><input autocomplete="organization" id="project-name" placeholder="My company assistant" /></div>
        <button class="btn primary login-submit" id="login-submit" type="submit">Sign in</button>
      </form>
      <div class="credential-note">Each registered user receives a separate project ID and keeps their own widget settings.</div>
      <p class="login-status" id="login-status">Sign in or create a workspace.</p>
    </section>
  </main>
  <script>
    const loginForm = document.getElementById('login-form');
    let mode = 'login';
    function setMode(next) {
      mode = next;
      document.getElementById('mode-login').classList.toggle('active', mode === 'login');
      document.getElementById('mode-register').classList.toggle('active', mode === 'register');
      document.getElementById('project-field').hidden = mode !== 'register';
      document.getElementById('auth-title').textContent = mode === 'login' ? 'Sign in' : 'Create workspace';
      document.getElementById('auth-copy').textContent = mode === 'login' ? 'Access your assistant settings, knowledge, and deployment snippets.' : 'Register a user account with its own project settings and widget ID.';
      document.getElementById('login-submit').textContent = mode === 'login' ? 'Sign in' : 'Create account';
      document.getElementById('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
      document.getElementById('password').placeholder = mode === 'login' ? 'Enter password' : 'At least 8 characters';
      document.getElementById('login-status').textContent = mode === 'login' ? 'Sign in to manage your workspace.' : 'Create a new workspace.';
    }
    document.getElementById('mode-login').onclick = () => setMode('login');
    document.getElementById('mode-register').onclick = () => setMode('register');
    loginForm.onsubmit = async event => {
      event.preventDefault();
      document.getElementById('login-status').textContent = mode === 'login' ? 'Checking credentials' : 'Creating workspace';
      document.getElementById('login-submit').disabled = true;
      const response = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.value, password: password.value, projectName: document.getElementById('project-name').value || undefined }) });
      if (response.ok) location.href = '/admin';
      else {
        document.getElementById('login-status').textContent = response.status === 409 ? 'This email already has a workspace. Sign in instead.' : mode === 'login' ? 'Email or password is incorrect.' : 'Could not create the workspace.';
        document.getElementById('login-submit').disabled = false;
      }
    };
  </script>
</body>
</html>`;
}

function adminHtml(session) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Smartup Guide Admin</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/fontawesome/css/all.min.css" />
  <link rel="stylesheet" href="/preview.css" />
</head>
<body>
  <main class="admin-shell admin-console">
    <aside class="sidebar">
      <div class="sidebar-brand"><span class="brand-mark"></span><div><strong>Smartup Guide</strong><span>Admin command center</span></div></div>
      <nav class="sidebar-nav" aria-label="Admin sections">
        <button class="active" data-view="overview" type="button"><i class="nav-icon fa-solid fa-chart-simple" aria-hidden="true"></i><span class="nav-copy"><span class="nav-label">Overview</span><small>Health and next actions</small></span></button>
        <button data-view="providers" type="button"><i class="nav-icon fa-solid fa-brain" aria-hidden="true"></i><span class="nav-copy"><span class="nav-label">AI providers</span><small>Models and tokens</small></span></button>
        <button data-view="knowledge" type="button"><i class="nav-icon fa-solid fa-book-open" aria-hidden="true"></i><span class="nav-copy"><span class="nav-label">Knowledge</span><small>Source documents</small></span></button>
        <button data-view="widget" type="button"><i class="nav-icon fa-solid fa-code" aria-hidden="true"></i><span class="nav-copy"><span class="nav-label">Widget install</span><small>Embed and test</small></span></button>
        <button data-view="settings" type="button"><i class="nav-icon fa-solid fa-sliders" aria-hidden="true"></i><span class="nav-copy"><span class="nav-label">Settings</span><small>Identity and guardrails</small></span></button>
        <button data-view="events" type="button"><i class="nav-icon fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span class="nav-copy"><span class="nav-label">Events</span><small>Runtime activity</small></span></button>
      </nav>
      <div class="sidebar-insight"><span>Runtime</span><strong id="sidebar-runtime">Checking</strong><small id="sidebar-runtime-detail">Loading provider status</small></div>
      <div class="sidebar-user"><span class="user-label">Signed in as</span><span>${session.email}</span><button class="text-button" id="logout" type="button">Sign out</button></div>
    </aside>
    <section class="workspace">
      <div class="admin-topbar">
        <div><span>Workspace</span><strong id="project-id-topbar">demo-project</strong></div>
        <div class="topbar-progress" aria-label="Admin setup progress"><span id="progress-knowledge">Knowledge coverage</span><span id="progress-provider">Runtime provider</span><span id="progress-widget">Widget install</span><span id="progress-domain">Domain guard</span></div>
        <div class="topbar-actions"><span class="status-pill neutral" id="provider-pill">Checking</span><a class="btn" href="/demo" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>Open demo</a></div>
      </div>
      <header class="workspace-header">
        <div class="workspace-identity">
          <span class="workspace-kicker" id="view-context">Smartup SFA Assistant</span>
          <h1 id="view-title">Workspace overview</h1>
          <p id="view-copy">A clean command center for project health, knowledge coverage, AI status, and the next admin task.</p>
          <div class="admin-health-row" aria-label="Workspace summary"><span id="project-domain-health">No domain lock</span><span id="document-ratio-health">0 enabled documents</span><span id="knowledge-words-health">0 knowledge words</span><span id="event-count-health">0 events</span></div>
        </div>
        <div class="workspace-header-side">
          <div class="workspace-snapshot"><div><span>Active runtime</span><strong id="runtime-snapshot">Checking</strong></div><div><span>Last activity</span><strong id="activity-snapshot">No events yet</strong></div></div>
          <div class="header-actions"><button class="btn primary" id="new-document" type="button"><i class="fa-solid fa-plus" aria-hidden="true"></i>New document</button><button class="btn" id="header-rules-fallback" type="button" hidden><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Rules fallback</button><button class="btn primary" id="header-copy-snippet" type="button" hidden><i class="fa-solid fa-copy" aria-hidden="true"></i>Copy snippet</button></div>
        </div>
      </header>
      <section class="admin-view-shell">
        <section class="admin-view" data-view-panel="overview" id="overview">
          <section class="metric-grid">
            <div class="metric-card"><i class="metric-icon fa-solid fa-diagram-project" aria-hidden="true"></i><span class="metric-label">Project</span><strong id="project-id">demo-project</strong><p id="project-domain">No domain lock</p></div>
            <div class="metric-card"><i class="metric-icon fa-solid fa-book-open" aria-hidden="true"></i><span class="metric-label">Knowledge</span><strong id="document-ratio">0/0</strong><p id="knowledge-detail">0 indexed words</p></div>
            <div class="metric-card"><i class="metric-icon fa-solid fa-brain" aria-hidden="true"></i><span class="metric-label">AI provider</span><strong id="ai-provider">Checking</strong><p id="ai-model">Loading provider status</p></div>
            <div class="metric-card"><i class="metric-icon fa-solid fa-wave-square" aria-hidden="true"></i><span class="metric-label">Activity</span><strong id="event-count">0</strong><p id="status">Loading workspace</p></div>
          </section>
          <section class="overview-workbench">
            <section class="surface launch-panel"><div class="surface-header compact"><div><h2>Launch readiness</h2><p>Fast path for the settings that affect the live widget.</p></div><span class="readiness-score" id="readiness-score">0/4</span></div><div class="task-stack" id="launch-checklist"></div></section>
            <section class="surface activity-panel"><div class="surface-header compact"><div><h2>Recent activity</h2><p>Latest events from the embedded assistant.</p></div><button class="btn" data-view-go="events" type="button">View all</button></div><div class="event-list compact-events" id="overview-events"></div></section>
          </section>
          <section class="admin-view-grid" aria-label="Admin workspace sections">
            <button class="admin-action-card" data-view-go="providers" type="button"><i class="admin-action-icon fa-solid fa-brain" aria-hidden="true"></i><strong>AI providers</strong><p id="overview-provider-copy">Provider catalog loading.</p><small id="overview-provider-status">Checking</small></button>
            <button class="admin-action-card" data-view-go="knowledge" type="button"><i class="admin-action-icon fa-solid fa-book-open" aria-hidden="true"></i><strong>Knowledge base</strong><p>Edit approved documents, tags, and availability for the assistant.</p><small id="overview-knowledge-status">0 active documents</small></button>
            <button class="admin-action-card" data-view-go="widget" type="button"><i class="admin-action-icon fa-solid fa-code" aria-hidden="true"></i><strong>Widget install</strong><p>Copy the embed snippet and test it on the demo page.</p><small id="overview-widget-status">demo-project</small></button>
            <button class="admin-action-card" data-view-go="settings" type="button"><i class="admin-action-icon fa-solid fa-gear" aria-hidden="true"></i><strong>Settings</strong><p>Manage project identity, domain guard, accent, and logo text.</p><small id="overview-settings-status">No domain lock</small></button>
            <button class="admin-action-card" data-view-go="events" type="button"><i class="admin-action-icon fa-solid fa-clock-rotate-left" aria-hidden="true"></i><strong>Events</strong><p>Open the latest runtime activity without scrolling through other tools.</p><small id="overview-events-status">0 recent events</small></button>
            <button class="admin-action-card danger-card" data-view-go="settings" id="overview-reset-card" type="button"><i class="admin-action-icon fa-solid fa-rotate-left" aria-hidden="true"></i><strong>Reset demo</strong><p>Clear changed settings, knowledge edits, events, guides, and provider tokens.</p><small>Available in Settings</small></button>
          </section>
        </section>
        <section class="admin-view surface ai-console-surface" data-view-panel="providers" id="providers" hidden>
          <div class="surface-header ai-console-header"><div><h2>AI provider connections</h2><p>Each workspace can bring its own API token and choose the active model.</p></div><div class="ai-console-actions"><span class="status-pill neutral" id="provider-pill-main">Checking</span><button class="btn" id="rules-fallback" type="button"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Rules fallback</button></div></div>
          <div class="provider-command-bar"><div class="runtime-summary-card"><span class="metric-label">Current runtime</span><strong id="runtime-summary">Checking</strong><p id="runtime-summary-detail">Loading provider status</p></div><div class="provider-mini-stat"><span>Connected</span><strong id="provider-connected-count">0/10</strong></div><div class="provider-mini-stat"><span>Available catalog</span><strong id="provider-total-count">10</strong></div><div class="provider-mini-stat"><span>Fallback</span><strong>Rules</strong></div></div>
          <div class="ai-provider-grid" id="provider-grid"></div>
        </section>
        <section class="admin-view surface knowledge-surface" data-view-panel="knowledge" id="knowledge" hidden>
          <div class="surface-header"><div><h2>Knowledge base</h2><p>Enabled documents are the assistant source of truth.</p></div><div class="surface-actions"><input class="compact-input" id="document-filter" placeholder="Filter documents" /><button class="btn" id="new-document-secondary" type="button">New</button></div></div>
          <div class="knowledge-stats-row"><div><span>Enabled</span><strong id="knowledge-enabled-count">0</strong></div><div><span>Total docs</span><strong id="knowledge-total-count">0</strong></div><div><span>Words</span><strong id="knowledge-word-count">0</strong></div><div><span>Showing</span><strong id="knowledge-showing-count">0</strong></div></div>
          <div class="knowledge-layout"><div class="document-list" id="document-list"></div><div class="editor-pane document-editor-panel" id="editor"></div></div>
        </section>
        <section class="admin-view admin-split-grid" data-view-panel="widget" id="widget" hidden>
          <section class="surface widget-install-panel"><div class="surface-header compact"><div><h2>Widget install</h2><p>Use this script on approved pages.</p></div><span class="status-pill success">Ready to embed</span></div><code class="snippet" id="snippet"></code><div class="install-checklist" id="install-checklist"></div><div class="actions"><button class="btn primary" id="copy-snippet" type="button"><i class="fa-solid fa-copy" aria-hidden="true"></i>Copy snippet</button><a class="btn" href="/demo" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>Test widget</a></div></section>
          <section class="surface widget-runtime-panel"><div class="surface-header compact"><div><h2>Runtime status</h2><p>Active model and fallback state.</p></div></div><div class="provider-status-row"><span class="status-pill neutral" id="provider-pill-secondary">Checking</span><small id="provider-detail">Loading provider status</small></div><div class="widget-preview-card" aria-hidden="true"><div class="chat-titlebar"><span class="product-mark small-mark"></span><strong id="widget-preview-title">smartup Guide</strong><button type="button" tabindex="-1"><i class="fa-solid fa-minus" aria-hidden="true"></i></button></div><div class="widget-preview-body"><p class="assistant-message">Hi. I can answer from your knowledge base.</p><div class="assistant-card"><strong>Source ready</strong><span id="widget-preview-docs">0 enabled documents</span></div></div></div><button class="btn" data-view-go="providers" type="button"><i class="fa-solid fa-brain" aria-hidden="true"></i>Manage providers</button></section>
        </section>
        <section class="admin-view surface settings-surface" data-view-panel="settings" id="settings" hidden>
          <div class="surface-header compact"><div><h2>Project settings</h2><p>Keep rollout identity consistent.</p></div></div><div class="settings-layout"><section class="settings-form-panel"><div class="field"><label>Project name</label><input id="settings-name" /></div><div class="field"><label>Allowed domain</label><input id="settings-domain" placeholder="example.com" /></div><div class="grid two compact-grid"><div class="field"><label>Accent</label><input id="settings-accent" type="color" /></div><div class="field"><label>Logo text</label><input id="settings-logo" /></div></div><button class="btn primary" id="save-settings" type="button"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>Save settings</button></section><section class="settings-preview-card" aria-label="Workspace identity preview"><span class="metric-label">Preview</span><div class="settings-preview-brand"><span class="brand-mark"></span><div><strong id="settings-preview-logo">smartup Guide</strong><small id="settings-preview-name">Demo Project</small></div></div><div class="settings-preview-accent" id="settings-preview-accent"></div><p id="settings-preview-domain">Runs without a domain lock.</p></section></div>
          <section class="demo-reset-panel" id="demo-reset-panel" aria-labelledby="demo-reset-title"><div><span class="metric-label">Danger zone</span><h3 id="demo-reset-title">Reset demo project</h3><p>Restores the demo back to the clean Northstar Retail seed. This clears knowledge edits, events, guides, provider tokens, and project settings for the demo workspace.</p></div><div class="demo-reset-actions"><div class="field"><label>Type RESET_DEMO</label><input autocomplete="off" id="reset-confirm" placeholder="RESET_DEMO" /></div><button class="btn danger" id="reset-demo" type="button" disabled>Reset demo</button></div></section>
        </section>
        <section class="admin-view surface events-surface" data-view-panel="events" id="events-view" hidden>
          <div class="surface-header compact"><div><h2>Recent events</h2><p>Latest widget activity.</p></div></div><div class="event-list event-timeline" id="events"></div>
        </section>
      </section>
    </section>
  </main>
  <script src="/preview-admin.js"></script>
</body>
</html>`;
}

function demoHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Northstar Retail Demo</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/fontawesome/css/all.min.css" />
  <link rel="stylesheet" href="/preview.css" />
</head>
<body>
  <main class="shell demo-workspace">
    <header class="demo-topbar">
      <div class="demo-brand"><span class="brand-mark"></span><div><strong>Northstar Retail</strong><span>Demo project</span></div></div>
      <nav class="demo-nav" aria-label="Demo project modules"><button class="active" data-module="users" data-guide="nav-users" type="button">Users</button><button data-module="orders" data-guide="nav-orders" type="button">Sales orders</button><button data-module="inventory" data-guide="nav-inventory" type="button">Inventory</button><button data-module="reports" data-guide="nav-reports" type="button">Reports</button></nav>
      <div class="demo-user-chip" data-guide="account-menu">AT</div>
    </header>
    <section class="demo-hero">
      <div class="demo-hero-copy"><h1>Practice guided work inside a real demo project.</h1><p>Use the Smartup Guide widget on this page to add users, create orders, manage inventory, and export reports.</p><div class="demo-status-row"><span id="demo-user-count">5 users</span><span id="demo-order-count">3 orders</span><span id="demo-low-stock-count">2 low-stock items</span></div></div>
      <aside class="demo-practice-panel"><strong>Try these assistant requests</strong><span>Ask: How do I add a new user?</span><span>Ask: Create a sales order</span><span>Ask: Show low stock products</span><span>Ask: Export the weekly report</span></aside>
    </section>
    <section class="demo-shell-grid">
      <aside class="demo-side-rail"><span>Workspace</span><button class="active" data-module="users" data-guide="side-nav-users" type="button">Users</button><button data-module="orders" data-guide="side-nav-orders" type="button">Sales orders</button><button data-module="inventory" data-guide="side-nav-inventory" type="button">Inventory</button><button data-module="reports" data-guide="side-nav-reports" type="button">Reports</button></aside>
      <section class="demo-main-panel">
        <section class="demo-module" data-panel="users">
          <div class="demo-module-header"><div><h2>User management</h2><p>Create teammates, filter roles, and check access status.</p></div><button class="btn primary" data-guide="create-user" data-open-modal="user" type="button">Create user</button></div>
          <div class="demo-filters"><input aria-label="Search users" data-guide="search-users" id="user-search" placeholder="Search users..." /><select aria-label="Role filter" data-guide="role-filter" id="role-filter"><option>All roles</option><option>Admin</option><option>Manager</option><option>Merchandiser</option><option>Operator</option><option>User</option></select><select aria-label="Status filter" data-guide="status-filter" id="status-filter"><option>All statuses</option><option>Active</option><option>Invited</option><option>Paused</option></select></div>
          <div class="demo-table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Region</th><th>Status</th></tr></thead><tbody id="users-body"></tbody></table></div>
        </section>
        <section class="demo-module" data-panel="orders" hidden>
          <div class="demo-module-header"><div><h2>Sales orders</h2><p>Build a customer order and move it from draft to fulfillment.</p></div><button class="btn primary" data-guide="create-order" data-open-modal="order" type="button">Create order</button></div>
          <div class="demo-filters"><select aria-label="Order status filter" data-guide="order-status-filter" id="order-status"><option>All statuses</option><option>Draft</option><option>Picking</option><option>Ready</option></select></div>
          <div class="demo-table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Owner</th><th>Total</th><th>Status</th></tr></thead><tbody id="orders-body"></tbody></table></div>
        </section>
        <section class="demo-module" data-panel="inventory" hidden>
          <div class="demo-module-header"><div><h2>Inventory control</h2><p>Find low stock items and submit restock updates.</p></div><button class="btn primary" data-guide="restock-product" data-open-modal="stock" type="button">Restock product</button></div>
          <div class="demo-filters"><button class="btn primary" data-inventory-mode="All products" data-guide="all-products" type="button">All products</button><button class="btn" data-inventory-mode="Low stock" data-guide="low-stock-filter" type="button">Low stock</button></div>
          <div class="demo-table-wrap"><table><thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Stock</th><th>Reorder point</th><th>Status</th></tr></thead><tbody id="products-body"></tbody></table></div>
        </section>
        <section class="demo-module" data-panel="reports" hidden>
          <div class="demo-module-header"><div><h2>Reports</h2><p>Review operating metrics and export the weekly report.</p></div><button class="btn primary" data-guide="export-report" type="button">Export report</button></div>
          <div class="demo-report-grid"><article><span>Revenue</span><strong>$42.8k</strong><small>+12% this week</small></article><article><span>Orders ready</span><strong id="ready-orders">1</strong><small>Fulfillment queue</small></article><article><span>Low stock</span><strong id="low-stock-total">2</strong><small>Needs attention</small></article></div>
        </section>
      </section>
    </section>
    <div class="modal-backdrop" id="modal" hidden><form class="modal demo-modal" id="demo-form"></form></div>
  </main>
  <script>
    let users=[["Alan Lasseter","alan@northstar.demo","Manager","Tashkent","Active"],["Ava Karimova","ava@northstar.demo","Admin","Samarkand","Active"],["Bale Cristian","bale@northstar.demo","Merchandiser","Tashkent","Invited"],["Dilafruz Saidova","dilafruz@northstar.demo","Operator","Bukhara","Active"],["Firemaker Store","store@northstar.demo","User","Fergana","Paused"]];
    let orders=[["SO-1048","Makro Market","Sparkling water","Alan Lasseter","$4,820","Ready"],["SO-1049","Family Shop","Coffee mix","Ava Karimova","$2,140","Picking"],["SO-1050","Bravo Retail","Chocolate bar","Dilafruz Saidova","$1,775","Draft"]];
    let products=[["SKU-2401","Sparkling water","Beverages",184,80,"Healthy"],["SKU-8830","Coffee mix","Grocery",42,60,"Low stock"],["SKU-3921","Chocolate bar","Snacks",318,120,"Healthy"],["SKU-7642","Paper cups","Supplies",24,50,"Low stock"]];
    let inventoryMode='All products';
    const modal=document.getElementById('modal');
    const form=document.getElementById('demo-form');
    function stateBadge(value){return '<span class="demo-state '+(value==='Active'||value==='Ready'||value==='Healthy'?'success':value==='Paused'||value==='Low stock'?'warning':'')+'">'+value+'</span>'}
    function renderUsers(){const q=(document.getElementById('user-search').value||'').toLowerCase();const role=document.getElementById('role-filter').value;const status=document.getElementById('status-filter').value;document.getElementById('users-body').innerHTML=users.filter(row=>(!q||row.join(' ').toLowerCase().includes(q))&&(role==='All roles'||row[2]===role)&&(status==='All statuses'||row[4]===status)).map(row=>'<tr><td>'+row[0]+'</td><td>'+row[1]+'</td><td>'+row[2]+'</td><td>'+row[3]+'</td><td>'+stateBadge(row[4])+'</td></tr>').join('');document.getElementById('demo-user-count').textContent=users.length+' users';}
    function renderOrders(){const status=document.getElementById('order-status').value;document.getElementById('orders-body').innerHTML=orders.filter(row=>status==='All statuses'||row[5]===status).map(row=>'<tr><td>'+row[0]+'</td><td>'+row[1]+'</td><td>'+row[2]+'</td><td>'+row[3]+'</td><td>'+row[4]+'</td><td>'+stateBadge(row[5])+'</td></tr>').join('');document.getElementById('demo-order-count').textContent=orders.length+' orders';document.getElementById('ready-orders').textContent=orders.filter(row=>row[5]==='Ready').length;}
    function renderProducts(){document.getElementById('products-body').innerHTML=products.filter(row=>inventoryMode==='All products'||row[5]==='Low stock').map(row=>'<tr><td>'+row[0]+'</td><td>'+row[1]+'</td><td>'+row[2]+'</td><td>'+row[3]+'</td><td>'+row[4]+'</td><td>'+stateBadge(row[5])+'</td></tr>').join('');const low=products.filter(row=>row[5]==='Low stock').length;document.getElementById('demo-low-stock-count').textContent=low+' low-stock items';document.getElementById('low-stock-total').textContent=low;}
    function renderAll(){renderUsers();renderOrders();renderProducts();}
    function setModule(module){document.querySelectorAll('[data-module]').forEach(btn=>btn.classList.toggle('active',btn.dataset.module===module));document.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==module);}
    function closeModal(){modal.hidden=true;form.innerHTML='';}
    function openModal(kind){modal.hidden=false;if(kind==='user'){form.innerHTML='<h2>Create user</h2><div class="field"><label>Full name</label><input data-guide="user-name" name="name" placeholder="Enter full name"></div><div class="field"><label>Email</label><input data-guide="user-email" name="email" placeholder="name@northstar.demo" type="email"></div><div class="grid two compact-grid"><div class="field"><label>Role</label><select data-guide="user-role" name="role"><option>User</option><option>Admin</option><option>Manager</option><option>Merchandiser</option><option>Operator</option></select></div><div class="field"><label>Region</label><select data-guide="user-region" name="region"><option>Tashkent</option><option>Samarkand</option><option>Bukhara</option><option>Fergana</option></select></div></div><div class="actions"><button class="btn primary" data-guide="save-user" type="submit">Save user</button><button class="btn" data-cancel type="button">Cancel</button></div>';form.onsubmit=e=>{e.preventDefault();const data=new FormData(form);const name=String(data.get('name')||'New teammate');users.unshift([name,String(data.get('email')||'new@northstar.demo'),String(data.get('role')||'User'),String(data.get('region')||'Tashkent'),'Invited']);closeModal();renderAll();};}if(kind==='order'){form.innerHTML='<h2>Create order</h2><div class="field"><label>Customer</label><input data-guide="order-customer" name="customer" placeholder="Customer name"></div><div class="field"><label>Product</label><select data-guide="order-product" name="product"><option>Sparkling water</option><option>Coffee mix</option><option>Chocolate bar</option><option>Paper cups</option></select></div><div class="grid two compact-grid"><div class="field"><label>Quantity</label><input data-guide="order-quantity" min="1" name="quantity" placeholder="120" type="number"></div><div class="field"><label>Owner</label><select data-guide="order-owner" name="owner"><option>Alan Lasseter</option><option>Ava Karimova</option><option>Dilafruz Saidova</option></select></div></div><div class="actions"><button class="btn primary" data-guide="save-order" type="submit">Save order</button><button class="btn" data-cancel type="button">Cancel</button></div>';form.onsubmit=e=>{e.preventDefault();const data=new FormData(form);orders.unshift(['SO-'+(1051+orders.length),String(data.get('customer')||'New customer'),String(data.get('product')||'Sparkling water'),String(data.get('owner')||'Alan Lasseter'),'$1,260','Draft']);closeModal();renderAll();};}if(kind==='stock'){form.innerHTML='<h2>Restock product</h2><div class="field"><label>Product SKU</label><select data-guide="stock-sku" name="sku"><option value="SKU-8830">SKU-8830 - Coffee mix</option><option value="SKU-7642">SKU-7642 - Paper cups</option><option value="SKU-2401">SKU-2401 - Sparkling water</option></select></div><div class="field"><label>Quantity to add</label><input data-guide="stock-quantity" min="1" name="quantity" placeholder="120" type="number"></div><div class="actions"><button class="btn primary" data-guide="save-stock" type="submit">Save stock update</button><button class="btn" data-cancel type="button">Cancel</button></div>';form.onsubmit=e=>{e.preventDefault();const data=new FormData(form);const sku=String(data.get('sku')||'SKU-8830');const qty=Number(data.get('quantity')||120);products=products.map(row=>row[0]===sku?[row[0],row[1],row[2],Number(row[3])+qty,row[4],Number(row[3])+qty<=Number(row[4])?'Low stock':'Healthy']:row);closeModal();renderAll();};}}
    document.addEventListener('click',event=>{const moduleButton=event.target.closest('[data-module]');if(moduleButton)setModule(moduleButton.dataset.module);const opener=event.target.closest('[data-open-modal]');if(opener)openModal(opener.dataset.openModal);if(event.target.closest('[data-cancel]'))closeModal();const modeButton=event.target.closest('[data-inventory-mode]');if(modeButton){inventoryMode=modeButton.dataset.inventoryMode;document.querySelectorAll('[data-inventory-mode]').forEach(btn=>btn.classList.toggle('primary',btn===modeButton));renderProducts();}});
    document.getElementById('user-search').oninput=renderUsers;document.getElementById('role-filter').onchange=renderUsers;document.getElementById('status-filter').onchange=renderUsers;document.getElementById('order-status').onchange=renderOrders;renderAll();
  </script>
  <script>
    try {
      localStorage.setItem("ai-guide-widget:demo-project:docked", "1");
      localStorage.removeItem("ai-guide-widget:demo-project:position");
    } catch (error) {}
  </script>
  <script src="/widget/loader.js" data-project-id="demo-project"></script>
</body>
</html>`;
}

function previewCss() {
  return readFileSync(path.join(adminDir, "app", "globals.css"), "utf8");
}

function adminExtraCss() {
  return "";
}

function adminJs() {
  return `let project=null, selected=null; const $=id=>document.getElementById(id);
function aiLabel(ai){if(!ai)return 'Checking'; if(!ai.configured)return ai.active+' fallback'; if(!ai.lastError)return ai.active+' connected'; if(/RESOURCE_EXHAUSTED|quota/i.test(ai.lastError))return ai.active+' quota, rules fallback'; if(/UNAVAILABLE|high demand/i.test(ai.lastError))return ai.active+' busy, rules fallback'; return ai.active+' fallback';}
function aiDetail(ai){if(!ai)return 'rules'; if(!ai.lastError)return ai.model; if(/RESOURCE_EXHAUSTED|quota/i.test(ai.lastError))return ai.model+' | quota exceeded'; if(/UNAVAILABLE|high demand/i.test(ai.lastError))return ai.model+' | high demand'; return ai.model+' | '+String(ai.lastError).slice(0,90);}
async function load(){const r=await fetch('/api/admin/project'); project=await r.json(); selected=project.guides[0]; render(); const ai=await fetch('/api/ai/status').then(r=>r.json()); $('ai-provider').textContent=aiLabel(ai); $('ai-model').textContent=aiDetail(ai); $('ai-dot').classList.toggle('muted',!ai.configured||Boolean(ai.lastError));}
function render(){ $('project-name').textContent=project.name; $('project-id').textContent=project.publicId; $('guide-count').textContent=project.guides.length; $('snippet').textContent='<script src="'+location.origin+'/widget/loader.js" data-project-id="'+project.publicId+'"><\\/script>'; $('guide-tabs').innerHTML=project.guides.map(g=>'<button class="btn" data-slug="'+g.slug+'">'+g.title+'</button>').join('')+'<button class="btn" data-new="1">New guide</button>'; $('guide-tabs').onclick=e=>{const b=e.target.closest('button'); if(!b)return; if(b.dataset.new){selected={slug:'new-guide',title:'New guide',intent:'Guide the user through a task',aliases:['help'],urlPattern:'/demo',steps:[{target:\"[data-guide='create-user']\",message:'Click the Create button.',robotState:'pointing',placement:'auto',waitFor:'click'}]}} else selected=project.guides.find(g=>g.slug===b.dataset.slug); renderEditor();}; $('events').innerHTML=project.events.length?project.events.map(e=>'<div class="guide-card"><strong>'+e.type+'</strong><br><span>'+((e.guideSlug)||'no guide')+' · '+((e.path)||'unknown')+'</span></div>').join(''):'<p>No events yet.</p>'; renderEditor();}
function renderEditor(){if(!selected)return; $('editor').innerHTML='<div class="field"><label>Slug</label><input id="slug" value="'+selected.slug+'"></div><div class="field"><label>Title</label><input id="title" value="'+selected.title+'"></div><div class="field"><label>Intent</label><textarea id="intent">'+selected.intent+'</textarea></div><div class="field"><label>Aliases</label><input id="aliases" value="'+selected.aliases.join(', ')+'"></div>'+selected.steps.map((s,i)=>'<div class="guide-card"><strong>Step '+(i+1)+'</strong><div class="field"><label>Target selector</label><input data-step="'+i+'" data-key="target" value="'+s.target.replaceAll('"','&quot;')+'"></div><div class="field"><label>Message</label><textarea data-step="'+i+'" data-key="message">'+s.message+'</textarea></div></div>').join('')+'<div class="actions"><button class="btn primary" id="save">Save guide</button><button class="btn" id="add-step">Add step</button></div>'; $('save').onclick=save; $('add-step').onclick=()=>{selected.steps.push({target:\"[data-guide='create-user']\",message:'Next instruction',robotState:'talking',placement:'auto',waitFor:'manual'});renderEditor();}; $('editor').oninput=e=>{const t=e.target;if(t.id==='slug')selected.slug=t.value;if(t.id==='title')selected.title=t.value;if(t.id==='intent')selected.intent=t.value;if(t.id==='aliases')selected.aliases=t.value.split(',').map(x=>x.trim()).filter(Boolean);if(t.dataset.step)selected.steps[Number(t.dataset.step)][t.dataset.key]=t.value;};}
async function save(){await fetch('/api/admin/guides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project.publicId,...selected})});$('status').textContent='Guide saved';await load();}
$('pick-target').onclick=()=>window.open('/demo?guideEdit=1','ai-guide-edit','width=1280,height=860'); window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.type!=='AI_GUIDE_SELECTOR_PICKED')return; if(selected){selected.steps[0].target=e.data.selector; renderEditor(); $('status').textContent='Selected target: '+e.data.selector;}}); load();`;
}

function adminDocumentJs() {
  return `let project=null, selected=null, aiState=null, providerDrafts={}, activeView='overview'; const $=id=>document.getElementById(id);
const emptyDoc={id:'',title:'New knowledge document',content:'',tags:['smartup'],enabled:true};
const viewMeta={overview:['Workspace overview','A clean command center for project health, knowledge coverage, AI status, and the next admin task.'],providers:['AI provider connections','Connect a token for any supported provider, tune the model, and choose the active runtime.'],knowledge:['Knowledge base','Edit the documents the assistant uses as its source of truth.'],widget:['Widget install','Copy the embed snippet, test the widget, and confirm the active runtime before rollout.'],settings:['Project settings','Keep workspace identity, domain access, accent color, and logo text consistent.'],events:['Recent events','Review the latest widget activity and runtime guide events.']};
const views=Object.keys(viewMeta);
function esc(value){return String(value||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function aiLabel(ai){if(!ai)return 'Checking'; if(!ai.configured)return String(ai.active||'').toLowerCase()==='rules'?'Rules fallback':ai.active+' rules fallback'; if(ai.lastError)return ai.active+' degraded'; return ai.active+' live';}
function aiDetail(ai){if(!ai)return 'Loading provider status'; return ai.lastError||ai.model;}
function aiTone(ai){if(!ai)return 'neutral'; if(ai.lastError)return 'warning'; if(!ai.configured)return 'muted'; return 'success';}
function documentWords(doc){return String((doc.content||'').trim().split(/\\s+/).filter(Boolean).length)+' words';}
function wordCount(doc){return (doc.content||'').trim().split(/\\s+/).filter(Boolean).length;}
function totalWords(){return (project?.documents||[]).reduce((sum,doc)=>sum+wordCount(doc),0);}
function eventType(value){return String(value||'').replace(/[_-]/g,' ').replace(/\\s+/g,' ').trim().replace(/\\b\\w/g,match=>match.toUpperCase())||'Runtime Event';}
function eventTime(value){const date=new Date(value); return Number.isNaN(date.getTime())?'Unknown time':date.toLocaleString();}
function setDone(id,done){const el=$(id); if(el)el.classList.toggle('done',Boolean(done));}
function setText(id,value){const el=$(id); if(el)el.textContent=value;}
async function authed(url,options){const response=await fetch(url,options); if(response.status===401){location.href='/login'; throw new Error('unauthorized');} return response;}
function setStatus(value){$('status').textContent=value;}
function snippet(){return project?.publicId?'<script src="'+location.origin+'/widget/loader.js" data-project-id="'+project.publicId+'"><\\/script>':'';}
function setView(next,skipHash){if(!viewMeta[next])next='overview'; activeView=next; document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===next);button.setAttribute('aria-current',button.dataset.view===next?'page':'false')}); document.querySelectorAll('[data-view-panel]').forEach(panel=>{const active=panel.dataset.viewPanel===next;panel.hidden=!active;panel.classList.toggle('active',active)}); const meta=viewMeta[next]||viewMeta.overview; $('view-title').textContent=meta[0]; $('view-copy').textContent=meta[1]; $('view-context').textContent=project?.name||'Smartup SFA Assistant'; $('new-document').hidden=!(next==='overview'||next==='knowledge'); $('header-rules-fallback').hidden=next!=='providers'; $('header-copy-snippet').hidden=next!=='widget'; if(!skipHash&&location.hash!=='#'+next)history.replaceState(null,'',location.pathname+location.search+'#'+next);}
function initialView(){const next=location.hash.replace('#','');setView(views.includes(next)?next:'overview',true);}
function syncProviderDrafts(){(aiState?.providers||[]).forEach(p=>{providerDrafts[p.provider]=providerDrafts[p.provider]||{apiKey:'',model:p.model||p.defaultModel,enabled:p.enabled}; if(!providerDrafts[p.provider].model)providerDrafts[p.provider].model=p.model||p.defaultModel;});}
async function load(preferredId){const response=await authed('/api/admin/project'); project=await response.json(); selected=project.documents.find(d=>d.id===preferredId)||project.documents[0]||{...emptyDoc,tags:[...emptyDoc.tags]}; const aiResponse=await authed('/api/ai/provider'); if(aiResponse.ok) aiState=await aiResponse.json(); syncProviderDrafts(); render(); setStatus('Ready');}
function render(){
const enabled=project.documents.filter(d=>d.enabled).length;
const total=project.documents.length;
const words=totalWords();
const providers=aiState?.providers||[];
const connected=providers.filter(p=>p.hasToken).length;
const activeProvider=providers.find(p=>p.active);
const latest=project.events[0];
$('view-context').textContent=project.name;
$('project-id').textContent=project.publicId;
$('project-id-topbar').textContent=project.publicId;
$('project-domain').textContent=project.domain||'No domain lock';
$('project-domain-health').textContent=project.domain||'No domain lock';
$('document-ratio').textContent=enabled+'/'+total;
$('document-ratio-health').textContent=enabled+' enabled documents';
$('knowledge-detail').textContent=words.toLocaleString()+' indexed words';
$('knowledge-words-health').textContent=words.toLocaleString()+' knowledge words';
$('event-count').textContent=project.events.length;
$('event-count-health').textContent=project.events.length+' events';
$('status').textContent=latest?eventTime(latest.createdAt):$('status').textContent;
$('activity-snapshot').textContent=latest?eventType(latest.type):'No events yet';
$('snippet').textContent=snippet();
const label=aiLabel(aiState);
const detail=aiDetail(aiState);
$('ai-provider').textContent=label;
$('ai-model').textContent=detail;
$('provider-detail').textContent=detail;
$('sidebar-runtime').textContent=label;
$('sidebar-runtime-detail').textContent=detail;
$('runtime-snapshot').textContent=activeProvider?.name||label;
$('runtime-summary').textContent=activeProvider?.name||label;
$('runtime-summary-detail').textContent=detail;
$('provider-connected-count').textContent=(providers.length?connected+'/'+providers.length:'0/10');
$('provider-total-count').textContent=String(providers.length||10);
['provider-pill','provider-pill-main','provider-pill-secondary'].forEach(id=>{const el=$(id); el.textContent=label; el.className='status-pill '+aiTone(aiState);});
$('overview-provider-copy').textContent=(providers.length?connected+'/'+providers.length:'0/10')+' providers connected. Each workspace can use its own token.';
$('overview-provider-status').textContent=label;
$('overview-knowledge-status').textContent=enabled+' active documents';
$('overview-widget-status').textContent=project.publicId;
$('overview-settings-status').textContent=project.domain||'No domain lock';
$('overview-events-status').textContent=project.events.length+' recent events';
$('knowledge-enabled-count').textContent=String(enabled);
$('knowledge-total-count').textContent=String(total);
$('knowledge-word-count').textContent=words.toLocaleString();
$('widget-preview-docs').textContent=enabled+' enabled documents';
$('widget-preview-title').textContent=(project.theme?.logoText||'smartup')+' Guide';
$('settings-name').value=project.name;
$('settings-domain').value=project.domain||'';
$('settings-accent').value=project.theme?.accent||'#2563eb';
$('settings-logo').value=project.theme?.logoText||'smartup';
$('settings-preview-logo').textContent=($('settings-logo').value||'smartup')+' Guide';
$('settings-preview-name').textContent=project.name;
$('settings-preview-domain').textContent=project.domain?'Allowed on '+project.domain:'Runs without a domain lock.';
$('settings-preview-accent').style.background=$('settings-accent').value;
setDone('progress-knowledge',enabled>0);
setDone('progress-provider',Boolean(aiState?.configured&&!aiState.lastError));
setDone('progress-widget',Boolean(project.publicId));
setDone('progress-domain',Boolean(project.domain));
$('readiness-score').textContent=[enabled>0,Boolean(aiState?.configured&&!aiState.lastError),Boolean(project.publicId),Boolean(project.domain)].filter(Boolean).length+'/4';
$('launch-checklist').innerHTML=[
['fa-book-open','Knowledge coverage',total?enabled+'/'+total+' documents enabled':'Add the first document',enabled>0,'knowledge'],
['fa-brain','Runtime provider',aiState?.configured?String(aiState.active)+' ready':'Rules fallback is active',Boolean(aiState?.configured&&!aiState.lastError),'providers'],
['fa-code','Widget install','Snippet points to '+project.publicId,Boolean(project.publicId),'widget'],
['fa-shield-halved','Domain guard',project.domain||'No domain lock configured',Boolean(project.domain),'settings']
].map(item=>'<button class="task-row '+(item[3]?'done':'')+'" data-view-go="'+item[4]+'" type="button"><i class="fa-solid '+item[0]+'" aria-hidden="true"></i><span><strong>'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></span><em>'+(item[3]?'Ready':'Review')+'</em></button>').join('');
$('install-checklist').innerHTML='<span><i class="fa-solid fa-check" aria-hidden="true"></i>Project ID attached</span><span><i class="fa-solid fa-check" aria-hidden="true"></i>Loader hosted locally</span><span><i class="fa-solid '+(project.domain?'fa-check':'fa-lock-open')+'" aria-hidden="true"></i>'+(project.domain?'Domain guard enabled':'No domain guard')+'</span>';
const isDemo=project.publicId==='demo-project';
$('overview-reset-card').hidden=!isDemo;
$('demo-reset-panel').hidden=!isDemo;
renderProviders();
renderDocuments();
renderEditor();
renderEvents();
setView(activeView,true);
}
function renderProviders(){const providers=aiState?.providers||[]; $('provider-grid').innerHTML=providers.map(p=>{const d=providerDrafts[p.provider]||{apiKey:'',model:p.model||p.defaultModel,enabled:p.enabled}; const canUse=p.hasToken||String(d.apiKey||'').trim(); return '<article class="ai-provider-card '+(p.active?'active':'')+'"><div class="provider-card-head"><span class="provider-mark">'+esc((p.shortName||p.name).slice(0,2))+'</span><div><strong>'+esc(p.name)+'</strong><span>'+esc(p.description)+'</span></div></div><div class="provider-status-line"><span class="status-pill '+(p.active?'success':p.hasToken?'neutral':'muted')+'">'+(p.active?'Active':p.hasToken?'Connected':'Token needed')+'</span><small>'+esc(p.keyHint||p.protocol)+'</small></div><div class="provider-capability"><span>Protocol</span><strong>'+esc(p.protocol)+'</strong></div><div class="field"><label>Model</label><input data-provider="'+esc(p.provider)+'" data-field="model" value="'+esc(d.model)+'"></div><div class="field"><label>API token</label><input autocomplete="off" data-provider="'+esc(p.provider)+'" data-field="apiKey" placeholder="'+(p.hasToken?'Saved token hidden':'Paste provider token')+'" type="password" value="'+esc(d.apiKey||'')+'"></div><div class="provider-card-actions"><label class="check-row"><input data-provider="'+esc(p.provider)+'" data-field="enabled" type="checkbox" '+(d.enabled?'checked':'')+'>Enabled</label><div class="actions"><button class="btn" data-provider="'+esc(p.provider)+'" data-action="save" type="button">Save</button><button class="btn primary" data-provider="'+esc(p.provider)+'" data-action="use" '+(canUse?'':'disabled')+' type="button">Use</button></div></div></article>';}).join('');}
function providerById(id){return (aiState?.providers||[]).find(p=>p.provider===id);}
async function saveProvider(id,makeActive){const provider=providerById(id); if(!provider)return; const draft=providerDrafts[id]||{apiKey:'',model:provider.model||provider.defaultModel,enabled:provider.enabled}; setStatus(makeActive?'Connecting '+provider.name:'Saving '+provider.name); const response=await authed('/api/ai/provider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:id,apiKey:String(draft.apiKey||'').trim()||undefined,model:String(draft.model||provider.defaultModel).trim(),enabled:draft.enabled,makeActive})}); if(response.ok){aiState=await response.json(); providerDrafts[id]={...draft,apiKey:''}; syncProviderDrafts(); render(); setStatus(makeActive?provider.name+' connected':provider.name+' saved');}else setStatus('Add a token before activating this provider');}
function renderDocuments(){const query=($('document-filter').value||'').toLowerCase().trim(); const docs=project.documents.filter(d=>!query||(d.title+' '+(d.tags||[]).join(' ')).toLowerCase().includes(query)); $('knowledge-showing-count').textContent=String(docs.length); $('document-list').innerHTML=docs.length?docs.map(d=>'<button class="document-row '+(selected?.id===d.id?'active':'')+'" data-id="'+esc(d.id)+'"><strong>'+esc(d.title)+'</strong><span>'+(d.enabled?'Enabled':'Disabled')+' - '+documentWords(d)+'</span><span class="document-tags">'+((d.tags||[]).slice(0,4).map(tag=>'<small>'+esc(tag)+'</small>').join('')||'<small>No tags</small>')+'</span></button>').join(''):'<p class="empty-state">No matching documents.</p>'; $('document-list').onclick=e=>{const row=e.target.closest('button[data-id]'); if(!row)return; selected=project.documents.find(d=>d.id===row.dataset.id); renderDocuments(); renderEditor();};}
function renderEditor(){if(!selected){$('editor').innerHTML='<p class="empty-state">Select or create a document.</p>';return;} const isEnabled=selected.enabled!==false; $('editor').innerHTML='<div class="editor-title-row"><div><span class="metric-label">Selected document</span><h3>'+esc(selected.title||'Untitled document')+'</h3><small>'+documentWords(selected)+' in this source</small></div><span class="status-pill '+(isEnabled?'success':'muted')+'">'+(isEnabled?'Enabled':'Disabled')+'</span></div><div class="grid two"><div class="field"><label>Title</label><input id="title" value="'+esc(selected.title)+'"></div><div class="field"><label>Tags</label><input id="tags" value="'+esc((selected.tags||[]).join(', '))+'"></div></div><div class="field"><label>Content</label><textarea class="document-textarea" id="content">'+esc(selected.content)+'</textarea></div><div class="editor-footer"><label class="check-row"><input id="enabled" type="checkbox" '+(isEnabled?'checked':'')+'>Enabled for AI</label><div class="actions"><button class="btn" id="new-document-inline" type="button">New</button><button class="btn primary" id="save-document" type="button">Save document</button></div></div>'; $('editor').oninput=e=>{const target=e.target;if(target.id==='title'){selected.title=target.value; const title=$('editor').querySelector('.editor-title-row h3'); if(title)title.textContent=target.value||'Untitled document';}if(target.id==='tags')selected.tags=target.value.split(',').map(x=>x.trim()).filter(Boolean);if(target.id==='content')selected.content=target.value;if(target.id==='enabled'){selected.enabled=target.checked; renderEditor();}}; $('save-document').onclick=saveDocument; $('new-document-inline').onclick=startDraft;}
function renderEvents(){const rows=project.events.map(e=>'<div class="event-row"><i class="fa-solid fa-bolt" aria-hidden="true"></i><strong>'+esc(eventType(e.type))+'</strong><span>'+esc(e.guideSlug||e.path||'runtime-ai')+'</span><small>'+esc(eventTime(e.createdAt))+'</small></div>').join(''); $('events').innerHTML=rows||'<p class="empty-state">No events yet.</p>'; $('overview-events').innerHTML=project.events.length?project.events.slice(0,4).map(e=>'<div class="event-row"><strong>'+esc(eventType(e.type))+'</strong><span>'+esc(e.guideSlug||e.path||'runtime-ai')+'</span><small>'+esc(eventTime(e.createdAt))+'</small></div>').join(''):'<p class="empty-state">No events yet. Open the demo to generate activity.</p>';}
async function saveDocument(){setStatus('Saving document'); const response=await authed('/api/admin/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project.publicId,id:selected.id||undefined,title:selected.title,content:selected.content,tags:selected.tags||[],enabled:selected.enabled!==false})}); if(!response.ok){setStatus('Document save failed');return;} const payload=await response.json(); await load(payload.document.id); setStatus('Document saved');}
async function saveSettings(){setStatus('Saving project settings'); const response=await authed('/api/admin/project',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('settings-name').value,domain:$('settings-domain').value||null,theme:{accent:$('settings-accent').value,logoText:$('settings-logo').value}})}); if(!response.ok){setStatus('Project settings save failed');return;} await load(selected?.id); setStatus('Project settings saved');}
function clearDemoClientState(){try{const prefix='ai-guide-widget:'+project.publicId+':'; for(let index=localStorage.length-1;index>=0;index-=1){const key=localStorage.key(index); if(key&&key.startsWith(prefix))localStorage.removeItem(key);}}catch(error){}}
async function resetDemo(){const confirm=$('reset-confirm').value.trim(); if(project.publicId!=='demo-project'){setStatus('Reset is available only for the demo project');return;} if(confirm!=='RESET_DEMO'){setStatus('Type RESET_DEMO before resetting');return;} setStatus('Resetting demo project'); $('reset-demo').disabled=true; const response=await authed('/api/admin/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm})}); if(!response.ok){setStatus('Demo reset failed');$('reset-demo').disabled=false;return;} clearDemoClientState(); providerDrafts={}; $('document-filter').value=''; $('reset-confirm').value=''; await load('doc_demo_overview'); setStatus('Demo reset to clean seed');}
function startDraft(){selected={...emptyDoc,tags:[...emptyDoc.tags]}; renderEditor(); setStatus('Draft document');}
document.querySelectorAll('[data-view]').forEach(button=>{button.onclick=()=>setView(button.dataset.view);});
document.addEventListener('click',e=>{const target=e.target.closest('[data-view-go]'); if(!target)return; setView(target.dataset.viewGo);});
window.addEventListener('hashchange',()=>{const next=location.hash.replace('#',''); if(views.includes(next))setView(next,true);});
$('new-document').onclick=startDraft;
$('new-document-secondary').onclick=startDraft;
$('document-filter').oninput=renderDocuments;
$('provider-grid').oninput=e=>{const target=e.target;if(!target.dataset.provider)return;const id=target.dataset.provider;const provider=providerById(id)||{};providerDrafts[id]=providerDrafts[id]||{apiKey:'',model:provider.model||provider.defaultModel||'',enabled:provider.enabled};if(target.dataset.field==='model')providerDrafts[id].model=target.value;if(target.dataset.field==='apiKey')providerDrafts[id].apiKey=target.value;const card=target.closest('.ai-provider-card');const useButton=card&&card.querySelector('button[data-action="use"]');if(useButton)useButton.disabled=!(provider.hasToken||String(providerDrafts[id].apiKey||'').trim());};
$('provider-grid').onchange=e=>{const target=e.target;if(target.dataset.field!=='enabled')return;const id=target.dataset.provider;const provider=providerById(id)||{};providerDrafts[id]=providerDrafts[id]||{apiKey:'',model:provider.model||provider.defaultModel||'',enabled:provider.enabled};providerDrafts[id].enabled=target.checked;};
$('provider-grid').onclick=e=>{const button=e.target.closest('button[data-provider]'); if(!button)return; saveProvider(button.dataset.provider,button.dataset.action==='use');};
async function activateRulesFallback(){setStatus('Switching to rules fallback'); const response=await authed('/api/ai/provider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'rules'})}); if(response.ok){aiState=await response.json(); syncProviderDrafts(); render(); setStatus('Rules fallback active');}}
$('rules-fallback').onclick=activateRulesFallback;
$('header-rules-fallback').onclick=activateRulesFallback;
$('copy-snippet').onclick=async()=>{const value=snippet(); if(!value){setStatus('Project-specific snippet is still loading');return;} await navigator.clipboard.writeText(value); setStatus('Install snippet copied');};
$('header-copy-snippet').onclick=()=>$('copy-snippet').click();
$('save-settings').onclick=saveSettings;
$('reset-confirm').oninput=()=>{$('reset-demo').disabled=$('reset-confirm').value.trim()!=='RESET_DEMO';};
$('reset-demo').onclick=resetDemo;
$('logout').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'}); location.href='/login';};
initialView();
load();`;
}

async function serveStatic(reqPath, res) {
  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(publicDir, safePath);
  if (!fullPath.startsWith(publicDir)) {
    json(res, 403, { error: "Forbidden" });
    return true;
  }
  if (!existsSync(fullPath)) {
    return false;
  }
  const ext = path.extname(fullPath);
  send(res, 200, await readFile(fullPath), {
    "Content-Type": mime[ext] || "application/octet-stream",
    "Cache-Control": reqPath.startsWith("widget/") ? "no-store" : "public, max-age=300"
  });
  return true;
}

async function serveFontAwesome(reqPath, res) {
  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(fontAwesomeDir, safePath);
  if (!fullPath.startsWith(fontAwesomeDir)) {
    json(res, 403, { error: "Forbidden" });
    return true;
  }
  if (!existsSync(fullPath)) {
    return false;
  }
  const ext = path.extname(fullPath);
  send(res, 200, await readFile(fullPath), {
    "Content-Type": mime[ext] || "application/octet-stream",
    "Cache-Control": "public, max-age=86400"
  });
  return true;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${port}`}`);
    if (req.method === "OPTIONS") return send(res, 204, "");

    const session = adminSession(req);

    if (url.pathname === "/login") {
      if (session) return redirect(res, "/admin");
      return send(res, 200, loginHtml(), { "Content-Type": mime[".html"] });
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const input = await bodyJson(req);
      const verified = await verifyAdminLogin(input.email, input.password);
      if (!verified) {
        return json(res, 401, { error: "Invalid email or password" });
      }
      return json(res, 200, { ok: true, email: verified.email }, {
        "Set-Cookie": sessionCookie(createSessionToken(verified.email, verified.projectId))
      });
    }

    if (url.pathname === "/api/auth/register" && req.method === "POST") {
      const input = await bodyJson(req);
      if (!String(input.email || "").includes("@") || String(input.password || "").length < 8) {
        return json(res, 400, { error: "Email and an 8-character password are required" });
      }
      const user = await createRegisteredUser(input);
      if (!user) return json(res, 409, { error: "User already exists" });
      return json(res, 200, { ok: true, email: user.email }, {
        "Set-Cookie": sessionCookie(createSessionToken(user.email, user.projectId))
      });
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    }

    if (url.pathname === "/api/auth/session") {
      if (!session) return json(res, 401, { authenticated: false });
      return json(res, 200, { authenticated: true, user: { email: session.email, projectId: session.projectId || null }, expiresAt: session.expiresAt });
    }

    if (url.pathname === "/") {
      return send(res, 200, presentationHtml(session), { "Content-Type": mime[".html"] });
    }
    if (url.pathname === "/admin") {
      if (!session) return redirect(res, "/login");
      return send(res, 200, adminHtml(session), { "Content-Type": mime[".html"] });
    }
    if (url.pathname === "/demo") return send(res, 200, demoHtml(), { "Content-Type": mime[".html"] });
    if (url.pathname === "/preview.css") return send(res, 200, previewCss() + adminExtraCss(), { "Content-Type": mime[".css"] });
    if (url.pathname.startsWith("/fontawesome/")) {
      if (await serveFontAwesome(url.pathname.slice("/fontawesome/".length), res)) return;
    }
    if (url.pathname === "/preview-admin.js") {
      if (!session) return json(res, 401, { error: "Unauthorized" });
      return send(res, 200, adminDocumentJs(), { "Content-Type": mime[".js"] });
    }
    if (url.pathname === "/favicon.svg" || url.pathname.startsWith("/widget/") || url.pathname.startsWith("/robot/") || url.pathname.startsWith("/landing/")) {
      if (await serveStatic(url.pathname.slice(1), res)) return;
    }

    if (url.pathname === "/api/widget/config") {
      const store = await readStore();
      const publicId = url.searchParams.get("projectId");
      if (!publicId) return json(res, 400, { error: "projectId is required" });
      const project = store.projects.find((item) => item.publicId === publicId);
      if (!project) return json(res, 404, { error: "Project not found" });
      if (!isAllowedWidgetDomain(project.domain, req)) return json(res, 403, { error: "Origin is not allowed for this project" });
      return json(res, 200, {
        projectId: project.publicId,
        projectName: project.name,
        domain: project.domain,
        theme: project.theme,
        guides: store.guides.filter((guide) => guide.projectId === project.id && guide.enabled).map(publicGuide)
      });
    }

    if (url.pathname === "/api/admin/project" && req.method === "GET") {
      if (!session) return json(res, 401, { error: "Unauthorized" });
      const store = await readStore();
      const project = adminProjectForSession(store, session);
      if (!project) return json(res, 404, { error: "No project exists." });
      return json(res, 200, adminProjectPayload(store, project));
    }

    if (url.pathname === "/api/admin/project" && req.method === "PATCH") {
      if (!session) return json(res, 401, { error: "Unauthorized" });
      const input = await bodyJson(req);
      const store = await readStore();
      const project = adminProjectForSession(store, session);
      if (!project) return json(res, 404, { error: "No project exists." });
      if (typeof input.name === "string" && input.name.trim()) project.name = input.name.trim();
      if ("domain" in input) project.domain = input.domain ? String(input.domain).trim() : null;
      project.theme = {
        ...project.theme,
        accent: input.theme?.accent || project.theme.accent,
        logoText: input.theme?.logoText || project.theme.logoText
      };
      project.updatedAt = new Date().toISOString();
      await writeStore(store);
      return json(res, 200, adminProjectPayload(store, project));
    }

    if (url.pathname === "/api/admin/reset" && req.method === "POST") {
      if (!session) return json(res, 401, { error: "Unauthorized" });
      const input = await bodyJson(req);
      if (input.confirm !== "RESET_DEMO") {
        return json(res, 400, { error: "Type RESET_DEMO to reset the demo." });
      }
      const store = await readStore();
      const project = adminProjectForSession(store, session);
      if (!project || project.publicId !== "demo-project") {
        return json(res, 400, { error: "Reset is available only for the demo project." });
      }
      const resetProject = await resetProjectToSeed(store, project);
      if (!resetProject) return json(res, 404, { error: "Demo seed data is missing." });
      return json(res, 200, { ok: true, project: adminProjectPayload(store, resetProject) });
    }

    if (url.pathname === "/api/ai/status") {
      if (!session) return json(res, 401, { error: "Unauthorized" });
      const store = await readStore();
      const project = adminProjectForSession(store, session);
      if (!project) return json(res, 404, { error: "No project exists." });
      return json(res, 200, providerDashboard(store, project));
    }

    if (url.pathname === "/api/ai/provider" && req.method === "GET") {
      if (!session) return json(res, 401, { error: "Unauthorized" });
      const store = await readStore();
      const project = adminProjectForSession(store, session);
      if (!project) return json(res, 404, { error: "No project exists." });
      return json(res, 200, providerDashboard(store, project));
    }

    if (url.pathname === "/api/ai/provider" && req.method === "POST") {
      if (!session) return json(res, 401, { error: "Unauthorized" });
      const input = await bodyJson(req);
      const store = await readStore();
      const project = adminProjectForSession(store, session);
      if (!project) return json(res, 404, { error: "No project exists." });
      if (input.provider === "rules") {
        project.activeAiProvider = null;
        project.updatedAt = new Date().toISOString();
        await writeStore(store);
        return json(res, 200, providerDashboard(store, project));
      }
      if (!providerIds.has(input.provider)) {
        return json(res, 400, { error: "Invalid provider" });
      }
      if (!upsertPreviewProvider(store, project, input)) {
        return json(res, 400, { error: "Invalid provider" });
      }
      await writeStore(store);
      return json(res, 200, providerDashboard(store, project));
    }

    if (url.pathname === "/api/admin/guides" && req.method === "POST") {
      if (!session) return json(res, 401, { error: "Unauthorized" });
      const input = await bodyJson(req);
      const store = await readStore();
      const project = adminProjectForSession(store, session);
      if (project?.publicId !== input.projectId) return json(res, 404, { error: "Project not found" });
      if (!project) return json(res, 404, { error: "Project not found" });
      const existing = store.guides.findIndex((guide) => guide.projectId === project.id && guide.slug === input.slug);
      const guide = { id: existing >= 0 ? store.guides[existing].id : `guide_${Date.now()}`, projectId: project.id, slug: input.slug, title: input.title, intent: input.intent, aliases: input.aliases || [], urlPattern: input.urlPattern || null, enabled: true, steps: input.steps || [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      if (existing >= 0) store.guides[existing] = { ...store.guides[existing], ...guide };
      else store.guides.push(guide);
      await writeStore(store);
      return json(res, 200, { ok: true, guide: publicGuide(guide) });
    }

    if (url.pathname === "/api/admin/documents" && req.method === "POST") {
      if (!session) return json(res, 401, { error: "Unauthorized" });
      const input = await bodyJson(req);
      const store = await readStore();
      const project = adminProjectForSession(store, session);
      if (project?.publicId !== input.projectId) return json(res, 404, { error: "Project not found" });
      if (!project) return json(res, 404, { error: "Project not found" });
      const existing = input.id
        ? store.documents.findIndex((document) => document.projectId === project.id && document.id === input.id)
        : -1;
      const now = new Date().toISOString();
      const document = {
        id: existing >= 0 ? store.documents[existing].id : `doc_${Date.now()}`,
        projectId: project.id,
        title: input.title,
        content: input.content,
        tags: input.tags || [],
        enabled: input.enabled !== false,
        createdAt: existing >= 0 ? store.documents[existing].createdAt : now,
        updatedAt: now
      };
      if (existing >= 0) store.documents[existing] = document;
      else store.documents.push(document);
      await writeStore(store);
      return json(res, 200, { ok: true, document: publicDocument(document) });
    }

    if (url.pathname === "/api/ai/ask" && req.method === "POST") {
      const input = await bodyJson(req);
      const store = await readStore();
      const project = store.projects.find((item) => item.publicId === input.projectId);
      if (!project) return json(res, 404, { error: "Project not found" });
      const documents = store.documents
        .filter((document) => document.projectId === project.id && document.enabled !== false)
        .map(publicDocument);
      const decision = await chooseGuide(
        input.question,
        documents,
        input.path || "",
        input.metadata || [],
        input.completedSteps || [],
        input.mode || "start",
        input.pageLanguage || ""
      );
      const guide = decision.guide;
      if (decision.answer) {
        return json(res, 200, {
          type: "answer",
          source: decision.source,
          message: decision.answer
        });
      }
      if (!guide) {
        return json(res, 200, {
          type: "fallback",
          source: decision.source,
          message:
            input.mode === "next"
              ? "Done. I do not see another safe step on this screen."
              : "I could not find a safe visible element for that task. Try asking in a different way."
        });
      }
      return json(res, 200, { type: "guide", source: decision.source, message: guide.steps[0]?.message || guide.title, guide });
    }

    if (url.pathname === "/api/events" && req.method === "POST") {
      const input = await bodyJson(req);
      const store = await readStore();
      const project = store.projects.find((item) => item.publicId === input.projectId);
      if (!project) return json(res, 404, { error: "Project not found" });
      store.events.unshift({ id: `event_${Date.now()}`, projectId: project.id, type: input.type, guideSlug: input.guideSlug, stepIndex: input.stepIndex, path: input.path, metadata: input.metadata, createdAt: new Date().toISOString() });
      store.events = store.events.slice(0, 200);
      await writeStore(store);
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: "Not found" });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    json(res, status, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.listen(port, () => {
  console.log(`Smartup SFA preview server running at http://localhost:${port}`);
});
